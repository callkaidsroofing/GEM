import { supabase } from './src/lib/supabase.js';
import { getTool } from './src/lib/registry.js';
import { validateInput, validateOutput } from './src/lib/validate.js';
import { checkIdempotency } from './src/lib/idempotency.js';
import crypto from 'crypto';

// ============================================
// CONFIGURATION
// ============================================

/**
 * Parse TOOLS_POLL_INTERVAL_MS safely with default fallback
 * If missing, invalid, or out of range, default to 5000ms
 */
function parsePollInterval() {
  const raw = process.env.TOOLS_POLL_INTERVAL_MS;
  if (!raw) {
    return 5000;
  }
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1000 || parsed > 60000) {
    console.warn(`[CONFIG] Invalid TOOLS_POLL_INTERVAL_MS="${raw}", using default 5000ms`);
    return 5000;
  }
  return parsed;
}

const POLL_INTERVAL = parsePollInterval();
const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;

// ============================================
// STRUCTURED LOGGING
// ============================================

/**
 * Structured log helper for consistent output format
 */
function log(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    worker_id: WORKER_ID,
    message,
    ...context
  };
  console.log(JSON.stringify(entry));
}

function logInfo(message, context = {}) {
  log('INFO', message, context);
}

function logWarn(message, context = {}) {
  log('WARN', message, context);
}

function logError(message, context = {}) {
  log('ERROR', message, context);
}

// ============================================
// POLL LOOP
// ============================================

async function poll() {
  try {
    // 1. Claim job atomically using RPC
    const { data: jobs, error: claimError } = await supabase
      .rpc('claim_next_core_tool_call', { p_worker_id: WORKER_ID });

    if (claimError) {
      logError('Error claiming jobs', { error: claimError.message, code: claimError.code });
      return;
    }

    if (!jobs || jobs.length === 0) {
      // No jobs available - this is normal, don't log
      return;
    }

    const job = jobs[0];
    logInfo('Job claimed', { 
      call_id: job.id, 
      tool_name: job.tool_name,
      status: 'running'
    });

    await executeJob(job);
  } catch (err) {
    // CRITICAL: Never let the poll loop crash
    logError('Unexpected error in poll loop', { 
      error: err.message, 
      stack: err.stack 
    });
  }
}

// ============================================
// JOB EXECUTION
// ============================================

async function executeJob(job) {
  const startTime = Date.now();
  const tool = getTool(job.tool_name);

  // 1. Check if tool exists in registry
  if (!tool) {
    await failJob(job, {
      error_code: 'unknown_tool',
      message: `Tool ${job.tool_name} not found in registry`
    });
    logWarn('Unknown tool', { call_id: job.id, tool_name: job.tool_name });
    return;
  }

  try {
    // 2. Check Idempotency (includes keyed idempotency for key_field tools)
    const existingReceipt = await checkIdempotency(tool, job);
    if (existingReceipt) {
      logInfo('Idempotency hit', { 
        call_id: job.id, 
        tool_name: job.tool_name,
        mode: tool.idempotency?.mode || 'none'
      });
      await succeedJob(job, existingReceipt.result, {
        ...existingReceipt.effects,
        idempotency: {
          mode: tool.idempotency?.mode || 'none',
          hit: true,
          key_field: tool.idempotency?.key_field,
          key_value: existingReceipt.key_value
        }
      });
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
      logWarn('Input validation failed', { 
        call_id: job.id, 
        tool_name: job.tool_name,
        errors: inputValidation.error
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
        logWarn('Missing keyed idempotency field', { 
          call_id: job.id, 
          tool_name: job.tool_name,
          key_field: keyField
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
      logWarn('Failed to load handler module', { 
        call_id: job.id, 
        tool_name: job.tool_name,
        handler_path: handlerPath,
        error: err.message
      });
    }

    if (!handler) {
      // Tool exists in registry but no handler - this is an implementation gap
      await failJob(job, {
        error_code: 'unknown_tool',
        message: `Handler export '${method}' not found in ${handlerPath}`
      });
      logWarn('Handler not found', { 
        call_id: job.id, 
        tool_name: job.tool_name,
        method,
        handler_path: handlerPath
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
      const duration = Date.now() - startTime;
      logInfo('Job completed (not_configured)', { 
        call_id: job.id, 
        tool_name: job.tool_name,
        status: 'not_configured',
        duration_ms: duration
      });
      return;
    }

    // 8. Validate Output
    const outputValidation = validateOutput(tool, resultObj);
    if (!outputValidation.valid) {
      logWarn('Output validation warning', { 
        call_id: job.id, 
        tool_name: job.tool_name,
        errors: outputValidation.error
      });
    }

    // 9. Build idempotency effects
    const idempotencyEffects = {
      mode: tool.idempotency?.mode || 'none',
      hit: false
    };
    if (tool.idempotency?.key_field) {
      idempotencyEffects.key_field = tool.idempotency.key_field;
      idempotencyEffects.key_value = job.input[tool.idempotency.key_field];
    }

    // 10. Write Receipt and Update Status
    await succeedJob(job, resultObj, {
      ...(result.effects || {}),
      idempotency: idempotencyEffects
    });

    const duration = Date.now() - startTime;
    logInfo('Job completed', { 
      call_id: job.id, 
      tool_name: job.tool_name,
      status: 'succeeded',
      duration_ms: duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    logError('Job execution failed', { 
      call_id: job.id, 
      tool_name: job.tool_name,
      error: err.message,
      duration_ms: duration
    });
    await failJob(job, {
      error_code: err.code || 'execution_error',
      message: err.message,
      details: err.details || {}
    });
  }
}

// ============================================
// RECEIPT WRITERS
// ============================================

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
    logError('Error writing not_configured receipt', { 
      call_id: job.id, 
      error: receiptError.message 
    });
  }

  // Update call status to not_configured
  const { error: statusError } = await supabase
    .from('core_tool_calls')
    .update({ status: 'not_configured', updated_at: new Date().toISOString() })
    .eq('id', job.id);

  if (statusError) {
    logError('Error updating not_configured status', { 
      call_id: job.id, 
      error: statusError.message 
    });
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
    logError('Error writing success receipt', { 
      call_id: job.id, 
      error: receiptError.message 
    });
  }

  // Update status
  const { error: statusError } = await supabase
    .from('core_tool_calls')
    .update({ status: 'succeeded', updated_at: new Date().toISOString() })
    .eq('id', job.id);

  if (statusError) {
    logError('Error updating success status', { 
      call_id: job.id, 
      error: statusError.message 
    });
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
    logError('Error writing failure receipt', { 
      call_id: job.id, 
      error: receiptError.message 
    });
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
    logError('Error updating failure status', { 
      call_id: job.id, 
      error: statusError.message 
    });
  }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', () => {
  logInfo('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logInfo('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// ============================================
// STARTUP
// ============================================

logInfo('CKR Tool Executor starting', { 
  poll_interval_ms: POLL_INTERVAL,
  node_version: process.version
});

setInterval(poll, POLL_INTERVAL);
poll(); // Initial run
