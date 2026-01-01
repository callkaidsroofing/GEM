import { supabase } from './src/lib/supabase.js';
import { getTool } from './src/lib/registry.js';
import { validateInput, validateOutput } from './src/lib/validate.js';
import { checkIdempotency } from './src/lib/idempotency.js';

const POLL_INTERVAL = parseInt(process.env.TOOLS_POLL_INTERVAL_MS || '5000', 10);

async function poll() {
  try {
    // 1. Claim jobs atomically
    const { data: jobs, error: claimError } = await supabase
      .from('core_tool_calls')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('status', 'queued')
      .select()
      .order('created_at', { ascending: true })
      .limit(1);

    if (claimError) {
      console.error('Error claiming jobs:', claimError);
      return;
    }

    if (!jobs || jobs.length === 0) {
      return;
    }

    const job = jobs[0];
    console.log(`Processing job ${job.id}: ${job.tool_name}`);

    await executeJob(job);
  } catch (err) {
    console.error('Unexpected error in poll loop:', err);
  }
}

async function executeJob(job) {
  const tool = getTool(job.tool_name);
  
  if (!tool) {
    await failJob(job, { message: `Tool ${job.tool_name} not found in registry` });
    return;
  }

  try {
    // 2. Check Idempotency
    const existingReceipt = await checkIdempotency(tool, job);
    if (existingReceipt) {
      console.log(`Idempotency hit for job ${job.id}, returning existing receipt`);
      await succeedJob(job, existingReceipt.result, existingReceipt.effects);
      return;
    }

    // 3. Validate Input
    const inputValidation = validateInput(tool, job.input);
    if (!inputValidation.valid) {
      await failJob(job, { message: 'Input validation failed', details: inputValidation.error });
      return;
    }

    // 4. Execute Handler
    const [domain, method] = job.tool_name.split('.');
    const handlerPath = `./src/handlers/${domain}.js`;
    
    let handler;
    try {
      const module = await import(handlerPath);
      handler = module[method];
    } catch (err) {
      console.warn(`Failed to load handler ${handlerPath}:`, err.message);
    }

    if (!handler) {
      // Every tool must be executable, even if some return not_configured
      console.warn(`Handler for ${job.tool_name} not implemented, returning not_configured`);
      await succeedJob(job, { status: 'not_configured', message: `Handler for ${job.tool_name} not implemented` }, {});
      return;
    }

    const result = await handler(job.input);

    // 5. Validate Output
    const outputValidation = validateOutput(tool, result.result || result);
    if (!outputValidation.valid) {
      console.warn(`Output validation failed for ${job.tool_name}:`, outputValidation.error);
    }

    // 6. Write Receipt and Update Status
    await succeedJob(job, result.result || result, result.effects || {});

  } catch (err) {
    console.error(`Error executing job ${job.id}:`, err);
    await failJob(job, { message: err.message, stack: err.stack });
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

// Start the loop
console.log(`CKR Tool Executor started. Polling every ${POLL_INTERVAL}ms...`);
setInterval(poll, POLL_INTERVAL);
poll(); // Initial run
