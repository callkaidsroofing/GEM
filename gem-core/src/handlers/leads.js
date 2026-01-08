import { supabase } from '../lib/supabase.js';
import { success } from '../lib/responses.js';

/**
 * leads.create - Create a new lead record with minimal required fields
 * Enforces keyed idempotency by phone number
 * Real DB-backed implementation
 *
 * Required fields: name, phone
 * Uses `status` for lead lifecycle (not `stage`)
 */
export async function create(input, context = {}) {
  const { 
    name, 
    phone, 
    email, 
    address,
    suburb, 
    source, 
    notes,
    leadconnector_contact_id,
    ghl_contact_id,
    metadata
  } = input;
  
  // Default service to 'unknown' if not provided
  const service = input.service || 'unknown';
  // Default status to 'new' if not provided
  const status = input.status || 'new';

  // Check if lead already exists with this phone (keyed idempotency)
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    // Return existing lead_id for idempotency
    return success(
      { lead_id: existing.id, created: false },
      { db_writes: [], idempotency: { hit: true, key_field: 'phone', key_value: phone } }
    );
  }

  const insertData = {
    name,
    phone,
    email: email || null,
    address: address || null,
    suburb: suburb || null,
    service,
    source: source || null,
    notes: notes || null,
    status,
    metadata: metadata || {}
  };

  // Add LeadConnector ID if provided
  if (leadconnector_contact_id || ghl_contact_id) {
    insertData.leadconnector_contact_id = leadconnector_contact_id || ghl_contact_id;
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    // Handle unique constraint violation gracefully
    if (error.code === '23505') {
      const { data: existingAfterRace } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', phone)
        .single();

      if (existingAfterRace) {
        return success(
          { lead_id: existingAfterRace.id, created: false },
          { db_writes: [], idempotency: { hit: true, key_field: 'phone', key_value: phone } }
        );
      }
    }
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return success(
    { lead_id: data.id, created: true },
    { db_writes: [{ table: 'leads', action: 'insert', id: data.id }] }
  );
}

/**
 * leads.upsert - Create or update a lead, with LeadConnector priority
 * If conflicts occur, LeadConnector values overwrite Supabase values
 *
 * Priority: LeadConnector > Supabase local data
 */
export async function upsert(input, context = {}) {
  const { 
    name, 
    phone, 
    email, 
    address,
    suburb, 
    source, 
    notes,
    leadconnector_contact_id,
    ghl_contact_id,
    metadata,
    status
  } = input;

  const lcId = leadconnector_contact_id || ghl_contact_id;

  // First, try to find existing lead by LeadConnector ID or phone
  let existingLead = null;
  
  if (lcId) {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('leadconnector_contact_id', lcId)
      .maybeSingle();
    existingLead = data;
  }

  if (!existingLead && phone) {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    existingLead = data;
  }

  if (existingLead) {
    // UPDATE: LeadConnector values win on conflict
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // LeadConnector provided values always overwrite
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (email) updateData.email = email;
    if (address) updateData.address = address;
    if (suburb) updateData.suburb = suburb;
    if (source) updateData.source = source;
    if (status) updateData.status = status;
    if (lcId) updateData.leadconnector_contact_id = lcId;
    
    // Merge metadata
    if (metadata) {
      updateData.metadata = {
        ...existingLead.metadata,
        ...metadata,
        _last_sync: new Date().toISOString(),
        _sync_source: 'leadconnector'
      };
    }

    // Add sync note
    if (notes) {
      const existingNotes = existingLead.notes || '';
      const syncNote = `[LC Sync ${new Date().toISOString()}] ${notes}`;
      updateData.notes = existingNotes ? `${existingNotes}\n${syncNote}` : syncNote;
    }

    const { error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', existingLead.id);

    if (error) {
      throw new Error(`Failed to update lead: ${error.message}`);
    }

    return success(
      { lead_id: existingLead.id, action: 'updated', leadconnector_priority: true },
      { 
        db_writes: [{ table: 'leads', action: 'update', id: existingLead.id }],
        notes: ['LeadConnector values overwrote local data']
      }
    );
  }

  // CREATE: New lead
  const insertData = {
    name,
    phone,
    email: email || null,
    address: address || null,
    suburb: suburb || null,
    source: source || 'leadconnector',
    notes: notes || null,
    status: status || 'new',
    leadconnector_contact_id: lcId || null,
    metadata: {
      ...metadata,
      _created_from: 'leadconnector',
      _created_at: new Date().toISOString()
    }
  };

  const { data, error } = await supabase
    .from('leads')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return success(
    { lead_id: data.id, action: 'created' },
    { db_writes: [{ table: 'leads', action: 'insert', id: data.id }] }
  );
}

/**
 * leads.get - Retrieve a lead by ID
 */
export async function get(input) {
  const { lead_id } = input;

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', lead_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch lead: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Lead ${lead_id} not found`);
  }

  return success(
    { lead: data },
    { db_reads: [{ table: 'leads', id: lead_id }] }
  );
}

/**
 * leads.update_stage - Update lead pipeline status
 * Note: Uses `status` column (not `stage`)
 */
export async function update_stage(input) {
  const { lead_id, stage, notes } = input;

  const updateData = {
    status: stage, // Map stage param to status column
    updated_at: new Date().toISOString()
  };

  if (notes) {
    updateData.notes = notes;
  }

  const { error } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', lead_id);

  if (error) {
    throw new Error(`Failed to update lead status: ${error.message}`);
  }

  return success(
    { lead_id },
    { db_writes: [{ table: 'leads', action: 'update', id: lead_id }] }
  );
}

/**
 * leads.add_source - Add or update lead source attribution
 */
export async function add_source(input) {
  const { lead_id, source, campaign } = input;

  const updateData = {
    source,
    updated_at: new Date().toISOString()
  };

  if (campaign) {
    // Store campaign in metadata
    const { data: lead } = await supabase
      .from('leads')
      .select('metadata')
      .eq('id', lead_id)
      .single();

    updateData.metadata = {
      ...(lead?.metadata || {}),
      campaign
    };
  }

  const { error } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', lead_id);

  if (error) {
    throw new Error(`Failed to add source: ${error.message}`);
  }

  return success(
    { lead_id },
    { db_writes: [{ table: 'leads', action: 'update', id: lead_id }] }
  );
}

/**
 * leads.add_photos_link - Attach photo/video links to a lead
 */
export async function add_photos_link(input) {
  const { lead_id, links } = input;

  // Get current metadata
  const { data: lead, error: fetchError } = await supabase
    .from('leads')
    .select('metadata')
    .eq('id', lead_id)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch lead: ${fetchError.message}`);
  }

  const currentLinks = lead.metadata?.photo_links || [];
  const newLinks = [...currentLinks, ...links];

  const { error } = await supabase
    .from('leads')
    .update({
      metadata: {
        ...lead.metadata,
        photo_links: newLinks
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', lead_id);

  if (error) {
    throw new Error(`Failed to add photos link: ${error.message}`);
  }

  return success(
    { lead_id, links_count: newLinks.length },
    { db_writes: [{ table: 'leads', action: 'update', id: lead_id }] }
  );
}

/**
 * leads.schedule_inspection - Create an inspection appointment for a lead
 */
export async function schedule_inspection(input) {
  const { lead_id, preferred_window, notes, site_address } = input;

  // Get lead info
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, address, suburb, leadconnector_contact_id')
    .eq('id', lead_id)
    .single();

  if (leadError || !lead) {
    throw new Error(`Lead ${lead_id} not found`);
  }

  // Create inspection record
  const { data: inspection, error: inspError } = await supabase
    .from('inspections')
    .insert({
      lead_id,
      leadconnector_contact_id: lead.leadconnector_contact_id,
      site_address: site_address || lead.address,
      site_suburb: lead.suburb,
      scheduled_at: preferred_window,
      notes,
      status: 'scheduled',
      created_by: 'leads.schedule_inspection'
    })
    .select('id')
    .single();

  if (inspError) {
    throw new Error(`Failed to create inspection: ${inspError.message}`);
  }

  // Update lead status
  await supabase
    .from('leads')
    .update({
      status: 'inspection_scheduled',
      updated_at: new Date().toISOString()
    })
    .eq('id', lead_id);

  return success(
    { lead_id, inspection_id: inspection.id },
    { 
      db_writes: [
        { table: 'inspections', action: 'insert', id: inspection.id },
        { table: 'leads', action: 'update', id: lead_id }
      ]
    }
  );
}

/**
 * leads.list_by_stage - List leads filtered by status and optional filters
 * Note: Uses `status` column (not `stage`)
 */
export async function list_by_stage(input) {
  const { stage, suburb, source, limit = 50 } = input || {};

  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (stage) {
    query = query.eq('status', stage); // Map stage param to status column
  }

  if (suburb) {
    query = query.ilike('suburb', `%${suburb}%`);
  }

  if (source) {
    query = query.eq('source', source);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list leads: ${error.message}`);
  }

  return success(
    { leads: data || [], count: data?.length || 0 },
    { db_reads: [{ table: 'leads', count: data?.length || 0 }] }
  );
}

/**
 * leads.mark_lost - Mark a lead as lost with a reason
 */
export async function mark_lost(input) {
  const { lead_id, reason, notes } = input;

  // Get current lead
  const { data: lead } = await supabase
    .from('leads')
    .select('metadata')
    .eq('id', lead_id)
    .single();

  const { error } = await supabase
    .from('leads')
    .update({
      status: 'lost',
      metadata: {
        ...(lead?.metadata || {}),
        lost_reason: reason,
        lost_at: new Date().toISOString()
      },
      notes: notes || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', lead_id);

  if (error) {
    throw new Error(`Failed to mark lead lost: ${error.message}`);
  }

  return success(
    { lead_id, status: 'lost' },
    { db_writes: [{ table: 'leads', action: 'update', id: lead_id }] }
  );
}
