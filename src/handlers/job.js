import { supabase } from '../lib/supabase.js';
import { notConfigured, success } from '../lib/responses.js';

/**
 * job.create_from_accepted_quote - Create a job from an accepted quote
 * Real DB-backed implementation
 */
export async function create_from_accepted_quote(input) {
  const { quote_id, notes } = input;

  // Verify quote exists and is accepted
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id, lead_id, status')
    .eq('id', quote_id)
    .single();

  if (quoteError) {
    throw new Error(`Failed to fetch quote: ${quoteError.message}`);
  }

  if (quote.status !== 'accepted') {
    throw new Error(`Quote ${quote_id} is not accepted (status: ${quote.status})`);
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      lead_id: quote.lead_id,
      status: 'scheduled',
      notes
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create job: ${error.message}`);
  }

  return success(
    { job_id: data.id },
    { db_writes: [{ table: 'jobs', action: 'insert', id: data.id }] }
  );
}

/**
 * job.assign_dates - Assign planned start/end dates to a job
 * Real DB-backed implementation
 */
export async function assign_dates(input) {
  const { job_id, start_date, end_date, notes } = input;

  const { error } = await supabase
    .from('jobs')
    .update({
      scheduled_at: start_date,
      notes: notes || undefined,
      updated_at: new Date().toISOString()
    })
    .eq('id', job_id);

  if (error) {
    throw new Error(`Failed to assign dates: ${error.message}`);
  }

  return success(
    { job_id },
    { db_writes: [{ table: 'jobs', action: 'update', id: job_id }] }
  );
}

/**
 * job.complete - Mark job as complete
 * Real DB-backed implementation
 */
export async function complete(input) {
  const { job_id, completed_at, notes } = input;

  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'completed',
      notes: notes || undefined,
      updated_at: new Date().toISOString()
    })
    .eq('id', job_id);

  if (error) {
    throw new Error(`Failed to complete job: ${error.message}`);
  }

  return success(
    { job_id },
    { db_writes: [{ table: 'jobs', action: 'update', id: job_id }] }
  );
}

/**
 * job.add_site_notes - Add site notes to a job
 * Real DB-backed implementation
 */
export async function add_site_notes(input) {
  const { job_id, notes } = input;

  // Append notes to existing notes
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('notes')
    .eq('id', job_id)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch job: ${fetchError.message}`);
  }

  const existingNotes = job.notes || '';
  const updatedNotes = existingNotes ? `${existingNotes}\n\n${notes}` : notes;

  const { error } = await supabase
    .from('jobs')
    .update({
      notes: updatedNotes,
      updated_at: new Date().toISOString()
    })
    .eq('id', job_id);

  if (error) {
    throw new Error(`Failed to add site notes: ${error.message}`);
  }

  return success(
    { job_id },
    { db_writes: [{ table: 'jobs', action: 'update', id: job_id }] }
  );
}

/**
 * job.create_job_card - Generate an on-site job card
 * Not configured: requires PDF generation
 */
export async function create_job_card(input) {
  return notConfigured('job.create_job_card', {
    reason: 'PDF generation not configured',
    required_env: [],
    next_steps: ['Integrate PDF generation library', 'Create job card template']
  });
}

/**
 * job.add_progress_update - Record a progress update against a job
 * Not configured: requires progress tracking table
 */
export async function add_progress_update(input) {
  return notConfigured('job.add_progress_update', {
    reason: 'Progress tracking table not configured',
    required_env: [],
    next_steps: ['Create job_progress_updates table', 'Implement progress tracking']
  });
}

/**
 * job.add_before_after_refs - Attach before/after media references to a job
 * Not configured: requires media reference system
 */
export async function add_before_after_refs(input) {
  return notConfigured('job.add_before_after_refs', {
    reason: 'Media reference system not configured',
    required_env: [],
    next_steps: ['Create job_media_refs table', 'Implement media attachment logic']
  });
}

/**
 * job.generate_warranty_certificate - Generate a warranty certificate PDF
 * Not configured: requires PDF generation
 */
export async function generate_warranty_certificate(input) {
  return notConfigured('job.generate_warranty_certificate', {
    reason: 'PDF generation not configured',
    required_env: [],
    next_steps: ['Integrate PDF generation library', 'Create warranty certificate template']
  });
}

/**
 * job.request_review - Send a review request to client
 * Not configured: requires SMS/email provider
 */
export async function request_review(input) {
  return notConfigured('job.request_review', {
    reason: 'SMS/email provider not configured',
    required_env: ['TWILIO_ACCOUNT_SID', 'SENDGRID_API_KEY'],
    next_steps: ['Configure Twilio for SMS', 'Configure SendGrid for email']
  });
}
