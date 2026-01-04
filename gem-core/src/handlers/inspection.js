import { supabase } from '../lib/supabase.js';
import { notConfigured, success } from '../lib/responses.js';

/**
 * inspection.create - Create an inspection record linked to a lead
 * Real DB-backed implementation
 *
 * Registry definition:
 *   input: { lead_id (required), site_address, notes }
 *   output: { inspection_id }
 *   permissions: [write:db]
 *   idempotency: none
 */
export async function create(input) {
  const { lead_id, site_address, notes } = input;

  // Verify lead exists
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('id', lead_id)
    .maybeSingle();

  if (leadError) {
    throw new Error(`Failed to verify lead: ${leadError.message}`);
  }

  if (!lead) {
    throw new Error(`Lead ${lead_id} not found`);
  }

  // Create inspection
  const { data, error } = await supabase
    .from('inspections')
    .insert({
      lead_id,
      site_address: site_address || null,
      notes: notes || null,
      status: 'open'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create inspection: ${error.message}`);
  }

  return success(
    { inspection_id: data.id },
    { db_writes: [{ table: 'inspections', action: 'insert', id: data.id }] }
  );
}

/**
 * inspection.lock - Lock an inspection to prevent further edits before quoting
 * Real DB-backed implementation
 *
 * Registry definition:
 *   input: { inspection_id (required) }
 *   output: { locked }
 *   permissions: [write:db]
 *   idempotency: safe-retry
 */
export async function lock(input) {
  const { inspection_id } = input;

  // Check current status
  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('id, status')
    .eq('id', inspection_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch inspection: ${fetchError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  // Already locked - idempotent success
  if (inspection.status === 'locked') {
    return success(
      { locked: true },
      { db_writes: [] }
    );
  }

  // Lock the inspection
  const { error: updateError } = await supabase
    .from('inspections')
    .update({
      status: 'locked',
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', inspection_id);

  if (updateError) {
    throw new Error(`Failed to lock inspection: ${updateError.message}`);
  }

  return success(
    { locked: true },
    { db_writes: [{ table: 'inspections', action: 'update', id: inspection_id }] }
  );
}

/**
 * inspection.add_checklist_item - Add a checklist item to an inspection
 * Not configured: requires inspection_items table
 */
export async function add_checklist_item(input) {
  return notConfigured('inspection.add_checklist_item', {
    reason: 'Inspection items table not configured',
    required_env: [],
    next_steps: ['Create inspection_items table', 'Implement checklist logic']
  });
}

/**
 * inspection.add_measurement - Add a measurement to an inspection
 * Not configured: requires inspection_measurements table
 */
export async function add_measurement(input) {
  return notConfigured('inspection.add_measurement', {
    reason: 'Inspection measurements table not configured',
    required_env: [],
    next_steps: ['Create inspection_measurements table']
  });
}

/**
 * inspection.add_photo_ref - Attach a media reference to an inspection
 * Not configured: requires inspection_photos table
 */
export async function add_photo_ref(input) {
  return notConfigured('inspection.add_photo_ref', {
    reason: 'Inspection photos table not configured',
    required_env: [],
    next_steps: ['Create inspection_photos table', 'Link to media assets']
  });
}

/**
 * inspection.add_defect - Record a defect on an inspection
 * Not configured: requires inspection_defects table
 */
export async function add_defect(input) {
  return notConfigured('inspection.add_defect', {
    reason: 'Inspection defects table not configured',
    required_env: [],
    next_steps: ['Create inspection_defects table']
  });
}

/**
 * inspection.generate_scope_summary - Generate a scope summary from inspection data
 * Not configured: requires AI composition service
 */
export async function generate_scope_summary(input) {
  return notConfigured('inspection.generate_scope_summary', {
    reason: 'AI composition service not configured',
    required_env: [],
    next_steps: ['Integrate AI service', 'Define scope summary template']
  });
}
