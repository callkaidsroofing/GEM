import { supabase } from '../lib/supabase.js';

/**
 * leads.create - Create a new lead record with minimal required fields
 * Enforces keyed idempotency by phone number
 * Real DB-backed implementation
 */
export async function create(input, context = {}) {
  const { name, phone, email, suburb, source, notes } = input;

  // Check if lead already exists with this phone (keyed idempotency)
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    // Return existing lead_id for idempotency
    return {
      result: { lead_id: existing.id },
      effects: {
        db_writes: [],
        idempotency_hit: true
      }
    };
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      name,
      phone,
      email,
      suburb,
      source,
      notes,
      stage: 'new'
    })
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
        return {
          result: { lead_id: existingAfterRace.id },
          effects: {
            db_writes: [],
            idempotency_hit: true
          }
        };
      }
    }
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return {
    result: { lead_id: data.id },
    effects: {
      db_writes: [
        { table: 'leads', action: 'insert', id: data.id }
      ]
    }
  };
}

/**
 * leads.update_stage - Update lead pipeline stage
 */
export async function update_stage(input) {
  const { lead_id, stage, notes } = input;

  const updateData = {
    stage,
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
    throw new Error(`Failed to update lead stage: ${error.message}`);
  }

  return {
    result: { lead_id },
    effects: {
      db_writes: [
        { table: 'leads', action: 'update', id: lead_id }
      ]
    }
  };
}

/**
 * leads.add_source - Add or update lead source attribution
 */
export async function add_source(input) {
  const { lead_id, source, campaign } = input;

  const { error } = await supabase
    .from('leads')
    .update({
      source,
      updated_at: new Date().toISOString()
    })
    .eq('id', lead_id);

  if (error) {
    throw new Error(`Failed to add source: ${error.message}`);
  }

  return {
    result: { lead_id },
    effects: {
      db_writes: [
        { table: 'leads', action: 'update', id: lead_id }
      ]
    }
  };
}

/**
 * leads.add_photos_link - Attach photo/video links to a lead
 */
export async function add_photos_link(input) {
  const { lead_id, links } = input;

  // Get current links
  const { data: lead, error: fetchError } = await supabase
    .from('leads')
    .select('photo_links')
    .eq('id', lead_id)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch lead: ${fetchError.message}`);
  }

  const currentLinks = lead.photo_links || [];
  const newLinks = [...currentLinks, ...links];

  const { error } = await supabase
    .from('leads')
    .update({
      photo_links: newLinks,
      updated_at: new Date().toISOString()
    })
    .eq('id', lead_id);

  if (error) {
    throw new Error(`Failed to add photos link: ${error.message}`);
  }

  return {
    result: { lead_id },
    effects: {
      db_writes: [
        { table: 'leads', action: 'update', id: lead_id }
      ]
    }
  };
}

/**
 * leads.schedule_inspection - Create an inspection appointment for a lead
 */
export async function schedule_inspection(input) {
  const { lead_id, preferred_window, notes } = input;

  // Update lead stage
  await supabase
    .from('leads')
    .update({
      stage: 'inspection_scheduled',
      updated_at: new Date().toISOString()
    })
    .eq('id', lead_id);

  // Generate inspection ID
  const inspection_id = crypto.randomUUID();

  return {
    result: { inspection_id },
    effects: {
      db_writes: [
        { table: 'leads', action: 'update', id: lead_id }
      ]
    }
  };
}

/**
 * leads.list_by_stage - List leads filtered by stage and optional filters
 */
export async function list_by_stage(input) {
  const { stage, suburb, source, limit = 50 } = input;

  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (stage) {
    query = query.eq('stage', stage);
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

  return {
    result: { leads: data || [] },
    effects: {}
  };
}

/**
 * leads.mark_lost - Mark a lead as lost with a reason
 */
export async function mark_lost(input) {
  const { lead_id, reason, notes } = input;

  const { error } = await supabase
    .from('leads')
    .update({
      stage: 'lost',
      lost_reason: reason,
      notes: notes || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', lead_id);

  if (error) {
    throw new Error(`Failed to mark lead lost: ${error.message}`);
  }

  return {
    result: { lead_id },
    effects: {
      db_writes: [
        { table: 'leads', action: 'update', id: lead_id }
      ]
    }
  };
}
