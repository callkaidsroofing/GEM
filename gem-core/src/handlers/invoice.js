import { supabase } from '../lib/supabase.js';
import { notConfigured, success } from '../lib/responses.js';

/**
 * invoice.create_from_job - Create an invoice from a completed job
 * Real DB-backed implementation
 */
export async function create_from_job(input) {
  const { job_id, due_days = 14, notes } = input;

  // Verify job exists
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', job_id)
    .single();

  if (jobError) {
    throw new Error(`Failed to fetch job: ${jobError.message}`);
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      job_id,
      status: 'draft',
      total_cents: 0 // Will be calculated separately
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create invoice: ${error.message}`);
  }

  return success(
    { invoice_id: data.id },
    { db_writes: [{ table: 'invoices', action: 'insert', id: data.id }] }
  );
}

/**
 * invoice.add_payment - Record a payment against an invoice
 * Real DB-backed implementation (updates invoice status)
 */
export async function add_payment(input) {
  const { invoice_id, amount_cents, paid_at, method = 'bank_transfer', reference } = input;

  // Get current invoice
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('total_cents, status')
    .eq('id', invoice_id)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch invoice: ${fetchError.message}`);
  }

  // Update invoice status if fully paid
  const newStatus = amount_cents >= invoice.total_cents ? 'paid' : 'partial';

  const { error } = await supabase
    .from('invoices')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', invoice_id);

  if (error) {
    throw new Error(`Failed to update invoice: ${error.message}`);
  }

  // Generate a payment ID (in a real system this would be a separate payments table)
  const payment_id = crypto.randomUUID();

  return success(
    { payment_id },
    { db_writes: [{ table: 'invoices', action: 'update', id: invoice_id }] }
  );
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
    throw new Error(`Failed to mark invoice overdue: ${error.message}`);
  }

  return success(
    { invoice_id },
    { db_writes: [{ table: 'invoices', action: 'update', id: invoice_id }] }
  );
}

/**
 * invoice.send - Send an invoice to a client
 * Not configured: requires SMS/email provider
 */
export async function send(input) {
  return notConfigured('invoice.send', {
    reason: 'SMS/email provider not configured',
    required_env: ['TWILIO_ACCOUNT_SID', 'SENDGRID_API_KEY'],
    next_steps: ['Configure Twilio for SMS', 'Configure SendGrid for email']
  });
}

/**
 * invoice.send_reminder_sms - Send an invoice reminder SMS
 * Not configured: requires SMS provider
 */
export async function send_reminder_sms(input) {
  return notConfigured('invoice.send_reminder_sms', {
    reason: 'SMS provider not configured',
    required_env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    next_steps: ['Configure Twilio SMS credentials', 'Set up SMS templates']
  });
}

/**
 * invoice.send_reminder_email - Send an invoice reminder email
 * Not configured: requires email provider
 */
export async function send_reminder_email(input) {
  return notConfigured('invoice.send_reminder_email', {
    reason: 'Email provider not configured',
    required_env: ['SENDGRID_API_KEY'],
    next_steps: ['Configure SendGrid credentials', 'Set up email templates']
  });
}
