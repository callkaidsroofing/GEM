/**
 * CKR-GEM Operator - System Intelligence Layer
 *
 * Implements the 4-layer execution model:
 * Layer 1 - Judgement: Intent classification, risk assessment, decision making
 * Layer 2 - Skills: Schema-valid artifact generation (delegates to existing validation)
 * Layer 3 - Brain: Tool call orchestration (delegates to existing brain.js)
 * Layer 4 - Worker: Execution (handled by gem-core)
 *
 * This module NEVER collapses layers - each has distinct responsibilities.
 */

import { randomUUID } from 'crypto';
import { getTool, getAllTools } from '../lib/registry.js';
import { callOpenRouterJSON } from '../llm/openrouter.js';

/**
 * PRIME DIRECTIVES (in order of precedence)
 */
const DIRECTIVES = [
  'safety_and_legal',
  'contract_correctness',
  'operational_continuity',
  'revenue_flow',
  'brand_integrity',
  'user_intent'
];

/**
 * Risk tiers for approval model
 */
const RISK_TIERS = {
  T0: { level: 0, name: 'Read/Analysis', approval_required: false },
  T1: { level: 1, name: 'Local Artifact Generation', approval_required: false },
  T2: { level: 2, name: 'Repo/Schema Change', approval_required: true },
  T3: { level: 3, name: 'External Communications', approval_required: true },
  T4: { level: 4, name: 'Irreversible/Production DB', approval_required: true }
};

/**
 * Operational domain classifications
 */
const OPERATIONAL_DOMAINS = {
  lead: { name: 'Lead Management', tools: ['leads.*'], risk_default: 'T1' },
  inspection: { name: 'Inspection Workflow', tools: ['inspection.*', 'media.*'], risk_default: 'T1' },
  quote: { name: 'Quote Management', tools: ['quote.*'], risk_default: 'T2' },
  task: { name: 'Task Management', tools: ['os.create_task', 'os.update_task', 'os.complete_task', 'os.list_tasks'], risk_default: 'T0' },
  note: { name: 'Note Management', tools: ['os.create_note', 'os.search_notes'], risk_default: 'T0' },
  job: { name: 'Job Workflow', tools: ['job.*'], risk_default: 'T2' },
  invoice: { name: 'Invoice Management', tools: ['invoice.*'], risk_default: 'T3' },
  comms: { name: 'Communications', tools: ['comms.*', 'sms.*', 'email.*'], risk_default: 'T3' },
  devops: { name: 'System Operations', tools: ['os.health_check', 'os.*_state_snapshot'], risk_default: 'T0' },
  system: { name: 'System Intelligence', tools: ['os.*'], risk_default: 'T0' }
};

/**
 * LAYER 1: JUDGEMENT
 *
 * Interprets user intent, classifies requests, identifies risks, chooses what should happen.
 * Returns decisions, NOT executions.
 */
export class JudgementLayer {
  constructor(config = {}) {
    this.config = {
      anthropic_api_key: config.anthropic_api_key || process.env.ANTHROPIC_API_KEY,
      openrouter_api_key: config.openrouter_api_key || process.env.OPENROUTER_API_KEY,
      openrouter_model: config.openrouter_model || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
      openrouter_base_url: config.openrouter_base_url || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    };
  }

  /**
   * Parse intent with full context awareness
   *
   * @param {object} input
   * @param {string} input.message - Natural language input
   * @param {object} input.context - Execution context (lead_id, job_id, etc)
   * @param {object} input.evidence - Prior state, IDs, etc
   * @returns {Promise<IntentClassification>}
   */
  async classifyIntent({ message, context = {}, evidence = {}, memoryContext = '' }) {
    if (!this.config.openrouter_api_key || this.config.openrouter_api_key.includes('PASTE_YOUR_KEY_HERE')) {
      return this._buildRefusal('LLM not configured', ['OPENROUTER_API_KEY']);
    }

    const registry = getAllTools();
    const toolShortlist = registry.map(t => ({
      name: t.name,
      description: t.description,
      required_inputs: t.input_schema?.required || []
    }));

    // Get custom system instruction if configured
    const customInstruction = this.config.system_instruction || '';

    const systemPrompt = this._buildSystemPrompt(toolShortlist, customInstruction);
    const userPrompt = this._buildUserPrompt(message, context, evidence, memoryContext);

    try {
      const parsed = await callOpenRouterJSON({
        apiKey: this.config.openrouter_api_key,
        model: this.config.openrouter_model || this.config.llm?.openrouter_model,
        baseUrl: this.config.openrouter_base_url || this.config.llm?.openrouter_base_url,
        system: systemPrompt,
        user: userPrompt
      });

      return this._validateAndEnrichIntent(parsed, message);
    } catch (error) {
      return this._buildRefusal(`LLM error: ${error.message}`, []);
    }
  }

  _buildSystemPrompt(toolShortlist, customInstruction = '') {
    // Group tools by domain for better LLM understanding
    const toolsByDomain = {};
    for (const t of toolShortlist) {
      const domain = t.name.split('.')[0];
      if (!toolsByDomain[domain]) toolsByDomain[domain] = [];
      toolsByDomain[domain].push(t.name);
    }

    const toolList = Object.entries(toolsByDomain)
      .map(([domain, tools]) => `${domain}: ${tools.join(', ')}`)
      .join('\n');

    return `You are CKR-GEM Judgement Layer. You classify intent and assess risk.

OPERATIONAL DOMAINS:
${Object.entries(OPERATIONAL_DOMAINS).map(([key, domain]) => `- ${key}: ${domain.name}`).join('\n')}

RISK TIERS:
- T0: Read/Analysis (no approval)
- T1: Local artifacts (allowed)
- T2: Schema changes (approval required)
- T3: External comms (approval required)
- T4: Irreversible ops (approval required)

AVAILABLE TOOLS BY DOMAIN (EXACT NAMES - USE THESE EXACTLY):
${toolList}

IMPORTANT: tool_candidates MUST use EXACT tool names from above. Examples:
- To create a lead use: "leads.create" (NOT "lead.create")
- To create a task use: "os.create_task" (NOT "task.create")
- To send SMS use: "comms.send_sms" (NOT "sms.send")

YOU MUST OUTPUT VALID JSON ONLY. Structure:
{
  "intent": "execute" | "refuse" | "clarify",
  "domain": "lead" | "inspection" | "quote" | "task" | "job" | "invoice" | "comms" | "devops" | "system",
  "urgency": "low" | "normal" | "high" | "critical",
  "tool_candidates": ["exact.tool_name"],
  "required_fields": ["field1", "field2"],
  "missing_evidence": ["lead_id", "phone", ...],
  "risk_tier": "T0" | "T1" | "T2" | "T3" | "T4",
  "risk_reason": "Why this tier?",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation",
  "clarifying_question": "Optional question if intent='clarify'"
}

If refusing, set intent='refuse' and explain in reasoning.
If clarification needed, set intent='clarify' and provide clarifying_question.
Never guess missing data. Only use tool names from the AVAILABLE TOOLS list.${customInstruction ? `

CUSTOM INSTRUCTIONS:
${customInstruction}` : ''}`;
  }

  _buildUserPrompt(message, context, evidence, memoryContext = '') {
    const prompt = {
      message,
      context,
      evidence,
      instruction: 'Classify this intent and identify required tools, risk tier, and missing evidence.'
    };

    // Add memory context if available
    if (memoryContext) {
      prompt.conversation_history = memoryContext;
      prompt.instruction += ' Consider the conversation history for context continuity.';
    }

    return JSON.stringify(prompt, null, 2);
  }

  _validateAndEnrichIntent(parsed, originalMessage) {
    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      return this._buildRefusal('LLM returned invalid structure', []);
    }

    if (!['execute', 'refuse', 'clarify'].includes(parsed.intent)) {
      return this._buildRefusal('Invalid intent type from LLM', []);
    }

    // If refusing or clarifying, pass through
    if (parsed.intent === 'refuse' || parsed.intent === 'clarify') {
      return {
        ...parsed,
        classification_id: randomUUID(),
        timestamp: new Date().toISOString(),
        original_message: originalMessage
      };
    }

    // Validate execute intent
    if (!parsed.domain || !OPERATIONAL_DOMAINS[parsed.domain]) {
      return this._buildRefusal('Invalid or missing domain', []);
    }

    if (!Array.isArray(parsed.tool_candidates) || parsed.tool_candidates.length === 0) {
      return this._buildRefusal('No valid tool candidates identified', []);
    }

    // Validate tools exist
    const validTools = [];
    for (const toolName of parsed.tool_candidates) {
      if (getTool(toolName)) {
        validTools.push(toolName);
      }
    }

    if (validTools.length === 0) {
      return this._buildRefusal('Tool candidates do not exist in registry', []);
    }

    // Enrich with metadata
    return {
      ...parsed,
      tool_candidates: validTools,
      classification_id: randomUUID(),
      timestamp: new Date().toISOString(),
      original_message: originalMessage,
      domain_info: OPERATIONAL_DOMAINS[parsed.domain],
      risk_info: RISK_TIERS[parsed.risk_tier] || RISK_TIERS.T0,
      approval_required: RISK_TIERS[parsed.risk_tier]?.approval_required || false
    };
  }

  _buildRefusal(reason, missing) {
    return {
      intent: 'refuse',
      reasoning: reason,
      missing_evidence: missing,
      tool_candidates: [],
      classification_id: randomUUID(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Assess if directive conflicts exist
   */
  assessDirectiveConflicts(intent, context) {
    const conflicts = [];

    // Check contract correctness (Directive 2)
    if (intent.tool_candidates) {
      for (const toolName of intent.tool_candidates) {
        const tool = getTool(toolName);
        if (!tool) {
          conflicts.push({
            directive: 'contract_correctness',
            severity: 'blocking',
            reason: `Tool ${toolName} not in registry`
          });
        }
      }
    }

    // Check operational continuity (Directive 3)
    if (intent.risk_tier === 'T4' && !context.explicit_approval) {
      conflicts.push({
        directive: 'operational_continuity',
        severity: 'warning',
        reason: 'T4 operation requires explicit approval'
      });
    }

    // Check revenue flow (Directive 4)
    if (intent.domain === 'invoice' && intent.tool_candidates.includes('invoice.void')) {
      conflicts.push({
        directive: 'revenue_flow',
        severity: 'warning',
        reason: 'Voiding invoice affects revenue - confirm intent'
      });
    }

    return conflicts;
  }
}

/**
 * LAYER 2-3: DECISION ARTIFACT GENERATOR
 *
 * Converts judgement into schema-valid Run Plans.
 * Does NOT execute - only produces validated artifacts.
 */
export class DecisionArtifactGenerator {
  /**
   * Generate Run Plan from intent classification
   *
   * @param {IntentClassification} intent
   * @returns {RunPlan}
   */
  generateRunPlan(intent) {
    if (intent.intent !== 'execute') {
      return {
        plan_id: randomUUID(),
        status: 'rejected',
        reason: intent.reasoning || intent.clarifying_question,
        tool_sequence: [],
        dependencies: [],
        estimated_risk: 'N/A',
        requires_approval: false
      };
    }

    // Determine tool ordering and dependencies
    const toolSequence = this._orderTools(intent.tool_candidates, intent.domain);
    const dependencies = this._extractDependencies(toolSequence);

    return {
      plan_id: randomUUID(),
      classification_id: intent.classification_id,
      status: 'ready',
      domain: intent.domain,
      tool_sequence: toolSequence,
      dependencies,
      estimated_risk: intent.risk_tier,
      risk_reason: intent.risk_reason,
      requires_approval: intent.approval_required,
      required_fields: intent.required_fields || [],
      missing_evidence: intent.missing_evidence || [],
      confidence: intent.confidence,
      created_at: new Date().toISOString()
    };
  }

  _orderTools(toolNames, domain) {
    // Domain-specific ordering logic
    const orderings = {
      inspection: [
        'media.create_asset',
        'inspection.create',
        'inspection.add_items',
        'inspection.generate_scope_summary'
      ],
      quote: [
        'quote.create',
        'quote.add_item',
        'quote.calculate_totals',
        'quote.finalize'
      ],
      lead: [
        'leads.create',
        'leads.update',
        'leads.convert_to_job'
      ]
    };

    const preferredOrder = orderings[domain] || [];

    // Sort tools based on preferred ordering
    const sorted = [...toolNames].sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a);
      const bIndex = preferredOrder.indexOf(b);

      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return sorted;
  }

  _extractDependencies(toolSequence) {
    const dependencies = [];

    // Known dependency patterns
    const patterns = {
      'inspection.add_items': ['inspection.create'],
      'inspection.generate_scope_summary': ['inspection.add_items'],
      'quote.create_from_inspection': ['inspection.submit'],
      'quote.add_item': ['quote.create'],
      'quote.calculate_totals': ['quote.add_item'],
      'quote.finalize': ['quote.calculate_totals']
    };

    for (let i = 0; i < toolSequence.length; i++) {
      const tool = toolSequence[i];
      const deps = patterns[tool];

      if (deps) {
        for (const dep of deps) {
          const depIndex = toolSequence.indexOf(dep);
          if (depIndex !== -1 && depIndex < i) {
            dependencies.push({
              tool: tool,
              depends_on: dep,
              reason: 'Required predecessor'
            });
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Generate verification SQL for a Run Plan
   */
  generateVerificationSQL(runPlan) {
    const queries = [];

    for (const toolName of runPlan.tool_sequence) {
      const tool = getTool(toolName);
      if (!tool) continue;

      // Generate verification query based on tool type
      if (toolName.startsWith('leads.')) {
        queries.push(`SELECT id, name, phone, status FROM leads WHERE created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC LIMIT 5;`);
      } else if (toolName.startsWith('inspection.')) {
        queries.push(`SELECT id, site_address, status FROM inspections WHERE created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC LIMIT 5;`);
      } else if (toolName.startsWith('quote.')) {
        queries.push(`SELECT id, lead_id, status, total_amount_cents FROM quotes WHERE created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC LIMIT 5;`);
      }
    }

    return queries;
  }
}

/**
 * STRUCTURED OUTPUT FORMATTER
 *
 * Enforces the mandatory output contract for all operator responses.
 */
export class StructuredOutputFormatter {
  /**
   * Format operator response
   *
   * @param {object} input
   * @param {IntentClassification} input.intent
   * @param {RunPlan} input.runPlan
   * @param {Array} input.toolCalls - Optional executed tool calls
   * @param {Array} input.receipts - Optional execution receipts
   * @returns {OperatorResponse}
   */
  format({ intent, runPlan, toolCalls = [], receipts = [] }) {
    const response = {
      operator_id: randomUUID(),
      timestamp: new Date().toISOString()
    };

    // [INTENT] section
    response.intent_summary = this._formatIntent(intent);

    // [PLAN or RESULT] section
    if (receipts.length > 0) {
      response.result_summary = this._formatResults(receipts);
    } else if (runPlan && runPlan.status === 'ready') {
      response.plan_summary = this._formatPlan(runPlan);
    } else {
      response.plan_summary = runPlan?.reason || intent.reasoning || 'No action planned';
    }

    // [TOOL IMPACT] section
    response.tool_impact = this._formatToolImpact(runPlan, toolCalls, receipts);

    // [RISKS / GATES] section
    response.risks_and_gates = this._formatRisksAndGates(intent, runPlan);

    // [NEXT ACTIONS] section
    response.next_actions = this._formatNextActions(intent, runPlan, receipts);

    return response;
  }

  _formatIntent(intent) {
    const lines = [];
    lines.push(`Domain: ${intent.domain || 'unknown'}`);
    lines.push(`Intent: ${intent.intent}`);
    if (intent.confidence) {
      lines.push(`Confidence: ${(intent.confidence * 100).toFixed(0)}%`);
    }
    if (intent.reasoning) {
      lines.push(`Reasoning: ${intent.reasoning}`);
    }
    return lines.join('\n');
  }

  _formatPlan(runPlan) {
    if (runPlan.status !== 'ready') {
      return runPlan.reason || 'Plan not ready';
    }

    const lines = [];
    lines.push(`Planned execution sequence (${runPlan.tool_sequence.length} tools):`);
    runPlan.tool_sequence.forEach((tool, index) => {
      lines.push(`  ${index + 1}. ${tool}`);
    });

    if (runPlan.dependencies.length > 0) {
      lines.push(`\nDependencies:`);
      runPlan.dependencies.forEach(dep => {
        lines.push(`  - ${dep.tool} requires ${dep.depends_on}`);
      });
    }

    return lines.join('\n');
  }

  _formatResults(receipts) {
    const succeeded = receipts.filter(r => r.status === 'succeeded').length;
    const failed = receipts.filter(r => r.status === 'failed').length;
    const notConfigured = receipts.filter(r => r.status === 'not_configured').length;

    const lines = [];
    lines.push(`Execution complete: ${receipts.length} tool(s)`);
    if (succeeded > 0) lines.push(`  ✓ ${succeeded} succeeded`);
    if (failed > 0) lines.push(`  ✗ ${failed} failed`);
    if (notConfigured > 0) lines.push(`  ⚠ ${notConfigured} not configured`);

    return lines.join('\n');
  }

  _formatToolImpact(runPlan, toolCalls, receipts) {
    if (receipts && receipts.length > 0) {
      return `Tools executed: ${receipts.map(r => r.tool_name).join(', ')}`;
    } else if (toolCalls && toolCalls.length > 0) {
      return `Tools enqueued: ${toolCalls.map(c => c.tool_name).join(', ')}`;
    } else if (runPlan && runPlan.tool_sequence && runPlan.tool_sequence.length > 0) {
      return `Tools identified: ${runPlan.tool_sequence.join(', ')}`;
    } else {
      return 'No tools involved';
    }
  }

  _formatRisksAndGates(intent, runPlan) {
    const lines = [];

    if (intent.risk_tier) {
      const riskInfo = RISK_TIERS[intent.risk_tier];
      lines.push(`Risk tier: ${intent.risk_tier} - ${riskInfo?.name || 'Unknown'}`);
    }

    if (runPlan?.requires_approval) {
      lines.push(`⚠ APPROVAL REQUIRED`);
      lines.push(`Format: APPROVE: <action_id>`);
    } else {
      lines.push(`No approval required`);
    }

    if (intent.risk_reason) {
      lines.push(`Risk reason: ${intent.risk_reason}`);
    }

    return lines.join('\n');
  }

  _formatNextActions(intent, runPlan, receipts) {
    const actions = [];

    if (intent.intent === 'clarify' && intent.clarifying_question) {
      actions.push(`Answer: ${intent.clarifying_question}`);
      return actions;
    }

    if (intent.missing_evidence && intent.missing_evidence.length > 0) {
      actions.push(`Provide missing: ${intent.missing_evidence.join(', ')}`);
    }

    if (runPlan?.requires_approval) {
      actions.push(`Review plan and provide approval`);
    } else if (runPlan?.status === 'ready') {
      actions.push(`Execute plan (${runPlan.tool_sequence.length} tools)`);
    }

    if (receipts.length > 0) {
      receipts.forEach(receipt => {
        if (receipt.status === 'succeeded' && receipt.result) {
          if (receipt.result.task_id) {
            actions.push(`Created task: ${receipt.result.task_id}`);
          }
          if (receipt.result.lead_id) {
            actions.push(`Created lead: ${receipt.result.lead_id}`);
          }
          if (receipt.result.inspection_id) {
            actions.push(`Created inspection: ${receipt.result.inspection_id}`);
          }
        }
      });
    }

    return actions;
  }
}

/**
 * QUALITY GATE
 *
 * Pre-execution validation checklist
 */
export class QualityGate {
  static check({ intent, runPlan, context }) {
    const checks = {
      schema_correct: false,
      provable_by_receipt: false,
      worker_safe: false,
      approval_obtained: false,
      safer_alternative: null
    };

    // Check schema correctness
    if (runPlan?.tool_sequence) {
      checks.schema_correct = runPlan.tool_sequence.every(toolName => {
        const tool = getTool(toolName);
        return tool && tool.input_schema && tool.output_schema;
      });
    }

    // Check receipt provability
    checks.provable_by_receipt = runPlan?.tool_sequence?.every(toolName => {
      const tool = getTool(toolName);
      return tool && tool.receipt_fields && tool.receipt_fields.length > 0;
    }) || false;

    // Check worker safety
    checks.worker_safe = !runPlan?.tool_sequence?.some(toolName => {
      // Tools that could crash worker
      return toolName.includes('unsafe') || toolName.includes('experimental');
    }) !== false;

    // Check approval
    if (runPlan?.requires_approval) {
      checks.approval_obtained = context.approval === true || context.explicit_approval === true;
    } else {
      checks.approval_obtained = true;
    }

    // Suggest safer alternatives
    if (intent.risk_tier === 'T4') {
      checks.safer_alternative = 'Consider T2 or T3 alternative if available';
    }

    return checks;
  }

  static shouldProceed(checks) {
    return checks.schema_correct && checks.provable_by_receipt && checks.worker_safe && checks.approval_obtained;
  }
}
