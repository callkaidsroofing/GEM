import { supabase } from '../lib/supabase.js';
import { notConfigured, success } from '../lib/responses.js';

/**
 * comms.log_call_outcome - Log a call outcome tied to an entity
 * Real DB-backed implementation - logs to comms_log table
 */
export async function log_call_outcome(input) {
  const { entity_id, outcome, notes, context_ref } = input;

  const { data, error } = await supabase
    .from('comms_log')
    .insert({
      channel: 'call',
      recipient: entity_id,
      body: `Call outcome: ${outcome}${notes ? ` - ${notes}` : ''}`,
      related_entity: context_ref || { entity_id }
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to log call outcome: ${error.message}`);
  }

  return success(
    { interaction_id: data.id },
    { db_writes: [{ table: 'comms_log', action: 'insert', id: data.id }] }
  );
}

/**
 * comms.create_followup_task_from_message - Create a follow-up task from message context
 * Real DB-backed implementation - creates task in tasks table
 */
export async function create_followup_task_from_message(input) {
  const { title, context_ref, due_at } = input;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      domain: 'business',
      context_ref,
      due_at,
      status: 'open',
      priority: 'normal'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create followup task: ${error.message}`);
  }

  return success(
    { task_id: data.id },
    { db_writes: [{ table: 'tasks', action: 'insert', id: data.id }] }
  );
}

/**
 * comms.compose_sms - Generate an SMS draft (no sending)
 * Not configured: requires AI composition service
 */
export async function compose_sms(input) {
  return notConfigured('comms.compose_sms', {
    reason: 'AI composition service not configured',
    required_env: [],
    next_steps: ['Integrate AI composition service', 'Create SMS templates']
  });
}

/**
 * comms.send_sms - Send an SMS message
 * Not configured: requires SMS provider
 */
export async function send_sms(input) {
  return notConfigured('comms.send_sms', {
    reason: 'SMS provider not configured',
    required_env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    next_steps: ['Configure Twilio credentials', 'Set TWILIO environment variables']
  });
}

/**
 * comms.compose_email - Generate an email draft (no sending)
 * Not configured: requires AI composition service
 */
export async function compose_email(input) {
  return notConfigured('comms.compose_email', {
    reason: 'AI composition service not configured',
    required_env: [],
    next_steps: ['Integrate AI composition service', 'Create email templates']
  });
}

/**
 * comms.send_email - Send an email message
 * Not configured: requires email provider
 */
export async function send_email(input) {
  return notConfigured('comms.send_email', {
    reason: 'Email provider not configured',
    required_env: ['SENDGRID_API_KEY'],
    next_steps: ['Configure SendGrid credentials', 'Set SENDGRID_API_KEY environment variable']
  });
}
