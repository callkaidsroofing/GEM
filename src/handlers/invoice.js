import { supabase } from '../lib/supabase.js';

/**
 * Helper for not_configured responses
 */
function notConfigured(toolName, reason = 'feature_pending') {
  return {
    result: {
      status: 'not_configured',
      reason,
      message: `Handler for ${toolName} requires additional configuration`
    },
    effects: {}
  };
}

/**
 * invoice.create_from_job - Create an invoice from a completed job
 * Real DB-backed implementation
 */
export async function create_from_job(input) {
  const { job_id, due_days = 14, notes } = input;

  // Get job to find quote and calculate total
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('quote_id')
    .eq('id', job_id)
    .single();

  if (jobError) {
    throw new Error(`Failed to fetch job: ${jobError.message}`);
  }

  let total_cents = 0;
  if (job?.quote_id) {
    const { data: quote } = await supabase
      .from('quotes')
      .select('total_cents')
      .eq('id', job.quote_id)
      .single();
    total_cents = quote?.total_cents || 0;
  }

  const due_at = new Date();
  due_at.setDate(due_at.getDate() + due_days);

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      job_id,
      status: 'draft',
      total_cents,
      due_at: due_at.toISOString(),
      notes
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create invoice: ${error.message}`);
  }

  return {
    result: { invoice_id: data.id },
    effects: {
      db_writes: [{ table: 'invoices', action: 'insert', id: data.id }]
    }
  };
}

/**
 * invoice.send - Send an invoice to a client
 * Returns not_configured (requires email/SMS provider)
 */
export async function send(input) {
  return notConfigured('invoice.send', 'provider_not_configured');
}

/**
 * invoice.add_payment - Record a payment against an invoice
 * Real DB-backed implementation
 */
export async function add_payment(input) {
  const { invoice_id, amount_cents, paid_at, method, reference } = input;

  const { data, error } = await supabase
    .from('payments')
    .insert({
      invoice_id,
      amount_cents,
      method,
      reference,
      paid_at: paid_at || new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to add payment: ${error.message}`);
  }

  // Update invoice paid_cents
  const { data: invoice } = await supabase
    .from('invoices')
    .select('paid_cents, total_cents')
    .eq('id', invoice_id)
    .single();

  const newPaidCents = (invoice?.paid_cents || 0) + amount_cents;
  const isPaidInFull = newPaidCents >= (invoice?.total_cents || 0);

  const updateData = {
    paid_cents: newPaidCents,
    updated_at: new Date().toISOString()
  };

  if (isPaidInFull) {
    updateData.status = 'paid';
    updateData.paid_at = new Date().toISOString();
  }

  await supabase
    .from('invoices')
    .update(updateData)
    .eq('id', invoice_id);

  return {
    result: { payment_id: data.id },
    effects: {
      db_writes: [
        { table: 'payments', action: 'insert', id: data.id },
        { table: 'invoices', action: 'update', id: invoice_id }
      ]
    }
  };
}

/**
 * invoice.mark_overdue - Mark an invoice as overdue
 * Real DB-backed implementation
 */
export async function mark_overdue(input) {
  const { invoice_id, as_of } = input;

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'overdue',
      updated_at: new Date().toISOString()
    })
    .eq('id', invoice_id);

  if (error) {
    throw new Error(`Failed to mark overdue: ${error.message}`);
  }

  return {
    result: { invoice_id },
    effects: {
      db_writes: [{ table: 'invoices', action: 'update', id: invoice_id }]
    }
  };
}

/**
 * invoice.send_reminder_sms - Send an invoice reminder SMS
 * Returns not_configured (requires SMS provider)
 */
export async function send_reminder_sms(input) {
  return notConfigured('invoice.send_reminder_sms', 'provider_not_configured');
}

/**
 * invoice.send_reminder_email - Send an invoice reminder email
 * Returns not_configured (requires email provider)
 */
export async function send_reminder_email(input) {
  return notConfigured('invoice.send_reminder_email', 'provider_not_configured');
}
