import { supabase } from './src/lib/supabase.js';
import { getTool } from './src/lib/registry.js';
import { validateInput, validateOutput } from './src/lib/validate.js';
import { checkIdempotency } from './src/lib/idempotency.js';
import crypto from 'crypto';

const POLL_INTERVAL = parseInt(process.env.TOOLS_POLL_INTERVAL_MS || '5000', 10);
const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;

async function poll() {
  try {
    // 1. Claim job atomically using RPC
    const { data: jobs, error: claimError } = await supabase
      .rpc('claim_next_core_tool_call', { p_worker_id: WORKER_ID });

    if (claimError) {
      console.error('Error claiming jobs:', claimError);
      return;
    }

    if (!jobs || jobs.length === 0) {
      return;
    }

    const job = jobs[0];
    console.log(`[${WORKER_ID}] Processing job ${job.id}: ${job.tool_name}`);

    await executeJob(job);
  } catch (err) {
    console.error('Unexpected error in poll loop:', err);
  }
}

async function executeJob(job) {
  const tool = getTool(job.tool_name);

  // 1. Check if tool exists in registry
  if (!tool) {
    await failJob(job, {
      error_code: 'unknown_tool',
      message: `Tool ${job.tool_name} not found in registry`
    });
    return;
  }

  try {
    // 2. Check Idempotency (includes keyed idempotency for key_field tools)
    const existingReceipt = await checkIdempotency(tool, job);
    if (existingReceipt) {
      console.log(`Idempotency hit for job ${job.id}, returning existing receipt`);
      await succeedJob(job, existingReceipt.result, existingReceipt.effects);
      return;
    }

    // 3. Validate Input against registry schema
    const inputValidation = validateInput(tool, job.input);
    if (!inputValidation.valid) {
      await failJob(job, {
        error_code: 'validation_error',
        message: 'Input validation failed',
        details: inputValidation.error
      });
      return;
    }

    // 4. Check keyed idempotency key_field requirement
    if (tool.idempotency?.mode === 'keyed' && tool.idempotency?.key_field) {
      const keyField = tool.idempotency.key_field;
      if (!job.input[keyField]) {
        await failJob(job, {
          error_code: 'validation_error',
          message: `Missing required key field for keyed idempotency: ${keyField}`,
          details: { key_field: keyField }
        });
        return;
      }
    }

    // 5. Resolve handler
    // Pattern: tool_name = "domain.method" or "domain.subdomain.action"
    // Handler: src/handlers/<domain>.js, export <method> or <subdomain_action>
    const parts = job.tool_name.split('.');
    const domain = parts[0];
    const method = parts.slice(1).join('_'); // e.g., "google_drive.search" → "google_drive_search"
    const handlerPath = `./src/handlers/${domain}.js`;

    let handler;
    try {
      const module = await import(handlerPath);
      handler = module[method];
    } catch (err) {
      console.warn(`Failed to load handler ${handlerPath}:`, err.message);
    }

    if (!handler) {
      // Tool exists in registry but no handler - this is an implementation gap
      await failJob(job, {
        error_code: 'unknown_tool',
        message: `Handler export '${method}' not found in ${handlerPath}`
      });
      return;
    }

    // 6. Execute with timeout from registry
    const timeoutMs = tool.timeout_ms || 30000;
    const result = await Promise.race([
      handler(job.input, { job, tool }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Handler timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    // 7. Check for not_configured status in result
    const resultObj = result.result || result;
    if (resultObj.status === 'not_configured') {
      // Write receipt with not_configured status
      await writeNotConfiguredReceipt(job, resultObj);
      return;
    }

    // 8. Validate Output
    const outputValidation = validateOutput(tool, resultObj);
    if (!outputValidation.valid) {
      console.warn(`Output validation failed for ${job.tool_name}:`, outputValidation.error);
    }

    // 9. Write Receipt and Update Status
    await succeedJob(job, resultObj, result.effects || {});

  } catch (err) {
    console.error(`Error executing job ${job.id}:`, err);
    await failJob(job, {
      error_code: err.code || 'execution_error',
      message: err.message,
      details: err.details || {}
    });
  }
}

/**
 * Write a not_configured receipt - tool executed but is not yet configured
 */
async function writeNotConfiguredReceipt(job, result) {
  // Write receipt with not_configured status
  const { error: receiptError } = await supabase
    .from('core_tool_receipts')
    .insert({
      call_id: job.id,
      tool_name: job.tool_name,
      status: 'not_configured',
      result: {
        status: 'not_configured',
        reason: result.reason || `Tool ${job.tool_name} is not yet configured`,
        required_env: result.required_env || [],
        next_steps: result.next_steps || []
      },
      effects: {}
    });

  if (receiptError) {
    console.error(`Error writing not_configured receipt for job ${job.id}:`, receiptError);
  }

  // Update call status to not_configured
  const { error: statusError } = await supabase
    .from('core_tool_calls')
    .update({ status: 'not_configured', updated_at: new Date().toISOString() })
    .eq('id', job.id);

  if (statusError) {
    console.error(`Error updating not_configured status for job ${job.id}:`, statusError);
  }
}

async function succeedJob(job, result, effects) {
  // Write receipt
  const { error: receiptError } = await supabase
    .from('core_tool_receipts')
    .insert({
      call_id: job.id,
      tool_name: job.tool_name,
      status: 'succeeded',
      result,
      effects
    });

  if (receiptError) {
    console.error(`Error writing receipt for job ${job.id}:`, receiptError);
  }

  // Update status
  const { error: statusError } = await supabase
    .from('core_tool_calls')
    .update({ status: 'succeeded', updated_at: new Date().toISOString() })
    .eq('id', job.id);

  if (statusError) {
    console.error(`Error updating status for job ${job.id}:`, statusError);
  }
}

async function failJob(job, error) {
  // Write receipt
  const { error: receiptError } = await supabase
    .from('core_tool_receipts')
    .insert({
      call_id: job.id,
      tool_name: job.tool_name,
      status: 'failed',
      result: { error },
      effects: {}
    });

  if (receiptError) {
    console.error(`Error writing failure receipt for job ${job.id}:`, receiptError);
  }

  // Update status
  const { error: statusError } = await supabase
    .from('core_tool_calls')
    .update({
      status: 'failed',
      error,
      updated_at: new Date().toISOString()
    })
    .eq('id', job.id);

  if (statusError) {
    console.error(`Error updating failure status for job ${job.id}:`, statusError);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${WORKER_ID}] Received SIGTERM, shutting down gracefully...`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`[${WORKER_ID}] Received SIGINT, shutting down gracefully...`);
  process.exit(0);
});

// Start the loop
console.log(`CKR Tool Executor started. Worker ID: ${WORKER_ID}. Polling every ${POLL_INTERVAL}ms...`);
setInterval(poll, POLL_INTERVAL);
poll(); // Initial run
