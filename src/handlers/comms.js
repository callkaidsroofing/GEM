import { supabase } from '../lib/supabase.js';

/**
 * Helper for not_configured responses
 */
function notConfigured(toolName, reason = 'provider_not_configured') {
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
 * comms.compose_sms - Generate an SMS draft (no sending)
 * Returns not_configured (requires LLM for composition)
 */
export async function compose_sms(input) {
  return notConfigured('comms.compose_sms', 'requires_llm_provider');
}

/**
 * comms.send_sms - Send an SMS message
 * Returns not_configured (requires SMS provider)
 */
export async function send_sms(input) {
  return notConfigured('comms.send_sms', 'provider_not_configured');
}

/**
 * comms.compose_email - Generate an email draft (no sending)
 * Returns not_configured (requires LLM for composition)
 */
export async function compose_email(input) {
  return notConfigured('comms.compose_email', 'requires_llm_provider');
}

/**
 * comms.send_email - Send an email message
 * Returns not_configured (requires email provider)
 */
export async function send_email(input) {
  return notConfigured('comms.send_email', 'provider_not_configured');
}

/**
 * comms.log_call_outcome - Log a call outcome
 * Real DB-backed implementation
 */
export async function log_call_outcome(input) {
  const { entity_id, outcome, notes, context_ref } = input;

  const { data, error } = await supabase
    .from('comms_log')
    .insert({
      channel: 'call',
      direction: 'outbound',
      outcome,
      body: notes,
      related_entity_id: entity_id,
      context_ref: context_ref || {}
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to log call outcome: ${error.message}`);
  }

  // Also create an interaction record
  const { data: interaction } = await supabase
    .from('interactions')
    .insert({
      entity_id,
      interaction_type: 'call',
      summary: `Call: ${outcome}`,
      details: { outcome, notes }
    })
    .select('id')
    .single();

  return {
    result: { interaction_id: interaction?.id || data.id },
    effects: {
      db_writes: [
        { table: 'comms_log', action: 'insert', id: data.id },
        { table: 'interactions', action: 'insert', id: interaction?.id }
      ]
    }
  };
}

/**
 * comms.create_followup_task_from_message - Create a follow-up task
 * Real DB-backed implementation
 */
export async function create_followup_task_from_message(input) {
  const { title, context_ref, due_at } = input;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      domain: 'business',
      status: 'open',
      due_at,
      context_ref
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create follow-up task: ${error.message}`);
  }

  return {
    result: { task_id: data.id },
    effects: {
      db_writes: [{ table: 'tasks', action: 'insert', id: data.id }]
    }
  };
}

/**
 * comms.log_message - Log any message to comms_log
 * Real DB-backed implementation (internal helper used by other handlers)
 */
export async function log_message(input) {
  const { channel, to, body, context_ref, direction = 'outbound' } = input;

  const { data, error } = await supabase
    .from('comms_log')
    .insert({
      channel,
      direction,
      to_address: to,
      body,
      context_ref: context_ref || {}
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to log message: ${error.message}`);
  }

  return {
    result: { log_id: data.id },
    effects: {
      db_writes: [{ table: 'comms_log', action: 'insert', id: data.id }]
    }
  };
}
