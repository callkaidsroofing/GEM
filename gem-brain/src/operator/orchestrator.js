/**
 * CKR-GEM Operator Orchestrator V2
 *
 * Enhanced orchestrator implementing the High Council architecture:
 * - Layer 0: Context Hydration (ledger + conversation history)
 * - Layer 1: Judgement (intent classification)
 * - Layer 2: Skills (run plan generation)
 * - Layer 3: Brain (orchestration)
 * - Layer 4: Worker (execution)
 * - Layer 5: Ledger Update (persist state)
 *
 * New features:
 * - Durable memory via ledger system
 * - Auto-inject conversation history
 * - V21 action IDs
 * - Quiet hours enforcement
 */

import { randomUUID } from 'crypto';
import {
  JudgementLayer,
  DecisionArtifactGenerator,
  StructuredOutputFormatter,
  QualityGate
} from './operator.js';
import { runBrain } from '../brain.js';
import { supabase } from '../lib/supabase.js';
import { OperatorMemory, getSharedMemory } from './memory.js';
import { OperatorConfig, getSharedConfig } from './config.js';
import { OperatorRAG, getSharedRAG } from './rag.js';

// V2 Components
import { OperatorLedger, getSharedLedger } from './ledger.js';
import { ContextInjection, getSharedContextInjection } from '../llm/context-injection.js';
import { generateV21ActionId, inferActionType, generateSlugFromMessage } from './action-id.js';
import { QuietHoursManager, getSharedQuietHours } from './quiet-hours.js';

/**
 * Orchestrator configuration
 */
export class OperatorOrchestrator {
  constructor(config = {}) {
    // Load shared config and merge with passed config
    this.operatorConfig = config.operatorConfig || getSharedConfig();
    const mergedConfig = {
      ...this.operatorConfig.getAll(),
      ...config
    };

    this.judgement = new JudgementLayer(mergedConfig);
    this.artifactGen = new DecisionArtifactGenerator();
    this.formatter = new StructuredOutputFormatter();
    this.config = mergedConfig;

    // Initialize memory if enabled
    if (this.config.behavior?.enable_memory !== false) {
      this.memory = config.memory || getSharedMemory({
        maxHistory: this.config.behavior?.memory_limit || 50
      });
    } else {
      this.memory = null;
    }

    // Initialize RAG
    this.rag = config.rag || getSharedRAG();

    // V2: Initialize ledger system
    if (this.config.behavior?.enable_ledger !== false) {
      this.ledger = config.ledger || getSharedLedger();
    } else {
      this.ledger = null;
    }

    // V2: Initialize context injection
    if (this.config.behavior?.enable_context_injection !== false) {
      this.contextInjection = config.contextInjection || getSharedContextInjection();
    } else {
      this.contextInjection = null;
    }

    // V2: Initialize quiet hours
    if (this.config.behavior?.enable_quiet_hours !== false) {
      this.quietHours = config.quietHours || getSharedQuietHours({
        start: this.config.quiet_hours?.start,
        end: this.config.quiet_hours?.end,
        timezone: this.config.quiet_hours?.timezone
      });
    } else {
      this.quietHours = null;
    }

    // V2: Action ID generation enabled
    this.enableActionId = this.config.behavior?.enable_v21_action_id !== false;
  }

  /**
   * Main entry point: process natural language input through all layers
   *
   * @param {object} input
   * @param {string} input.message - Natural language message
   * @param {object} input.context - Execution context
   * @param {string} input.mode - 'analyze', 'plan', 'enqueue', 'execute'
   * @param {boolean} input.explicit_approval - User has approved T2+ operations
   * @returns {Promise<OperatorResponse>}
   */
  async process({ message, context = {}, mode = 'analyze', explicit_approval = false }) {
    const startTime = Date.now();

    // V2: Generate V21 action ID for this operation
    const actionType = inferActionType(context.tool_hint || '');
    const slug = generateSlugFromMessage(message);
    const actionId = this.enableActionId
      ? generateV21ActionId(actionType, slug)
      : randomUUID();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`CKR-GEM OPERATOR V2 - ACTION: ${actionId}`);
    console.log(`${'='.repeat(80)}\n`);

    // ═══════════════════════════════════════════════════════════════════════════
    // LAYER 0: CONTEXT HYDRATION (V2)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('[LAYER 0: CONTEXT HYDRATION]');

    // V2: Store user message in conversation history
    if (this.contextInjection) {
      this.contextInjection.appendUser(message, { action_id: actionId });
    }

    // V2: Load ledger context
    let ledgerContext = '';
    if (this.ledger) {
      ledgerContext = this.ledger.buildContextPacket();
      console.log(`Ledger: Session ${this.ledger.getSessionId().slice(-12)}`);
      const openLoops = this.ledger.getOpenLoops();
      if (openLoops.length > 0) {
        console.log(`Open loops: ${openLoops.length}`);
      }
    }

    // V2: Load conversation history
    let conversationContext = '';
    if (this.contextInjection) {
      const summary = this.contextInjection.getSummary();
      conversationContext = this.contextInjection.buildContextBlock();
      console.log(`Conversation: ${summary.total} messages (${summary.user} user, ${summary.assistant} assistant)`);
    }

    // Store message in memory (existing behavior)
    let messageId = null;
    if (this.memory) {
      messageId = this.memory.addMessage(message, 'user');

      // Merge memory context with provided context
      const memoryContext = this.memory.getAllContext();
      context = { ...memoryContext, ...context };
    }

    // V2: Inject action ID into context
    context.action_id = actionId;

    console.log();

    try {
      // Build memory context for LLM
      const memoryBlock = this.memory ? this.memory.buildLLMContext() : '';

      // Query RAG for relevant context
      console.log('[RAG QUERY]');
      const ragResults = await this.rag.query(message, context);
      const ragContext = this.rag.buildContextBlock(ragResults);
      const ragSummary = `Leads: ${ragResults.leads.length}, Tasks: ${ragResults.tasks.length}, Jobs: ${ragResults.jobs.length}`;
      console.log(`Found: ${ragSummary}\n`);

      // V2: Combine all context sources (ledger, conversation, memory, RAG)
      const fullContext = [
        ledgerContext,
        conversationContext,
        memoryBlock,
        ragContext
      ].filter(Boolean).join('\n\n');

      // LAYER 1: JUDGEMENT - Classify intent and assess risk
      console.log('[LAYER 1: JUDGEMENT]');
      const intent = await this.judgement.classifyIntent({
        message,
        context,
        evidence: await this._gatherEvidence(context),
        memoryContext: fullContext
      });

      console.log(`Intent: ${intent.intent}`);
      console.log(`Domain: ${intent.domain || 'N/A'}`);
      console.log(`Risk: ${intent.risk_tier || 'N/A'}`);
      console.log(`Confidence: ${intent.confidence ? (intent.confidence * 100).toFixed(0) + '%' : 'N/A'}\n`);

      // Check for directive conflicts
      const conflicts = this.judgement.assessDirectiveConflicts(intent, { explicit_approval });
      if (conflicts.some(c => c.severity === 'blocking')) {
        console.log('[DIRECTIVE CONFLICT DETECTED]');
        conflicts.forEach(c => console.log(`  ${c.directive}: ${c.reason}`));

        return this.formatter.format({
          intent: {
            ...intent,
            intent: 'refuse',
            reasoning: `Directive conflict: ${conflicts[0].reason}`
          },
          runPlan: null
        });
      }

      // Handle non-execute intents
      if (intent.intent === 'refuse') {
        return this.formatter.format({ intent, runPlan: null });
      }

      if (intent.intent === 'clarify') {
        return this.formatter.format({
          intent,
          runPlan: {
            status: 'needs_clarification',
            reason: intent.clarifying_question
          }
        });
      }

      // LAYER 2: SKILLS - Generate schema-valid Run Plan
      console.log('[LAYER 2: SKILLS]');
      const runPlan = this.artifactGen.generateRunPlan(intent);

      console.log(`Plan ID: ${runPlan.plan_id}`);
      console.log(`Status: ${runPlan.status}`);
      console.log(`Tools: ${runPlan.tool_sequence.length}\n`);

      if (runPlan.status !== 'ready') {
        return this.formatter.format({ intent, runPlan });
      }

      // Quality Gate Check
      console.log('[QUALITY GATE]');
      const qualityChecks = QualityGate.check({ intent, runPlan, context: { explicit_approval } });

      console.log(`Schema correct: ${qualityChecks.schema_correct}`);
      console.log(`Provable by receipt: ${qualityChecks.provable_by_receipt}`);
      console.log(`Worker safe: ${qualityChecks.worker_safe}`);
      console.log(`Approval obtained: ${qualityChecks.approval_obtained}\n`);

      if (!QualityGate.shouldProceed(qualityChecks)) {
        console.log('[QUALITY GATE FAILED]');

        if (!qualityChecks.approval_obtained) {
          return this.formatter.format({
            intent,
            runPlan: {
              ...runPlan,
              status: 'awaiting_approval',
              reason: 'This operation requires explicit approval before execution'
            }
          });
        }

        return this.formatter.format({
          intent,
          runPlan: {
            ...runPlan,
            status: 'quality_gate_failed',
            reason: 'Quality checks failed: ' + JSON.stringify(qualityChecks)
          }
        });
      }

      // Mode: analyze - stop after classification and planning
      if (mode === 'analyze') {
        console.log('[MODE: ANALYZE - Stopping after Layer 2]');

        // Store intent in memory even for analyze mode
        if (this.memory) {
          this.memory.addIntent(intent, messageId);
        }

        const analyzeResponse = this.formatter.format({ intent, runPlan });
        analyzeResponse.action_id = actionId;
        return analyzeResponse;
      }

      // Mode: plan - return plan for manual approval
      if (mode === 'plan') {
        console.log('[MODE: PLAN - Awaiting approval]');
        const verificationSQL = this.artifactGen.generateVerificationSQL(runPlan);

        const planResponse = this.formatter.format({
          intent,
          runPlan: {
            ...runPlan,
            verification_sql: verificationSQL
          }
        });
        planResponse.action_id = actionId;
        return planResponse;
      }

      // LAYER 3: BRAIN - Delegate to existing brain orchestration
      console.log('[LAYER 3: BRAIN - Orchestration]');

      // Check if approval required but not in execute mode
      if (runPlan.requires_approval && !explicit_approval && mode !== 'execute') {
        console.log('[APPROVAL REQUIRED - Halting before Layer 3]');
        return this.formatter.format({
          intent,
          runPlan: {
            ...runPlan,
            status: 'awaiting_approval',
            reason: `${intent.risk_tier} operation requires explicit approval. Use mode='execute' with explicit_approval=true`
          }
        });
      }

      // V2: Quiet Hours Check - block external communications during quiet hours
      if (this.quietHours && runPlan.tool_sequence?.length > 0) {
        const blockedTools = [];
        const queuedActions = [];

        for (const toolName of runPlan.tool_sequence) {
          const quietCheck = this.quietHours.shouldProceed(toolName, {
            override: context.emergency_override,
            overrideReason: context.override_reason
          });

          if (!quietCheck.proceed) {
            console.log(`[QUIET HOURS] Tool blocked: ${toolName}`);
            console.log(`  Reason: ${quietCheck.message}`);
            console.log(`  Queued until: ${quietCheck.queueUntilFormatted}`);

            blockedTools.push({
              tool: toolName,
              reason: quietCheck.reason,
              queueUntil: quietCheck.queueUntilFormatted
            });

            // Queue the action for later
            queuedActions.push(this.quietHours.queueAction({
              tool: toolName,
              message,
              context,
              action_id: actionId
            }));
          }
        }

        // If ALL tools were blocked, return queued response
        if (blockedTools.length === runPlan.tool_sequence.length) {
          console.log('[QUIET HOURS] All tools blocked - queuing for later\n');

          // Log to ledger
          if (this.ledger) {
            this.ledger.logRun({
              type: 'quiet_hours_blocked',
              action_id: actionId,
              message: message.slice(0, 50),
              status: 'QUEUED',
              tools: blockedTools.map(b => b.tool).join(', ')
            });
          }

          return this.formatter.format({
            intent,
            runPlan: {
              ...runPlan,
              status: 'queued_quiet_hours',
              reason: `External communications blocked during quiet hours. Queued for ${blockedTools[0].queueUntil}`,
              queued_actions: queuedActions.map(q => q.id)
            }
          });
        }

        // If some tools were blocked, log warning but continue with others
        if (blockedTools.length > 0) {
          console.log(`[QUIET HOURS] ${blockedTools.length} tools queued, continuing with others\n`);
        }
      }

      // Convert Run Plan to Brain request (pass intent for tool input extraction)
      const brainRequest = this._convertPlanToBrainRequest(runPlan, message, context, mode, intent);

      console.log(`Delegating to brain.js...`);
      console.log(`Pre-planned calls: ${brainRequest.prePlannedCalls?.length || 0}`);
      console.log(`Brain mode: ${brainRequest.mode}\n`);

      // LAYER 3 & 4: Brain orchestrates, Worker executes
      const brainResponse = await runBrain(brainRequest);

      console.log('[BRAIN RESPONSE]');
      console.log(`OK: ${brainResponse.ok}`);
      console.log(`Enqueued: ${brainResponse.enqueued.length}`);
      console.log(`Receipts: ${brainResponse.receipts.length}\n`);

      // Format final response
      const operatorResponse = this.formatter.format({
        intent,
        runPlan,
        toolCalls: brainResponse.enqueued,
        receipts: brainResponse.receipts
      });

      // Add brain metadata
      operatorResponse.brain_run_id = brainResponse.run_id;
      operatorResponse.brain_ok = brainResponse.ok;
      operatorResponse.execution_time_ms = Date.now() - startTime;

      // Store execution result in memory
      if (this.memory) {
        this.memory.addIntent(intent, messageId);
        this.memory.addExecution(operatorResponse, runPlan?.plan_id);

        // Extract and cache any entity IDs from receipts
        this._extractAndCacheEntities(brainResponse.receipts);
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // LAYER 5: LEDGER UPDATE (V2)
      // ═══════════════════════════════════════════════════════════════════════════
      console.log('[LAYER 5: LEDGER UPDATE]');

      // V2: Store assistant response in conversation history
      if (this.contextInjection) {
        const responseContent = operatorResponse.result_summary ||
          operatorResponse.plan_summary ||
          `Executed: ${runPlan.tool_sequence.join(', ')}`;
        this.contextInjection.appendAssistant(responseContent, {
          action_id: actionId,
          brain_ok: brainResponse.ok
        });
      }

      // V2: Log run to ledger
      if (this.ledger) {
        this.ledger.logRun({
          type: 'execution',
          action_id: actionId,
          intent: intent.intent,
          message: message.slice(0, 50),
          status: brainResponse.ok ? 'OK' : 'FAILED',
          tool_impact: runPlan.tool_sequence.join(', '),
          receipts: brainResponse.receipts.length
        });

        // Log significant decisions
        if (intent.risk_tier && ['T2', 'T3', 'T4'].includes(intent.risk_tier)) {
          this.ledger.appendDecision(
            `Executed ${intent.risk_tier} operation: ${intent.intent}`,
            intent.reasoning || 'User requested with approval',
            {
              risk_tier: intent.risk_tier,
              tools: runPlan.tool_sequence,
              approval: explicit_approval ? 'explicit' : 'implicit'
            }
          );
        }

        console.log(`Logged to RUN_LOG.md`);
      }

      // V2: Add action ID to response
      operatorResponse.action_id = actionId;

      console.log();
      console.log('[OPERATOR V2 COMPLETE]');
      console.log(`Action: ${actionId}`);
      console.log(`Duration: ${operatorResponse.execution_time_ms}ms\n`);
      console.log(`${'='.repeat(80)}\n`);

      return operatorResponse;

    } catch (error) {
      console.error('[OPERATOR ERROR]', error);

      const errorResponse = this.formatter.format({
        intent: {
          intent: 'refuse',
          reasoning: `Operator error: ${error.message}`,
          classification_id: randomUUID(),
          timestamp: new Date().toISOString()
        },
        runPlan: null
      });

      // Store error in memory
      if (this.memory) {
        this.memory.addMessage(`Error: ${error.message}`, 'system');
      }

      // V2: Log error to ledger
      if (this.ledger) {
        this.ledger.logRun({
          type: 'error',
          action_id: actionId,
          message: message.slice(0, 50),
          status: 'FAILED',
          error: error.message
        });
      }

      // V2: Store error in conversation history
      if (this.contextInjection) {
        this.contextInjection.appendAssistant(`Error: ${error.message}`, {
          action_id: actionId,
          error: true
        });
      }

      // V2: Add action ID to error response
      errorResponse.action_id = actionId;

      return errorResponse;
    }
  }

  /**
   * Extract entity IDs from receipts and cache them in memory
   */
  _extractAndCacheEntities(receipts) {
    if (!this.memory || !receipts) return;

    for (const receipt of receipts) {
      const result = receipt.result || {};

      // Cache common entity IDs
      if (result.lead_id) {
        this.memory.setContext('lead_id', result.lead_id);
      }
      if (result.inspection_id) {
        this.memory.setContext('inspection_id', result.inspection_id);
      }
      if (result.quote_id) {
        this.memory.setContext('quote_id', result.quote_id);
      }
      if (result.job_id) {
        this.memory.setContext('job_id', result.job_id);
      }
      if (result.task_id) {
        this.memory.setContext('task_id', result.task_id);
      }
      if (result.entity_id) {
        this.memory.setContext('entity_id', result.entity_id);
      }
    }
  }

  /**
   * Interactive CLI mode - presents structured output and handles approval flow
   */
  async interactive({ message, context = {} }) {
    console.log('\n' + '═'.repeat(80));
    console.log('CKR-GEM INTERACTIVE OPERATOR');
    console.log('═'.repeat(80) + '\n');

    // Step 1: Analyze
    console.log('📊 ANALYZING REQUEST...\n');
    const analysis = await this.process({ message, context, mode: 'analyze' });

    // Display structured output
    this._displayStructuredOutput(analysis);

    // Step 2: Check if approval needed
    if (analysis.risks_and_gates?.includes('APPROVAL REQUIRED')) {
      console.log('\n⚠️  This operation requires approval.');
      console.log('To proceed, call:');
      console.log(`  orchestrator.process({ message: "${message}", mode: "execute", explicit_approval: true })\n`);
      return analysis;
    }

    // Step 3: Check if clarification needed
    if (analysis.intent_summary?.includes('clarify')) {
      console.log('\n❓ Clarification needed - please provide more information.\n');
      return analysis;
    }

    // Step 4: Offer to execute
    if (analysis.plan_summary?.includes('Planned execution')) {
      console.log('\n✓ Plan ready for execution.');
      console.log('To execute, call:');
      console.log(`  orchestrator.process({ message: "${message}", mode: "enqueue_and_wait" })\n`);
    }

    return analysis;
  }

  /**
   * Display structured output in terminal-friendly format
   */
  _displayStructuredOutput(response) {
    console.log('[INTENT]');
    console.log(response.intent_summary);
    console.log();

    if (response.result_summary) {
      console.log('[RESULT]');
      console.log(response.result_summary);
    } else {
      console.log('[PLAN]');
      console.log(response.plan_summary);
    }
    console.log();

    console.log('[TOOL IMPACT]');
    console.log(response.tool_impact);
    console.log();

    console.log('[RISKS / GATES]');
    console.log(response.risks_and_gates);
    console.log();

    console.log('[NEXT ACTIONS]');
    if (response.next_actions && response.next_actions.length > 0) {
      response.next_actions.forEach((action, idx) => {
        console.log(`  ${idx + 1}. ${action}`);
      });
    } else {
      console.log('  None');
    }
    console.log();
  }

  /**
   * Gather evidence from database based on context
   */
  async _gatherEvidence(context) {
    const evidence = {};

    try {
      // Gather lead evidence
      if (context.lead_id) {
        const { data, error } = await supabase
          .from('leads')
          .select('id, name, phone, suburb, status')
          .eq('id', context.lead_id)
          .single();

        if (!error && data) {
          evidence.lead = data;
        }
      }

      // Gather inspection evidence
      if (context.inspection_id) {
        const { data, error } = await supabase
          .from('inspections')
          .select('id, lead_id, site_address, status')
          .eq('id', context.inspection_id)
          .single();

        if (!error && data) {
          evidence.inspection = data;
        }
      }

      // Gather quote evidence
      if (context.quote_id) {
        const { data, error } = await supabase
          .from('quotes')
          .select('id, lead_id, status, total_amount_cents')
          .eq('id', context.quote_id)
          .single();

        if (!error && data) {
          evidence.quote = data;
        }
      }

      // Gather job evidence
      if (context.job_id) {
        const { data, error } = await supabase
          .from('jobs')
          .select('id, lead_id, quote_id, status')
          .eq('id', context.job_id)
          .single();

        if (!error && data) {
          evidence.job = data;
        }
      }
    } catch (error) {
      console.warn('Evidence gathering failed:', error.message);
    }

    return evidence;
  }

  /**
   * Convert Run Plan to Brain request format
   */
  _convertPlanToBrainRequest(runPlan, originalMessage, context, mode, intent = null) {
    // Determine brain mode based on operator mode
    let brainMode = 'plan';
    if (mode === 'enqueue') {
      brainMode = 'enqueue';
    } else if (mode === 'enqueue_and_wait' || mode === 'execute') {
      brainMode = 'enqueue_and_wait';
    }

    // Build pre-planned tool calls from the run plan
    const prePlannedCalls = this._buildToolCalls(runPlan, context, originalMessage, intent);

    return {
      message: originalMessage,
      mode: brainMode,
      context,
      prePlannedCalls,
      limits: {
        max_tool_calls: runPlan.tool_sequence.length,
        wait_timeout_ms: 30000
      }
    };
  }

  /**
   * Build tool call objects from run plan
   */
  _buildToolCalls(runPlan, context, message, intent) {
    if (!runPlan?.tool_sequence || runPlan.tool_sequence.length === 0) {
      return [];
    }

    return runPlan.tool_sequence.map(toolName => {
      // Build input from context and intent
      const input = this._extractToolInput(toolName, context, message, intent);

      return {
        tool_name: toolName,
        input
      };
    });
  }

  /**
   * Extract tool input from context and message
   */
  _extractToolInput(toolName, context, message, intent) {
    const input = {};

    // Tools that need no input
    const noInputTools = [
      'os.health_check',
      'os.list_tasks',
      'finance.generate_cashflow_snapshot',
      'finance.generate_pnl_snapshot'
    ];

    if (noInputTools.includes(toolName)) {
      return input;
    }

    // Copy relevant context IDs
    if (context.lead_id && toolName.includes('lead')) {
      input.lead_id = context.lead_id;
    }
    if (context.inspection_id && toolName.includes('inspection')) {
      input.inspection_id = context.inspection_id;
    }
    if (context.quote_id && toolName.includes('quote')) {
      input.quote_id = context.quote_id;
    }
    if (context.job_id && toolName.includes('job')) {
      input.job_id = context.job_id;
    }
    if (context.task_id && toolName.includes('task')) {
      input.task_id = context.task_id;
    }
    if (context.entity_id && toolName.includes('entity')) {
      input.entity_id = context.entity_id;
    }

    // Extract from message for common tools
    if (toolName === 'os.create_task') {
      input.title = message.replace(/^(create|add|new)\s*(task|todo)[\s:.-]*/i, '').trim() || message;
      input.domain = 'business';
      input.priority = /urgent|asap/i.test(message) ? 'high' : 'normal';
    }

    if (toolName === 'os.create_note') {
      input.title = message.substring(0, 100);
      input.content = message;
      input.domain = 'business';
    }

    if (toolName === 'leads.create') {
      // Try to extract phone and name from message
      const phoneMatch = message.match(/0\d{9}/);
      const nameMatch = message.match(/(?:for|from|named?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);

      if (phoneMatch) input.phone = phoneMatch[0];
      if (nameMatch) input.name = nameMatch[1];
      input.source = 'operator';
    }

    // Tools that need domain parameter
    if (['os.get_state_snapshot', 'os.refresh_state_snapshot'].includes(toolName)) {
      input.domain = context.domain || 'business';
    }

    return input;
  }

  /**
   * Batch processing mode - process multiple messages
   */
  async batch({ messages, context = {}, mode = 'analyze' }) {
    const results = [];

    for (const message of messages) {
      console.log(`\nProcessing: "${message}"`);
      const result = await this.process({ message, context, mode });
      results.push({
        message,
        result
      });
    }

    return {
      total: messages.length,
      results,
      summary: this._summarizeBatch(results)
    };
  }

  _summarizeBatch(results) {
    const summary = {
      total: results.length,
      successful: 0,
      failed: 0,
      needs_approval: 0,
      needs_clarification: 0
    };

    results.forEach(r => {
      if (r.result.brain_ok) {
        summary.successful++;
      } else if (r.result.risks_and_gates?.includes('APPROVAL REQUIRED')) {
        summary.needs_approval++;
      } else if (r.result.intent_summary?.includes('clarify')) {
        summary.needs_clarification++;
      } else {
        summary.failed++;
      }
    });

    return summary;
  }
}

/**
 * Factory function for easy instantiation
 */
export function createOperator(config = {}) {
  return new OperatorOrchestrator(config);
}

// Re-export memory, config, and RAG helpers for convenience
export { OperatorMemory, getSharedMemory, resetSharedMemory } from './memory.js';
export { OperatorConfig, getSharedConfig, resetSharedConfig } from './config.js';
export { OperatorRAG, getSharedRAG } from './rag.js';

// V2: Re-export ledger, context injection, action ID, and quiet hours
export { OperatorLedger, getSharedLedger, resetSharedLedger } from './ledger.js';
export { ContextInjection, getSharedContextInjection, resetSharedContextInjection } from '../llm/context-injection.js';
export { generateV21ActionId, validateV21ActionId, inferActionType, ACTION_TYPES } from './action-id.js';
export { QuietHoursManager, getSharedQuietHours, resetSharedQuietHours } from './quiet-hours.js';
