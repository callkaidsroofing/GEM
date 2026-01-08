import { supabase } from '../lib/supabase.js';
import { notConfigured, success } from '../lib/responses.js';

/**
 * comms.log_call_outcome - Log a call outcome tied to an entity
 * Real DB-backed implementation - logs to notes table
 */
export async function log_call_outcome(input) {
  const { entity_id, entity_type, outcome, notes, context_ref, duration_seconds } = input;

  const noteBody = [
    `Call outcome: ${outcome}`,
    notes ? `Notes: ${notes}` : null,
    duration_seconds ? `Duration: ${duration_seconds}s` : null
  ].filter(Boolean).join('\n');

  const { data, error } = await supabase
    .from('notes')
    .insert({
      entity_id,
      entity_type: entity_type || 'lead',
      body: noteBody,
      note_type: 'call_log',
      metadata: {
        outcome,
        duration_seconds,
        context_ref,
        logged_at: new Date().toISOString()
      }
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to log call outcome: ${error.message}`);
  }

  return success(
    { note_id: data.id, logged: true },
    { db_writes: [{ table: 'notes', action: 'insert', id: data.id }] }
  );
}

/**
 * comms.log_interaction - Log any interaction (call, email, sms, meeting)
 * Real DB-backed implementation
 */
export async function log_interaction(input) {
  const { 
    entity_id, 
    entity_type, 
    channel, 
    direction, 
    summary, 
    notes,
    metadata 
  } = input;

  const noteBody = [
    `${channel.toUpperCase()} ${direction || 'interaction'}`,
    summary ? `Summary: ${summary}` : null,
    notes ? `Notes: ${notes}` : null
  ].filter(Boolean).join('\n');

  const { data, error } = await supabase
    .from('notes')
    .insert({
      entity_id,
      entity_type: entity_type || 'lead',
      body: noteBody,
      note_type: `${channel}_log`,
      metadata: {
        channel,
        direction,
        ...metadata,
        logged_at: new Date().toISOString()
      }
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to log interaction: ${error.message}`);
  }

  return success(
    { note_id: data.id, logged: true },
    { db_writes: [{ table: 'notes', action: 'insert', id: data.id }] }
  );
}

/**
 * comms.create_followup_task - Create a follow-up task
 * Real DB-backed implementation - creates task in tasks table
 */
export async function create_followup_task(input) {
  const { title, entity_id, entity_type, due_at, priority, notes, assigned_to } = input;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      entity_id,
      entity_type: entity_type || 'lead',
      due_at,
      status: 'open',
      priority: priority || 'normal',
      notes,
      assigned_to
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
 * comms.create_followup_task_from_message - Create a follow-up task from message context
 * Alias for create_followup_task with context_ref support
 */
export async function create_followup_task_from_message(input) {
  const { title, context_ref, due_at, priority } = input;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      entity_id: context_ref?.entity_id || null,
      entity_type: context_ref?.entity_type || 'lead',
      due_at,
      status: 'open',
      priority: priority || 'normal',
      metadata: { context_ref }
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
 * comms.draft_sms - Create an SMS draft (NO SENDING)
 * Returns draft text for human review
 * 
 * SAFE: Does not send anything, only creates draft
 */
export async function draft_sms(input) {
  const { recipient_phone, template, variables, custom_text } = input;

  // Simple template substitution
  let draftText = custom_text || '';
  
  if (template && variables) {
    // Basic template: "Hi {{name}}, your appointment is {{date}}"
    draftText = template;
    for (const [key, value] of Object.entries(variables)) {
      draftText = draftText.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
  }

  // Store draft in notes for review
  const { data, error } = await supabase
    .from('notes')
    .insert({
      entity_type: 'draft',
      body: draftText,
      note_type: 'sms_draft',
      metadata: {
        recipient_phone,
        template,
        variables,
        status: 'pending_review',
        created_at: new Date().toISOString()
      }
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to save SMS draft: ${error.message}`);
  }

  return success(
    { 
      draft_id: data.id, 
      draft_text: draftText,
      recipient_phone,
      status: 'pending_review',
      requires_human_approval: true
    },
    { db_writes: [{ table: 'notes', action: 'insert', id: data.id }] }
  );
}

/**
 * comms.draft_email - Create an email draft (NO SENDING)
 * Returns draft for human review
 * 
 * SAFE: Does not send anything, only creates draft
 */
export async function draft_email(input) {
  const { recipient_email, subject, template, variables, custom_body } = input;

  // Simple template substitution
  let draftBody = custom_body || '';
  let draftSubject = subject || '';
  
  if (template && variables) {
    draftBody = template;
    for (const [key, value] of Object.entries(variables)) {
      draftBody = draftBody.replace(new RegExp(`{{${key}}}`, 'g'), value);
      draftSubject = draftSubject.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
  }

  // Store draft in notes for review
  const { data, error } = await supabase
    .from('notes')
    .insert({
      entity_type: 'draft',
      body: `Subject: ${draftSubject}\n\n${draftBody}`,
      note_type: 'email_draft',
      metadata: {
        recipient_email,
        subject: draftSubject,
        template,
        variables,
        status: 'pending_review',
        created_at: new Date().toISOString()
      }
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to save email draft: ${error.message}`);
  }

  return success(
    { 
      draft_id: data.id, 
      draft_subject: draftSubject,
      draft_body: draftBody,
      recipient_email,
      status: 'pending_review',
      requires_human_approval: true
    },
    { db_writes: [{ table: 'notes', action: 'insert', id: data.id }] }
  );
}

/**
 * comms.compose_sms - Generate an SMS draft using AI (no sending)
 * Not configured: requires AI composition service
 */
export async function compose_sms(input) {
  return notConfigured('comms.compose_sms', {
    reason: 'AI composition service not configured',
    required_env: ['OPENAI_API_KEY'],
    next_steps: ['Integrate AI composition service', 'Create SMS templates']
  });
}

/**
 * comms.send_sms - Send an SMS message
 * Not configured: requires SMS provider
 * 
 * WARNING: This tool sends real messages - requires explicit configuration
 */
export async function send_sms(input) {
  return notConfigured('comms.send_sms', {
    reason: 'SMS provider not configured - SAFE MODE',
    required_env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    next_steps: [
      'Configure Twilio credentials',
      'Set TWILIO environment variables',
      'Use comms.draft_sms for safe draft creation'
    ]
  });
}

/**
 * comms.compose_email - Generate an email draft using AI (no sending)
 * Not configured: requires AI composition service
 */
export async function compose_email(input) {
  return notConfigured('comms.compose_email', {
    reason: 'AI composition service not configured',
    required_env: ['OPENAI_API_KEY'],
    next_steps: ['Integrate AI composition service', 'Create email templates']
  });
}

/**
 * comms.send_email - Send an email message
 * Not configured: requires email provider
 * 
 * WARNING: This tool sends real messages - requires explicit configuration
 */
export async function send_email(input) {
  return notConfigured('comms.send_email', {
    reason: 'Email provider not configured - SAFE MODE',
    required_env: ['SENDGRID_API_KEY'],
    next_steps: [
      'Configure SendGrid credentials',
      'Set SENDGRID_API_KEY environment variable',
      'Use comms.draft_email for safe draft creation'
    ]
  });
}

/**
 * comms.get_draft - Retrieve a draft by ID
 */
export async function get_draft(input) {
  const { draft_id } = input;

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', draft_id)
    .in('note_type', ['sms_draft', 'email_draft'])
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch draft: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Draft ${draft_id} not found`);
  }

  return success(
    { draft: data },
    { db_reads: [{ table: 'notes', id: draft_id }] }
  );
}

/**
 * comms.list_pending_drafts - List all pending drafts
 */
export async function list_pending_drafts(input) {
  const { limit = 50 } = input || {};

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .in('note_type', ['sms_draft', 'email_draft'])
    .eq('metadata->>status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list drafts: ${error.message}`);
  }

  return success(
    { drafts: data || [], count: data?.length || 0 },
    { db_reads: [{ table: 'notes', count: data?.length || 0 }] }
  );
}
