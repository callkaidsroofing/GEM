import { supabase } from '../lib/supabase.js';
import { notConfigured, success } from '../lib/responses.js';

/**
 * inspection.create - Create an inspection record linked to a lead
 * Stores the FULL inspection form as payload JSONB
 *
 * Registry definition:
 *   input: { lead_id (required), site_address, notes, payload }
 *   output: { inspection_id }
 *   permissions: [write:db]
 *   idempotency: none
 */
export async function create(input) {
  const { lead_id, leadconnector_contact_id, site_address, site_suburb, notes, payload, assigned_to, scheduled_at } = input;

  // If lead_id provided, verify it exists
  if (lead_id) {
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
  }

  // Create inspection with full payload
  const { data, error } = await supabase
    .from('inspections')
    .insert({
      lead_id: lead_id || null,
      leadconnector_contact_id: leadconnector_contact_id || null,
      site_address: site_address || null,
      site_suburb: site_suburb || null,
      notes: notes || null,
      payload: payload || {},
      assigned_to: assigned_to || null,
      scheduled_at: scheduled_at || null,
      status: scheduled_at ? 'scheduled' : 'draft',
      created_by: input.created_by || 'system'
    })
    .select('id, status')
    .single();

  if (error) {
    throw new Error(`Failed to create inspection: ${error.message}`);
  }

  return success(
    { inspection_id: data.id, status: data.status },
    { db_writes: [{ table: 'inspections', action: 'insert', id: data.id }] }
  );
}

/**
 * inspection.update - Update an inspection's data
 * Can update payload, site info, notes, status
 *
 * Registry definition:
 *   input: { inspection_id (required), patch }
 *   output: { inspection_id, updated }
 *   permissions: [write:db]
 *   idempotency: safe-retry
 */
export async function update(input) {
  const { inspection_id, patch } = input;

  // Fetch current inspection
  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('id, status, payload')
    .eq('id', inspection_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch inspection: ${fetchError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  // Cannot update submitted inspections
  if (inspection.status === 'submitted') {
    throw new Error(`Cannot update submitted inspection ${inspection_id}`);
  }

  // Build update object
  const updateData = {
    updated_at: new Date().toISOString()
  };

  // Allow updating specific fields
  const allowedFields = ['site_address', 'site_suburb', 'notes', 'assigned_to', 'scheduled_at', 'status', 'tags'];
  for (const field of allowedFields) {
    if (patch && patch[field] !== undefined) {
      updateData[field] = patch[field];
    }
  }

  // Merge payload if provided (deep merge)
  if (patch && patch.payload) {
    updateData.payload = {
      ...inspection.payload,
      ...patch.payload
    };
  }

  const { error: updateError } = await supabase
    .from('inspections')
    .update(updateData)
    .eq('id', inspection_id);

  if (updateError) {
    throw new Error(`Failed to update inspection: ${updateError.message}`);
  }

  return success(
    { inspection_id, updated: true },
    { db_writes: [{ table: 'inspections', action: 'update', id: inspection_id }] }
  );
}

/**
 * inspection.submit - Submit/lock an inspection for quoting
 * Sets status to 'submitted' and records completion time
 *
 * Registry definition:
 *   input: { inspection_id (required), final_payload }
 *   output: { inspection_id, submitted }
 *   permissions: [write:db]
 *   idempotency: safe-retry
 */
export async function submit(input) {
  const { inspection_id, final_payload } = input;

  // Fetch current inspection
  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('id, status, payload')
    .eq('id', inspection_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch inspection: ${fetchError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  // Already submitted - idempotent success
  if (inspection.status === 'submitted') {
    return success(
      { inspection_id, submitted: true, already_submitted: true },
      { db_writes: [] }
    );
  }

  // Build final payload
  const submittedPayload = final_payload 
    ? { ...inspection.payload, ...final_payload }
    : inspection.payload;

  // Submit the inspection
  const { error: updateError } = await supabase
    .from('inspections')
    .update({
      status: 'submitted',
      payload: submittedPayload,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', inspection_id);

  if (updateError) {
    throw new Error(`Failed to submit inspection: ${updateError.message}`);
  }

  return success(
    { inspection_id, submitted: true },
    { db_writes: [{ table: 'inspections', action: 'update', id: inspection_id }] }
  );
}

/**
 * inspection.get - Retrieve an inspection by ID
 *
 * Registry definition:
 *   input: { inspection_id (required) }
 *   output: { inspection }
 *   permissions: [read:db]
 *   idempotency: safe-retry
 */
export async function get(input) {
  const { inspection_id } = input;

  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', inspection_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch inspection: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  return success(
    { inspection: data },
    { db_reads: [{ table: 'inspections', id: inspection_id }] }
  );
}

/**
 * inspection.list - List inspections with optional filters
 *
 * Registry definition:
 *   input: { lead_id, status, limit }
 *   output: { inspections }
 *   permissions: [read:db]
 *   idempotency: safe-retry
 */
export async function list(input) {
  const { lead_id, status, limit = 50 } = input || {};

  let query = supabase
    .from('inspections')
    .select('id, lead_id, status, site_address, site_suburb, scheduled_at, completed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (lead_id) {
    query = query.eq('lead_id', lead_id);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list inspections: ${error.message}`);
  }

  return success(
    { inspections: data || [], count: data?.length || 0 },
    { db_reads: [{ table: 'inspections', count: data?.length || 0 }] }
  );
}

/**
 * inspection.lock - Lock an inspection to prevent further edits before quoting
 * DEPRECATED: Use inspection.submit instead
 *
 * Registry definition:
 *   input: { inspection_id (required) }
 *   output: { locked }
 *   permissions: [write:db]
 *   idempotency: safe-retry
 */
export async function lock(input) {
  // Delegate to submit for backwards compatibility
  const result = await submit({ inspection_id: input.inspection_id });
  return success(
    { locked: true, inspection_id: input.inspection_id },
    result.effects
  );
}

/**
 * inspection.add_checklist_item - Add a checklist item to an inspection
 * Stores in payload.checklist array
 */
export async function add_checklist_item(input) {
  const { inspection_id, item_name, checked, notes } = input;

  // Fetch current inspection
  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('id, status, payload')
    .eq('id', inspection_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch inspection: ${fetchError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  if (inspection.status === 'submitted') {
    throw new Error(`Cannot modify submitted inspection ${inspection_id}`);
  }

  // Add checklist item to payload
  const checklist = inspection.payload?.checklist || [];
  checklist.push({
    item_name,
    checked: checked || false,
    notes: notes || null,
    added_at: new Date().toISOString()
  });

  const { error: updateError } = await supabase
    .from('inspections')
    .update({
      payload: { ...inspection.payload, checklist },
      updated_at: new Date().toISOString()
    })
    .eq('id', inspection_id);

  if (updateError) {
    throw new Error(`Failed to add checklist item: ${updateError.message}`);
  }

  return success(
    { inspection_id, item_added: true, checklist_count: checklist.length },
    { db_writes: [{ table: 'inspections', action: 'update', id: inspection_id }] }
  );
}

/**
 * inspection.add_measurement - Add a measurement to an inspection
 * Stores in payload.measurements array
 */
export async function add_measurement(input) {
  const { inspection_id, measurement_type, value, unit, location, notes } = input;

  // Fetch current inspection
  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('id, status, payload')
    .eq('id', inspection_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch inspection: ${fetchError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  if (inspection.status === 'submitted') {
    throw new Error(`Cannot modify submitted inspection ${inspection_id}`);
  }

  // Add measurement to payload
  const measurements = inspection.payload?.measurements || [];
  measurements.push({
    type: measurement_type,
    value,
    unit: unit || 'm',
    location: location || null,
    notes: notes || null,
    recorded_at: new Date().toISOString()
  });

  const { error: updateError } = await supabase
    .from('inspections')
    .update({
      payload: { ...inspection.payload, measurements },
      updated_at: new Date().toISOString()
    })
    .eq('id', inspection_id);

  if (updateError) {
    throw new Error(`Failed to add measurement: ${updateError.message}`);
  }

  return success(
    { inspection_id, measurement_added: true, measurements_count: measurements.length },
    { db_writes: [{ table: 'inspections', action: 'update', id: inspection_id }] }
  );
}

/**
 * inspection.add_photo_ref - Attach a media reference to an inspection
 * Stores in payload.photos array
 */
export async function add_photo_ref(input) {
  const { inspection_id, photo_url, caption, location, tags } = input;

  // Fetch current inspection
  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('id, status, payload')
    .eq('id', inspection_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch inspection: ${fetchError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  if (inspection.status === 'submitted') {
    throw new Error(`Cannot modify submitted inspection ${inspection_id}`);
  }

  // Add photo to payload
  const photos = inspection.payload?.photos || [];
  photos.push({
    url: photo_url,
    caption: caption || null,
    location: location || null,
    tags: tags || [],
    added_at: new Date().toISOString()
  });

  const { error: updateError } = await supabase
    .from('inspections')
    .update({
      payload: { ...inspection.payload, photos },
      updated_at: new Date().toISOString()
    })
    .eq('id', inspection_id);

  if (updateError) {
    throw new Error(`Failed to add photo: ${updateError.message}`);
  }

  return success(
    { inspection_id, photo_added: true, photos_count: photos.length },
    { db_writes: [{ table: 'inspections', action: 'update', id: inspection_id }] }
  );
}

/**
 * inspection.add_defect - Record a defect on an inspection
 * Stores in payload.defects array
 */
export async function add_defect(input) {
  const { inspection_id, defect_type, severity, location, description, photo_refs } = input;

  // Fetch current inspection
  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('id, status, payload')
    .eq('id', inspection_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch inspection: ${fetchError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  if (inspection.status === 'submitted') {
    throw new Error(`Cannot modify submitted inspection ${inspection_id}`);
  }

  // Add defect to payload
  const defects = inspection.payload?.defects || [];
  defects.push({
    type: defect_type,
    severity: severity || 'medium',
    location: location || null,
    description: description || null,
    photo_refs: photo_refs || [],
    recorded_at: new Date().toISOString()
  });

  const { error: updateError } = await supabase
    .from('inspections')
    .update({
      payload: { ...inspection.payload, defects },
      updated_at: new Date().toISOString()
    })
    .eq('id', inspection_id);

  if (updateError) {
    throw new Error(`Failed to add defect: ${updateError.message}`);
  }

  return success(
    { inspection_id, defect_added: true, defects_count: defects.length },
    { db_writes: [{ table: 'inspections', action: 'update', id: inspection_id }] }
  );
}

/**
 * inspection.generate_scope_summary - Generate a scope summary from inspection data
 * Not configured: requires AI composition service
 */
export async function generate_scope_summary(input) {
  return notConfigured('inspection.generate_scope_summary', {
    reason: 'AI composition service not configured',
    required_env: ['OPENAI_API_KEY'],
    next_steps: ['Integrate AI service', 'Define scope summary template']
  });
}
