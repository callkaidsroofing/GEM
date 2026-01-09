/**
 * GEM Operator - Conversational AI Engine
 *
 * Combines LLM intelligence with tool execution for natural conversation.
 * Handles memory, context, and multi-turn interactions.
 */

import { randomUUID } from 'crypto';
import { supabase } from './lib/supabase.js';
import { chatCompletion, checkLLMConfig } from './lib/llm.js';
import { MemoryManager, getActiveSession } from './lib/memory.js';
import { runBrain } from './brain.js';
import { planFromRules, getHelpText } from './planner/rules.js';
import { getAllTools } from './lib/registry.js';

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  clarify_threshold: 0.7,
  auto_execute_tiers: ['T0'],
  require_approval_domains: ['invoice', 'comms'],
  max_tools_per_plan: 10,
  default_mode: 'analyze',
  verbose: false,
  enable_memory: true,
  memory_limit: 50,
  llm: {
    model: 'anthropic/claude-3-5-haiku-20241022',
    temperature: 0.3
  }
};

/**
 * Default system instruction
 */
const DEFAULT_INSTRUCTION = `You are CKR-GEM, the system operator intelligence for the Call Kaids Roofing GEM platform.

PRIME DIRECTIVES (in order of priority):
1. Safety, confidentiality, and legal compliance
2. Contract correctness (tools.registry.json is LAW)
3. Operational continuity (Render worker + queue stability)
4. Revenue flow (lead → inspection → quote → job → payment → review)
5. Brand integrity (Call Kaids Roofing)
6. User intent and speed

EXECUTION MODEL (4 layers, never collapse):
- Layer 1: JUDGEMENT - Interpret intent, assess risk, decide mode
- Layer 2: PLANNING - Map to registry tools, validate schemas
- Layer 3: EXECUTION - Enqueue calls, wait for receipts
- Layer 4: RESPONSE - Summarize results, suggest next actions

PERSONALITY:
- Professional but approachable - you're a trusted colleague, not a robot
- Concise but thorough - give complete answers without unnecessary padding
- Proactive about risks and next steps - anticipate what they'll need
- Natural conversational tone - use contractions, vary sentence structure
- Remember context - reference previous interactions when relevant
- Show understanding - acknowledge the situation before diving into solutions

RESPONSE STYLE:
- Start with acknowledgment or context when appropriate
- Give the direct answer or action first
- Explain reasoning briefly if helpful
- Suggest logical next steps
- Keep it conversational, not bullet-pointed unless listing items

TOOL EXECUTION:
- Only use tools defined in tools.registry.json
- Always validate input against schemas before enqueueing
- Report receipts clearly but naturally
- Suggest logical next actions based on results

MEMORY:
- Remember conversation context within session
- Reference previous interactions when relevant
- Track lead_id, job_id, quote_id context
- Note important details for future reference

When you don't know something or can't do something, say so directly and suggest alternatives.`;

/**
 * Operator class - main conversational engine
 */
export class Operator {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.instruction = options.instruction || DEFAULT_INSTRUCTION;
    this.memory = null;
    this.mode = this.config.default_mode;
    this.approved = false;
    this.context = {};
    this.initialized = false;
  }

  /**
   * Initialize the operator with memory
   */
  async init(sessionId = null) {
    // Initialize memory
    this.memory = new MemoryManager({
      memoryLimit: this.config.memory_limit
    });
    await this.memory.init(sessionId);

    // Load context from memory
    this.context = this.memory.getContext() || {};

    // Try to load custom instruction from database
    await this.loadInstruction();

    this.initialized = true;
    return this;
  }

  /**
   * Load instruction from database
   */
  async loadInstruction() {
    const { data, error } = await supabase
      .from('brain_instructions')
      .select('instruction')
      .eq('is_default', true)
      .maybeSingle();

    if (!error && data?.instruction) {
      this.instruction = data.instruction;
    }
  }

  /**
   * Process a user message
   */
  async process(message) {
    if (!this.initialized) {
      await this.init();
    }

    // Check for command
    if (message.startsWith(':')) {
      return this.handleCommand(message);
    }

    // Add user message to memory
    await this.memory.addUser(message);

    // Check LLM availability
    const llmConfig = checkLLMConfig();

    if (!llmConfig.configured) {
      // Fall back to rules-only mode
      return this.processWithRulesOnly(message);
    }

    // Process with LLM
    return this.processWithLLM(message);
  }

  /**
   * Process with LLM for natural conversation
   */
  async processWithLLM(message) {
    try {
      // Build context for LLM
      const systemPrompt = this.buildSystemPrompt();
      const history = this.memory.getHistory(20); // Last 20 entries

      // First, check if this maps to a tool
      const ruleResult = planFromRules(message, this.context);
      
      // Build enhanced prompt with tool context
      let enhancedMessage = message;
      if (ruleResult.toolCalls.length > 0) {
        enhancedMessage = `User message: "${message}"

I've identified this maps to tool: ${ruleResult.toolCalls.map(c => c.tool_name).join(', ')}
Mode: ${this.mode}, Approved: ${this.approved}

Based on the mode and approval status, decide how to respond.`;
      }

      // Get LLM response
      const llmResponse = await chatCompletion(
        systemPrompt,
        history,
        enhancedMessage,
        {
          model: this.config.llm.model,
          temperature: this.config.llm.temperature
        }
      );

      let response = llmResponse.content;
      let toolResults = null;

      // If we have tool calls and mode allows execution
      if (ruleResult.toolCalls.length > 0) {
        if (this.mode === 'execute' || 
            (this.mode === 'enqueue' && this.approved) ||
            this.shouldAutoExecute(ruleResult.toolCalls)) {
          
          // Execute the tools
          const brainResult = await runBrain({
            message,
            mode: 'enqueue_and_wait',
            context: this.context,
            limits: { max_tool_calls: this.config.max_tools_per_plan }
          });

          toolResults = brainResult;

          // Add tool results to memory
          for (const receipt of brainResult.receipts || []) {
            await this.memory.addToolResult(receipt.tool_name, receipt);
          }

          // Get LLM to summarize the results naturally
          const summaryPrompt = `Tool execution completed. Results:
${JSON.stringify(brainResult.receipts, null, 2)}

Summarize these results naturally for the user. Be conversational, not robotic.`;

          const summaryResponse = await chatCompletion(
            systemPrompt,
            history,
            summaryPrompt,
            { model: this.config.llm.model, temperature: this.config.llm.temperature }
          );

          response = summaryResponse.content;
        }
      }

      // Add assistant response to memory
      await this.memory.addAssistant(response, {
        tool_results: toolResults ? true : false,
        mode: this.mode
      });

      return {
        ok: true,
        response,
        toolResults,
        mode: this.mode
      };

    } catch (error) {
      const errorResponse = `I ran into an issue: ${error.message}. Let me know if you'd like me to try a different approach.`;
      await this.memory.addAssistant(errorResponse, { error: true });
      
      return {
        ok: false,
        response: errorResponse,
        error: error.message
      };
    }
  }

  /**
   * Process with rules only (no LLM)
   */
  async processWithRulesOnly(message) {
    const ruleResult = planFromRules(message, this.context);

    if (ruleResult.toolCalls.length === 0) {
      const response = `I understand you said: "${message}"\n\n${ruleResult.reason}\n\n${getHelpText()}`;
      await this.memory.addAssistant(response);
      return {
        ok: true,
        response,
        mode: this.mode
      };
    }

    // Execute if mode allows
    if (this.mode === 'execute' || this.shouldAutoExecute(ruleResult.toolCalls)) {
      const brainResult = await runBrain({
        message,
        mode: 'enqueue_and_wait',
        context: this.context,
        limits: { max_tool_calls: this.config.max_tools_per_plan }
      });

      const response = brainResult.assistant_message;
      await this.memory.addAssistant(response);

      return {
        ok: brainResult.ok,
        response,
        toolResults: brainResult,
        mode: this.mode
      };
    }

    // Just show the plan
    const response = `I would execute: ${ruleResult.toolCalls.map(c => c.tool_name).join(', ')}\n\nUse :approve to execute, or :mode execute to auto-execute.`;
    await this.memory.addAssistant(response);

    return {
      ok: true,
      response,
      planned: ruleResult.toolCalls,
      mode: this.mode
    };
  }

  /**
   * Check if tools should auto-execute
   */
  shouldAutoExecute(toolCalls) {
    // T0 tools (read-only, safe) can auto-execute
    const safeTools = [
      'os.health_check',
      'os.list_tasks',
      'os.search_notes',
      'leads.list_by_stage',
      'integrations.highlevel.health_check'
    ];

    return toolCalls.every(c => safeTools.includes(c.tool_name));
  }

  /**
   * Build system prompt with context
   */
  buildSystemPrompt() {
    let prompt = this.instruction;

    // Add current context
    if (Object.keys(this.context).length > 0) {
      prompt += `\n\nCURRENT CONTEXT:\n${JSON.stringify(this.context, null, 2)}`;
    }

    // Add mode info
    prompt += `\n\nCURRENT MODE: ${this.mode}`;
    prompt += `\nAPPROVAL STATUS: ${this.approved ? 'approved' : 'not approved'}`;

    // Add available tools summary
    const tools = getAllTools();
    const toolSummary = tools.slice(0, 20).map(t => `- ${t.name}: ${t.description}`).join('\n');
    prompt += `\n\nAVAILABLE TOOLS (sample):\n${toolSummary}\n... and ${tools.length - 20} more`;

    return prompt;
  }

  /**
   * Handle operator commands
   */
  async handleCommand(command) {
    const parts = command.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        return this.cmdHelp();
      
      case 'mode':
        return this.cmdMode(args[0]);
      
      case 'approve':
        return this.cmdApprove();
      
      case 'context':
        return this.cmdContext(args[0], args.slice(1).join(' '));
      
      case 'clear':
        return this.cmdClear();
      
      case 'memory':
        return this.cmdMemory();
      
      case 'memory-clear':
        return this.cmdMemoryClear();
      
      case 'memory-new':
        return this.cmdMemoryNew();
      
      case 'remember':
        return this.cmdRemember(args.join(' '));
      
      case 'history':
        return this.cmdHistory(parseInt(args[0]) || 10);
      
      case 'config':
        return this.cmdConfig();
      
      case 'config-set':
        return this.cmdConfigSet(args[0], args.slice(1).join(' '));
      
      case 'instruction':
        return this.cmdInstruction();
      
      case 'instruction-reset':
        return this.cmdInstructionReset();
      
      case 'quit':
      case 'exit':
        return { ok: true, response: 'Goodbye!', exit: true };
      
      default:
        return {
          ok: false,
          response: `Unknown command: ${cmd}. Type :help for available commands.`
        };
    }
  }

  // Command implementations
  cmdHelp() {
    return {
      ok: true,
      response: `
Commands:
  MODE & EXECUTION
    :mode <mode>          Set mode (analyze, plan, enqueue, execute)
    :approve              Toggle approval flag
    :context <key> <val>  Set context value (lead_id, job_id, etc)
    :clear                Clear context and approval

  MEMORY
    :memory               Show memory status
    :memory-clear         Clear all memory
    :memory-new           Start new session
    :remember <note>      Add a system note
    :history [n]          Show last n history entries

  CONFIGURATION
    :config               Show current config
    :config-set <k> <v>   Set config value
    :instruction          Show system instruction
    :instruction-reset    Reset to default instruction

  GENERAL
    :quit                 Exit
    :help                 Show this help`
    };
  }

  cmdMode(newMode) {
    const validModes = ['analyze', 'plan', 'enqueue', 'execute'];
    if (!newMode || !validModes.includes(newMode)) {
      return {
        ok: false,
        response: `Invalid mode. Valid modes: ${validModes.join(', ')}\nCurrent mode: ${this.mode}`
      };
    }
    this.mode = newMode;
    return {
      ok: true,
      response: `Mode set to: ${this.mode}`
    };
  }

  cmdApprove() {
    this.approved = !this.approved;
    return {
      ok: true,
      response: `Approval ${this.approved ? 'granted' : 'revoked'}`
    };
  }

  async cmdContext(key, value) {
    if (!key) {
      return {
        ok: true,
        response: `Current context:\n${JSON.stringify(this.context, null, 2)}`
      };
    }
    
    if (value) {
      this.context[key] = value;
      await this.memory.setContext(key, value);
      return {
        ok: true,
        response: `Context set: ${key} = ${value}`
      };
    }
    
    return {
      ok: true,
      response: `${key} = ${this.context[key] || '(not set)'}`
    };
  }

  async cmdClear() {
    this.context = {};
    this.approved = false;
    await this.memory.clearContext();
    return {
      ok: true,
      response: 'Context and approval cleared'
    };
  }

  cmdMemory() {
    const stats = this.memory.getStats();
    return {
      ok: true,
      response: `[MEMORY STATUS]
  Session: ${stats.session_id}
  Entries: ${stats.entry_count}/${stats.memory_limit}
  Context keys: ${stats.context_keys.join(', ') || '(none)'}
  Oldest: ${stats.oldest_entry || 'N/A'}
  Newest: ${stats.newest_entry || 'N/A'}`
    };
  }

  async cmdMemoryClear() {
    await this.memory.clear();
    return {
      ok: true,
      response: 'Memory cleared'
    };
  }

  async cmdMemoryNew() {
    await this.memory.createSession();
    this.context = {};
    this.approved = false;
    return {
      ok: true,
      response: `New session created: ${this.memory.sessionId}`
    };
  }

  async cmdRemember(note) {
    if (!note) {
      return {
        ok: false,
        response: 'Usage: :remember <note>'
      };
    }
    await this.memory.addSystem(note);
    return {
      ok: true,
      response: `Noted: "${note}"`
    };
  }

  cmdHistory(n) {
    const entries = this.memory.getRecent(n);
    const formatted = entries.map(e => 
      `[${e.role}] ${e.content.substring(0, 100)}${e.content.length > 100 ? '...' : ''}`
    ).join('\n');
    return {
      ok: true,
      response: `Last ${entries.length} entries:\n${formatted}`
    };
  }

  cmdConfig() {
    return {
      ok: true,
      response: `[CONFIGURATION]
  Behavior:
    clarify_threshold: ${this.config.clarify_threshold}
    auto_execute_tiers: ${JSON.stringify(this.config.auto_execute_tiers)}
    require_approval_domains: ${JSON.stringify(this.config.require_approval_domains)}
    max_tools_per_plan: ${this.config.max_tools_per_plan}
    default_mode: "${this.config.default_mode}"
    verbose: ${this.config.verbose}
    enable_memory: ${this.config.enable_memory}
    memory_limit: ${this.config.memory_limit}
  LLM:
    model: ${this.config.llm.model}
    temperature: ${this.config.llm.temperature}`
    };
  }

  cmdConfigSet(key, value) {
    if (!key || !value) {
      return {
        ok: false,
        response: 'Usage: :config-set <key> <value>'
      };
    }
    
    // Parse value
    let parsedValue = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(parseFloat(value))) parsedValue = parseFloat(value);
    
    // Handle nested keys
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      if (this.config[parent]) {
        this.config[parent][child] = parsedValue;
      }
    } else {
      this.config[key] = parsedValue;
    }
    
    return {
      ok: true,
      response: `Config set: ${key} = ${parsedValue}`
    };
  }

  cmdInstruction() {
    return {
      ok: true,
      response: `[SYSTEM INSTRUCTION]\n${this.instruction.substring(0, 500)}...`
    };
  }

  async cmdInstructionReset() {
    this.instruction = DEFAULT_INSTRUCTION;
    return {
      ok: true,
      response: 'Instruction reset to default'
    };
  }

  /**
   * Get session ID
   */
  getSessionId() {
    return this.memory?.sessionId;
  }
}

/**
 * Create and initialize an operator instance
 */
export async function createOperator(sessionId = null, options = {}) {
  const operator = new Operator(options);
  await operator.init(sessionId);
  return operator;
}

export default {
  Operator,
  createOperator,
  DEFAULT_CONFIG,
  DEFAULT_INSTRUCTION
};
