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
 * job.create_from_accepted_quote - Create a job from an accepted quote
 * Real DB-backed implementation
 */
export async function create_from_accepted_quote(input) {
  const { quote_id, notes } = input;

  // Get quote to find lead_id
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('lead_id')
    .eq('id', quote_id)
    .single();

  if (quoteError) {
    throw new Error(`Failed to fetch quote: ${quoteError.message}`);
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      quote_id,
      lead_id: quote?.lead_id,
      status: 'pending',
      notes
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create job: ${error.message}`);
  }

  return {
    result: { job_id: data.id },
    effects: {
      db_writes: [{ table: 'jobs', action: 'insert', id: data.id }]
    }
  };
}

/**
 * job.assign_dates - Assign planned start/end dates to a job
 * Real DB-backed implementation
 */
export async function assign_dates(input) {
  const { job_id, start_date, end_date, notes } = input;

  const updateData = {
    start_date,
    status: 'scheduled',
    updated_at: new Date().toISOString()
  };

  if (end_date) updateData.end_date = end_date;
  if (notes) updateData.notes = notes;

  const { error } = await supabase
    .from('jobs')
    .update(updateData)
    .eq('id', job_id);

  if (error) {
    throw new Error(`Failed to assign dates: ${error.message}`);
  }

  return {
    result: { job_id },
    effects: {
      db_writes: [{ table: 'jobs', action: 'update', id: job_id }]
    }
  };
}

/**
 * job.create_job_card - Generate an on-site job card
 * Returns not_configured (requires file generation)
 */
export async function create_job_card(input) {
  return notConfigured('job.create_job_card', 'requires_file_generation');
}

/**
 * job.add_site_notes - Add site notes to a job
 * Real DB-backed implementation
 */
export async function add_site_notes(input) {
  const { job_id, notes } = input;

  const { error } = await supabase
    .from('jobs')
    .update({
      site_notes: notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', job_id);

  if (error) {
    throw new Error(`Failed to add site notes: ${error.message}`);
  }

  return {
    result: { job_id },
    effects: {
      db_writes: [{ table: 'jobs', action: 'update', id: job_id }]
    }
  };
}

/**
 * job.add_progress_update - Record a progress update against a job
 * Real DB-backed implementation
 */
export async function add_progress_update(input) {
  const { job_id, summary, details, photo_refs } = input;

  const { data, error } = await supabase
    .from('job_updates')
    .insert({
      job_id,
      summary,
      details: details || {},
      photo_refs: photo_refs || []
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to add progress update: ${error.message}`);
  }

  // Update job status to in_progress if pending
  await supabase
    .from('jobs')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', job_id)
    .eq('status', 'pending');

  return {
    result: { update_id: data.id },
    effects: {
      db_writes: [
        { table: 'job_updates', action: 'insert', id: data.id },
        { table: 'jobs', action: 'update', id: job_id }
      ]
    }
  };
}

/**
 * job.add_before_after_refs - Attach before/after media references
 * Real DB-backed implementation
 */
export async function add_before_after_refs(input) {
  const { job_id, before_refs, after_refs } = input;

  const { error } = await supabase
    .from('jobs')
    .update({
      before_refs,
      after_refs,
      updated_at: new Date().toISOString()
    })
    .eq('id', job_id);

  if (error) {
    throw new Error(`Failed to add before/after refs: ${error.message}`);
  }

  return {
    result: { job_id },
    effects: {
      db_writes: [{ table: 'jobs', action: 'update', id: job_id }]
    }
  };
}

/**
 * job.complete - Mark job as complete
 * Real DB-backed implementation
 */
export async function complete(input) {
  const { job_id, completed_at, notes } = input;

  const updateData = {
    status: 'completed',
    completed_at: completed_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (notes) updateData.notes = notes;

  const { error } = await supabase
    .from('jobs')
    .update(updateData)
    .eq('id', job_id);

  if (error) {
    throw new Error(`Failed to complete job: ${error.message}`);
  }

  return {
    result: { job_id },
    effects: {
      db_writes: [{ table: 'jobs', action: 'update', id: job_id }]
    }
  };
}

/**
 * job.generate_warranty_certificate - Generate a warranty certificate
 * Returns not_configured (requires PDF generation)
 */
export async function generate_warranty_certificate(input) {
  return notConfigured('job.generate_warranty_certificate', 'requires_file_generation');
}

/**
 * job.request_review - Send a review request to client
 * Returns not_configured (requires SMS/email provider)
 */
export async function request_review(input) {
  return notConfigured('job.request_review', 'provider_not_configured');
}
