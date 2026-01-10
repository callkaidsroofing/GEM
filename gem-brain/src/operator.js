/**
 * GEM Operator - Conversational AI Engine
 *
 * Combines LLM intelligence with tool execution for natural conversation.
 * Handles memory, context, and multi-turn interactions.
 * 
 * KEY FIX: Default mode is now 'execute' - tools run automatically.
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
 * 
 * IMPORTANT: default_mode is 'execute' so tools actually run!
 */
const DEFAULT_CONFIG = {
  clarify_threshold: 0.7,
  auto_execute_tiers: ['T0', 'T1', 'T2'],
  require_approval_domains: ['invoice', 'payment'],
  max_tools_per_plan: 10,
  default_mode: 'execute',  // CHANGED: was 'analyze' - tools now run by default
  verbose: false,
  enable_memory: true,
  memory_limit: 50,
  llm: {
    model: 'anthropic/claude-3-5-haiku-20241022',
    temperature: 0.4  // Slightly higher for more natural variation
  }
};

/**
 * Human-style system instruction
 * 
 * Focus: Natural conversation, warmth, directness
 */
const DEFAULT_INSTRUCTION = `You are GEM, the operator assistant for Call Kaids Roofing. Think of yourself as a helpful colleague who happens to have access to all the business systems.

YOUR PERSONALITY:
- Warm and friendly, like a trusted coworker
- Direct and efficient - don't waste words
- Proactive - anticipate what they need next
- Honest about limitations - if you can't do something, say so
- Use casual language: contractions, short sentences, occasional humor when appropriate

HOW TO RESPOND:
- Start with the action or answer, not "I'll help you with that"
- Keep it conversational - imagine you're texting a colleague
- When executing tools, briefly confirm what you did and the result
- Suggest next steps naturally, like "Want me to also..."
- If something fails, explain simply and offer alternatives

EXAMPLES OF GOOD RESPONSES:
- "Done! Created a task to call John tomorrow. Need anything else?"
- "System's healthy - queue is clear, no errors in the last hour."
- "New lead added for Sarah in Penrith. Should I schedule an inspection?"
- "Hmm, that didn't work - looks like HighLevel isn't connected yet. Want me to check the API key?"

EXAMPLES OF BAD RESPONSES (avoid these):
- "I have successfully executed the os.health_check tool and the results indicate..."
- "Certainly! I'd be happy to help you with that request. Let me..."
- "The tool execution has completed with the following status: succeeded"

TOOL EXECUTION:
- When you identify a tool to run, just run it - don't ask for permission unless it's destructive
- After running tools, summarize the result naturally
- If a tool fails, explain what went wrong in plain English

CONTEXT AWARENESS:
- Remember what we've talked about in this session
- If they mention a lead or job, keep track of it for follow-up questions
- Reference previous context naturally: "For that Penrith lead we just created..."

You have access to tools for: system health, tasks, notes, leads, quotes, and HighLevel integration.`;

/**
 * Operator class - main conversational engine
 */
export class Operator {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.instruction = options.instruction || DEFAULT_INSTRUCTION;
    this.memory = null;
    this.mode = this.config.default_mode;
    this.approved = true;  // CHANGED: Start approved so tools can run
    this.context = {};
    this.initialized = false;
    this.lastToolResult = null;  // Track last result for follow-ups
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
    try {
      const { data, error } = await supabase
        .from('brain_instructions')
        .select('instruction')
        .eq('is_default', true)
        .maybeSingle();

      if (!error && data?.instruction) {
        this.instruction = data.instruction;
      }
    } catch (e) {
      // Ignore - use default instruction
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
      // First, check if this maps to a tool
      const ruleResult = planFromRules(message, this.context);
      
      let response = '';
      let toolResults = null;

      // If we have tool calls, EXECUTE THEM FIRST
      if (ruleResult.toolCalls.length > 0) {
        // Check if this needs approval (destructive operations)
        const needsApproval = this.needsApproval(ruleResult.toolCalls);
        
        if (needsApproval && !this.approved) {
          // Ask for approval
          const toolNames = ruleResult.toolCalls.map(c => c.tool_name).join(', ');
          response = `This will run: ${toolNames}. Say "yes" or ":approve" to proceed.`;
          await this.memory.addAssistant(response, { pending_approval: true });
          return {
            ok: true,
            response,
            pending: ruleResult.toolCalls,
            mode: this.mode
          };
        }

        // EXECUTE THE TOOLS
        const brainResult = await runBrain({
          message,
          mode: 'enqueue_and_wait',
          context: this.context,
          limits: { 
            max_tool_calls: this.config.max_tools_per_plan,
            wait_timeout_ms: 30000
          }
        });

        toolResults = brainResult;
        this.lastToolResult = brainResult;

        // Extract any IDs from results for context
        this.extractContextFromResults(brainResult);

        // Add tool results to memory
        for (const receipt of brainResult.receipts || []) {
          await this.memory.addToolResult(receipt.tool_name, receipt);
        }

        // Now get LLM to summarize the results naturally
        const systemPrompt = this.buildSystemPrompt();
        const history = this.memory.getHistory(10);

        const summaryPrompt = this.buildResultsSummaryPrompt(message, brainResult);

        const llmResponse = await chatCompletion(
          systemPrompt,
          history,
          summaryPrompt,
          { 
            model: this.config.llm.model, 
            temperature: this.config.llm.temperature 
          }
        );

        response = llmResponse.content;

      } else {
        // No tools - just have a conversation
        const systemPrompt = this.buildSystemPrompt();
        const history = this.memory.getHistory(15);

        const llmResponse = await chatCompletion(
          systemPrompt,
          history,
          message,
          {
            model: this.config.llm.model,
            temperature: this.config.llm.temperature
          }
        );

        response = llmResponse.content;
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
      console.error('Operator error:', error);
      const errorResponse = `Ran into an issue: ${error.message}. Want me to try again?`;
      await this.memory.addAssistant(errorResponse, { error: true });
      
      return {
        ok: false,
        response: errorResponse,
        error: error.message
      };
    }
  }

  /**
   * Build a natural summary prompt for tool results
   */
  buildResultsSummaryPrompt(originalMessage, brainResult) {
    const receipts = brainResult.receipts || [];
    const succeeded = receipts.filter(r => r.status === 'succeeded');
    const failed = receipts.filter(r => r.status === 'failed');
    const notConfigured = receipts.filter(r => r.status === 'not_configured');

    let prompt = `The user asked: "${originalMessage}"\n\n`;

    if (succeeded.length > 0) {
      prompt += `SUCCEEDED:\n`;
      for (const r of succeeded) {
        prompt += `- ${r.tool_name}: ${JSON.stringify(r.result)}\n`;
      }
    }

    if (failed.length > 0) {
      prompt += `\nFAILED:\n`;
      for (const r of failed) {
        prompt += `- ${r.tool_name}: ${r.result?.error || 'Unknown error'}\n`;
      }
    }

    if (notConfigured.length > 0) {
      prompt += `\nNOT CONFIGURED:\n`;
      for (const r of notConfigured) {
        prompt += `- ${r.tool_name}: ${r.result?.reason || 'Missing configuration'}\n`;
      }
    }

    if (receipts.length === 0) {
      prompt += `No results received (tools may still be processing).`;
    }

    prompt += `\n\nRespond naturally to the user about what happened. Be conversational, not robotic. If something failed, explain simply and suggest what to do.`;

    return prompt;
  }

  /**
   * Extract context (IDs) from tool results
   */
  extractContextFromResults(brainResult) {
    for (const receipt of brainResult.receipts || []) {
      if (receipt.status === 'succeeded' && receipt.result) {
        if (receipt.result.lead_id) {
          this.context.lead_id = receipt.result.lead_id;
          this.memory.setContext('lead_id', receipt.result.lead_id);
        }
        if (receipt.result.task_id) {
          this.context.task_id = receipt.result.task_id;
          this.memory.setContext('task_id', receipt.result.task_id);
        }
        if (receipt.result.note_id) {
          this.context.note_id = receipt.result.note_id;
          this.memory.setContext('note_id', receipt.result.note_id);
        }
        if (receipt.result.job_id) {
          this.context.job_id = receipt.result.job_id;
          this.memory.setContext('job_id', receipt.result.job_id);
        }
        if (receipt.result.quote_id) {
          this.context.quote_id = receipt.result.quote_id;
          this.memory.setContext('quote_id', receipt.result.quote_id);
        }
      }
    }
  }

  /**
   * Check if tools need explicit approval
   */
  needsApproval(toolCalls) {
    const dangerousDomains = this.config.require_approval_domains;
    
    for (const call of toolCalls) {
      const domain = call.tool_name.split('.')[0];
      if (dangerousDomains.includes(domain)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Process with rules only (no LLM)
   */
  async processWithRulesOnly(message) {
    const ruleResult = planFromRules(message, this.context);

    if (ruleResult.toolCalls.length === 0) {
      const response = `Got it: "${message}"\n\n${ruleResult.reason}\n\nTry: ${getHelpText()}`;
      await this.memory.addAssistant(response);
      return {
        ok: true,
        response,
        mode: this.mode
      };
    }

    // Execute the tools
    const brainResult = await runBrain({
      message,
      mode: 'enqueue_and_wait',
      context: this.context,
      limits: { max_tool_calls: this.config.max_tools_per_plan }
    });

    this.lastToolResult = brainResult;
    this.extractContextFromResults(brainResult);

    // Build a simple response
    let response = brainResult.assistant_message || 'Done.';
    
    // Add next actions if any
    if (brainResult.next_actions?.length > 0) {
      response += '\n\nNext: ' + brainResult.next_actions.join(', ');
    }

    await this.memory.addAssistant(response);

    return {
      ok: brainResult.ok,
      response,
      toolResults: brainResult,
      mode: this.mode
    };
  }

  /**
   * Build system prompt with context
   */
  buildSystemPrompt() {
    let prompt = this.instruction;

    // Add current context
    if (Object.keys(this.context).length > 0) {
      prompt += `\n\nCURRENT CONTEXT (reference these naturally):\n`;
      for (const [key, value] of Object.entries(this.context)) {
        prompt += `- ${key}: ${value}\n`;
      }
    }

    // Add last result context if relevant
    if (this.lastToolResult?.receipts?.length > 0) {
      const lastReceipt = this.lastToolResult.receipts[this.lastToolResult.receipts.length - 1];
      prompt += `\nLAST ACTION: ${lastReceipt.tool_name} - ${lastReceipt.status}`;
    }

    return prompt;
  }

  /**
   * Handle operator commands
   */
  async handleCommand(command) {
    const parts = command.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Handle "yes" as approval
    if (cmd === 'yes' || cmd === 'y') {
      return this.cmdApprove();
    }

    switch (cmd) {
      case 'help':
      case 'h':
        return this.cmdHelp();
      
      case 'mode':
        return this.cmdMode(args[0]);
      
      case 'approve':
        return this.cmdApprove();
      
      case 'context':
      case 'ctx':
        return this.cmdContext(args[0], args.slice(1).join(' '));
      
      case 'clear':
        return this.cmdClear();
      
      case 'memory':
      case 'mem':
        return this.cmdMemory();
      
      case 'memory-clear':
        return this.cmdMemoryClear();
      
      case 'new':
        return this.cmdMemoryNew();
      
      case 'remember':
      case 'note':
        return this.cmdRemember(args.join(' '));
      
      case 'history':
      case 'hist':
        return this.cmdHistory(parseInt(args[0]) || 10);
      
      case 'config':
        return this.cmdConfig();
      
      case 'config-set':
        return this.cmdConfigSet(args[0], args.slice(1).join(' '));
      
      case 'instruction':
        return this.cmdInstruction();
      
      case 'instruction-reset':
        return this.cmdInstructionReset();
      
      case 'status':
        return this.cmdStatus();
      
      case 'quit':
      case 'exit':
      case 'q':
        return { ok: true, response: 'See you! 👋', exit: true };
      
      default:
        return {
          ok: false,
          response: `Unknown command: ${cmd}. Try :help`
        };
    }
  }

  // Command implementations
  cmdHelp() {
    return {
      ok: true,
      response: `
COMMANDS:
  :status          Quick system status
  :mode <m>        Set mode (execute, plan, analyze)
  :approve         Approve pending action
  :context k v     Set context (lead_id, job_id)
  :clear           Clear context

  :memory          Memory status
  :new             New session
  :remember <txt>  Save a note
  :history [n]     Show history

  :config          Show config
  :quit            Exit

Just type naturally - I'll figure out what you need.`
    };
  }

  cmdMode(newMode) {
    const validModes = ['analyze', 'plan', 'execute'];
    if (!newMode || !validModes.includes(newMode)) {
      return {
        ok: false,
        response: `Mode: ${this.mode}\nOptions: ${validModes.join(', ')}`
      };
    }
    this.mode = newMode;
    return {
      ok: true,
      response: `Mode: ${this.mode}`
    };
  }

  cmdApprove() {
    this.approved = true;
    return {
      ok: true,
      response: `Approved! Go ahead and ask again.`
    };
  }

  async cmdContext(key, value) {
    if (!key) {
      if (Object.keys(this.context).length === 0) {
        return { ok: true, response: 'No context set.' };
      }
      const ctx = Object.entries(this.context)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      return { ok: true, response: `Context:\n${ctx}` };
    }
    
    if (value) {
      this.context[key] = value;
      await this.memory.setContext(key, value);
      return { ok: true, response: `${key} = ${value}` };
    }
    
    return {
      ok: true,
      response: `${key} = ${this.context[key] || '(not set)'}`
    };
  }

  async cmdClear() {
    this.context = {};
    this.approved = true;
    this.lastToolResult = null;
    await this.memory.clearContext();
    return { ok: true, response: 'Cleared.' };
  }

  cmdMemory() {
    const stats = this.memory.getStats();
    return {
      ok: true,
      response: `Session: ${stats.session_id?.slice(0, 8)}...
Entries: ${stats.entry_count}/${stats.memory_limit}
Context: ${stats.context_keys.join(', ') || 'none'}`
    };
  }

  async cmdMemoryClear() {
    await this.memory.clear();
    return { ok: true, response: 'Memory cleared.' };
  }

  async cmdMemoryNew() {
    await this.memory.createSession();
    this.context = {};
    this.approved = true;
    this.lastToolResult = null;
    return {
      ok: true,
      response: `New session: ${this.memory.sessionId.slice(0, 8)}...`
    };
  }

  async cmdRemember(note) {
    if (!note) {
      return { ok: false, response: 'Usage: :remember <note>' };
    }
    await this.memory.addSystem(note);
    return { ok: true, response: `Noted: "${note}"` };
  }

  cmdHistory(n) {
    const entries = this.memory.getRecent(n);
    if (entries.length === 0) {
      return { ok: true, response: 'No history yet.' };
    }
    const formatted = entries.map(e => {
      const preview = e.content.substring(0, 60);
      return `[${e.role}] ${preview}${e.content.length > 60 ? '...' : ''}`;
    }).join('\n');
    return { ok: true, response: formatted };
  }

  cmdConfig() {
    return {
      ok: true,
      response: `Mode: ${this.mode}
Approved: ${this.approved}
Memory: ${this.config.enable_memory ? 'on' : 'off'} (limit: ${this.config.memory_limit})
LLM: ${this.config.llm.model} (temp: ${this.config.llm.temperature})`
    };
  }

  cmdConfigSet(key, value) {
    if (!key || !value) {
      return { ok: false, response: 'Usage: :config-set <key> <value>' };
    }
    
    let parsedValue = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(parseFloat(value))) parsedValue = parseFloat(value);
    
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      if (this.config[parent]) {
        this.config[parent][child] = parsedValue;
      }
    } else {
      this.config[key] = parsedValue;
    }
    
    return { ok: true, response: `${key} = ${parsedValue}` };
  }

  cmdInstruction() {
    return {
      ok: true,
      response: `[Instruction preview]\n${this.instruction.substring(0, 300)}...`
    };
  }

  async cmdInstructionReset() {
    this.instruction = DEFAULT_INSTRUCTION;
    return { ok: true, response: 'Instruction reset to default.' };
  }

  async cmdStatus() {
    // Quick status check
    try {
      const brainResult = await runBrain({
        message: 'system status',
        mode: 'enqueue_and_wait',
        context: {},
        limits: { wait_timeout_ms: 10000 }
      });

      if (brainResult.ok && brainResult.receipts?.length > 0) {
        const receipt = brainResult.receipts[0];
        if (receipt.status === 'succeeded') {
          const r = receipt.result;
          return {
            ok: true,
            response: `System OK ✓
Queue: ${r.queue_depth || 0} pending
Recent: ${r.recent_calls || 0} calls, ${r.recent_failures || 0} failures
Worker: ${r.executor_status || 'unknown'}`
          };
        }
      }
      return { ok: true, response: 'Status check completed.' };
    } catch (e) {
      return { ok: false, response: `Status check failed: ${e.message}` };
    }
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
