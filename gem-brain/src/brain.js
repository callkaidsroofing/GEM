/**
 * GEM Brain - Core Runner
 *
 * Translates messages into registry-valid tool calls, enqueues them to Supabase,
 * optionally waits for receipts, and returns a structured response.
 */

import { randomUUID } from 'crypto';
import { supabase } from './lib/supabase.js';
import { getTool, validateToolInput } from './lib/registry.js';
import { planFromRules, getHelpText } from './planner/rules.js';

/**
 * Default limits
 */
const DEFAULT_LIMITS = {
  max_tool_calls: 10,
  wait_timeout_ms: 30000,
  poll_interval_ms: 500
};

/**
 * Run the Brain with a request.
 *
 * @param {BrainRunRequest} request
 * @returns {Promise<BrainRunResponse>}
 */
export async function runBrain(request) {
  const runId = randomUUID();
  const startTime = Date.now();

  // Initialize response structure
  const response = {
    ok: false,
    run_id: runId,
    decision: {
      mode_used: request.mode || 'answer',
      reason: ''
    },
    planned_tool_calls: [],
    enqueued: [],
    receipts: [],
    assistant_message: '',
    next_actions: [],
    errors: []
  };

  // Create brain_run record
  const brainRun = await createBrainRun(runId, request);
  if (!brainRun) {
    response.errors.push({
      code: 'db_error',
      message: 'Failed to create brain_run record',
      details: {}
    });
    return response;
  }

  try {
    // Validate request
    const validationErrors = validateRequest(request);
    if (validationErrors.length > 0) {
      response.errors = validationErrors;
      response.assistant_message = 'Invalid request: ' + validationErrors.map(e => e.message).join(', ');
      await updateBrainRun(runId, { status: 'failed', error: { errors: validationErrors } });
      return response;
    }

    const mode = request.mode || 'answer';
    const context = request.context || {};
    const limits = { ...DEFAULT_LIMITS, ...request.limits };

    // Update status to planning
    await updateBrainRun(runId, { status: 'planning' });

    // Plan tool calls using rules-first planner
    const planResult = planFromRules(request.message, context);
    response.decision.reason = planResult.reason;

    // If no tool calls planned and mode requires them, switch to answer mode
    if (planResult.toolCalls.length === 0 && mode !== 'answer') {
      response.decision.mode_used = 'answer';
      response.assistant_message = planResult.reason || getHelpText();
      response.ok = true;
      await updateBrainRun(runId, {
        status: 'completed',
        decision: response.decision,
        assistant_message: response.assistant_message
      });
      return response;
    }

    // Limit tool calls
    const toolCalls = planResult.toolCalls.slice(0, limits.max_tool_calls);
    response.planned_tool_calls = toolCalls;

    // Update brain_run with planned calls
    await updateBrainRun(runId, {
      planned_tool_calls: toolCalls,
      decision: response.decision
    });

    // Mode: answer - just return the plan without executing
    if (mode === 'answer') {
      response.decision.mode_used = 'answer';
      if (toolCalls.length > 0) {
        response.assistant_message = `I would execute: ${toolCalls.map(c => c.tool_name).join(', ')}`;
      } else {
        response.assistant_message = planResult.reason || getHelpText();
      }
      response.ok = true;
      await updateBrainRun(runId, {
        status: 'completed',
        assistant_message: response.assistant_message
      });
      return response;
    }

    // Mode: plan - return the plan for approval
    if (mode === 'plan') {
      response.decision.mode_used = 'plan';
      response.assistant_message = toolCalls.length > 0
        ? `Planned ${toolCalls.length} tool call(s): ${toolCalls.map(c => c.tool_name).join(', ')}. Approve to execute.`
        : 'No tool calls planned.';
      response.next_actions = toolCalls.length > 0 ? ['Approve plan to enqueue'] : [];
      response.ok = true;
      await updateBrainRun(runId, {
        status: 'completed',
        assistant_message: response.assistant_message,
        next_actions: response.next_actions
      });
      return response;
    }

    // Mode: enqueue or enqueue_and_wait - actually enqueue the calls
    if (toolCalls.length === 0) {
      response.decision.mode_used = 'answer';
      response.assistant_message = planResult.reason || 'No actions to take.';
      response.ok = true;
      await updateBrainRun(runId, {
        status: 'completed',
        assistant_message: response.assistant_message
      });
      return response;
    }

    // Validate all tool calls before enqueueing
    for (const call of toolCalls) {
      const validation = validateToolInput(call.tool_name, call.input);
      if (!validation.valid) {
        response.errors.push({
          code: 'validation_error',
          message: `${call.tool_name}: ${validation.error}`,
          details: { tool_name: call.tool_name, input: call.input }
        });
      }
    }

    if (response.errors.length > 0) {
      response.assistant_message = 'Validation failed for one or more tool calls.';
      await updateBrainRun(runId, {
        status: 'failed',
        error: { errors: response.errors }
      });
      return response;
    }

    // Enqueue tool calls
    const enqueued = await enqueueToolCalls(toolCalls, runId);
    response.enqueued = enqueued;

    const enqueuedIds = enqueued.map(e => e.call_id);
    await updateBrainRun(runId, {
      status: 'enqueued',
      enqueued_call_ids: enqueuedIds
    });

    // Mode: enqueue - return immediately after enqueueing
    if (mode === 'enqueue') {
      response.decision.mode_used = 'enqueue';
      response.assistant_message = `Enqueued ${enqueued.length} tool call(s): ${enqueued.map(e => e.tool_name).join(', ')}`;
      response.ok = true;
      await updateBrainRun(runId, {
        status: 'completed',
        assistant_message: response.assistant_message
      });
      return response;
    }

    // Mode: enqueue_and_wait - wait for receipts
    response.decision.mode_used = 'enqueue_and_wait';
    await updateBrainRun(runId, { status: 'waiting' });

    const receipts = await waitForReceipts(enqueuedIds, limits.wait_timeout_ms, limits.poll_interval_ms);
    response.receipts = receipts;

    // Summarize results
    const succeeded = receipts.filter(r => r.status === 'succeeded').length;
    const failed = receipts.filter(r => r.status === 'failed').length;
    const notConfigured = receipts.filter(r => r.status === 'not_configured').length;
    const pending = enqueued.length - receipts.length;

    let summary = `Executed ${receipts.length}/${enqueued.length} tool calls.`;
    if (succeeded > 0) summary += ` ${succeeded} succeeded.`;
    if (failed > 0) summary += ` ${failed} failed.`;
    if (notConfigured > 0) summary += ` ${notConfigured} not configured.`;
    if (pending > 0) summary += ` ${pending} still pending (timeout).`;

    response.assistant_message = summary;
    response.ok = failed === 0 && pending === 0;

    // Extract next actions from successful receipts
    for (const receipt of receipts) {
      if (receipt.status === 'succeeded' && receipt.result) {
        // Extract created IDs for follow-up actions
        if (receipt.result.task_id) {
          response.next_actions.push(`Task created: ${receipt.result.task_id}`);
        }
        if (receipt.result.note_id) {
          response.next_actions.push(`Note created: ${receipt.result.note_id}`);
        }
        if (receipt.result.lead_id) {
          response.next_actions.push(`Lead created: ${receipt.result.lead_id}`);
        }
      }
      if (receipt.status === 'not_configured' && receipt.result?.next_steps) {
        response.next_actions.push(...receipt.result.next_steps);
      }
    }

    await updateBrainRun(runId, {
      status: response.ok ? 'completed' : 'failed',
      receipts: response.receipts,
      assistant_message: response.assistant_message,
      next_actions: response.next_actions
    });

    return response;

  } catch (error) {
    response.errors.push({
      code: 'internal_error',
      message: error.message,
      details: { stack: error.stack }
    });
    response.assistant_message = `Internal error: ${error.message}`;
    await updateBrainRun(runId, {
      status: 'failed',
      error: { message: error.message, stack: error.stack }
    });
    return response;
  }
}

/**
 * Create a brain_run record.
 */
async function createBrainRun(runId, request) {
  const { error } = await supabase
    .from('brain_runs')
    .insert({
      id: runId,
      message: request.message || '',
      mode: request.mode || 'answer',
      conversation_id: request.conversation_id || null,
      context: request.context || {},
      limits: request.limits || {},
      status: 'created'
    });

  if (error) {
    console.error('Failed to create brain_run:', error);
    return null;
  }
  return runId;
}

/**
 * Update a brain_run record.
 */
async function updateBrainRun(runId, updates) {
  const { error } = await supabase
    .from('brain_runs')
    .update(updates)
    .eq('id', runId);

  if (error) {
    console.error('Failed to update brain_run:', error);
  }
}

/**
 * Validate the request structure.
 */
function validateRequest(request) {
  const errors = [];

  if (!request.message || typeof request.message !== 'string') {
    errors.push({
      code: 'invalid_message',
      message: 'message is required and must be a string',
      details: {}
    });
  }

  if (request.mode && !['answer', 'plan', 'enqueue', 'enqueue_and_wait'].includes(request.mode)) {
    errors.push({
      code: 'invalid_mode',
      message: `mode must be one of: answer, plan, enqueue, enqueue_and_wait`,
      details: { provided: request.mode }
    });
  }

  return errors;
}

/**
 * Enqueue tool calls to core_tool_calls.
 */
async function enqueueToolCalls(toolCalls, brainRunId) {
  const enqueued = [];

  for (const call of toolCalls) {
    const callId = randomUUID();

    const { error } = await supabase
      .from('core_tool_calls')
      .insert({
        id: callId,
        tool_name: call.tool_name,
        input: call.input,
        status: 'queued',
        idempotency_key: call.idempotency_key || null
      });

    if (error) {
      console.error(`Failed to enqueue ${call.tool_name}:`, error);
      continue;
    }

    enqueued.push({
      call_id: callId,
      tool_name: call.tool_name
    });
  }

  return enqueued;
}

/**
 * Wait for receipts to appear for the given call IDs.
 */
async function waitForReceipts(callIds, timeoutMs, pollIntervalMs) {
  const startTime = Date.now();
  const receipts = [];
  const pendingIds = new Set(callIds);

  while (pendingIds.size > 0 && (Date.now() - startTime) < timeoutMs) {
    const { data, error } = await supabase
      .from('core_tool_receipts')
      .select('call_id, tool_name, status, result, effects, created_at')
      .in('call_id', Array.from(pendingIds));

    if (!error && data) {
      for (const receipt of data) {
        if (pendingIds.has(receipt.call_id)) {
          receipts.push(receipt);
          pendingIds.delete(receipt.call_id);
        }
      }
    }

    if (pendingIds.size > 0) {
      await sleep(pollIntervalMs);
    }
  }

  return receipts;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
