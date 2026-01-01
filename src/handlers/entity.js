import { supabase } from '../lib/supabase.js';

/**
 * entity.create - Create an entity record
 * Real DB-backed implementation
 */
export async function create(input) {
  const { entity_type, name, contact, notes } = input;

  const { data, error } = await supabase
    .from('entities')
    .insert({
      entity_type,
      name,
      contact: contact || {},
      notes
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create entity: ${error.message}`);
  }

  return {
    result: { entity_id: data.id },
    effects: {
      db_writes: [{ table: 'entities', action: 'insert', id: data.id }]
    }
  };
}

/**
 * entity.update - Update an entity record with a patch
 * Real DB-backed implementation
 */
export async function update(input) {
  const { entity_id, patch } = input;

  const { error } = await supabase
    .from('entities')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', entity_id);

  if (error) {
    throw new Error(`Failed to update entity: ${error.message}`);
  }

  return {
    result: { entity_id },
    effects: {
      db_writes: [{ table: 'entities', action: 'update', id: entity_id }]
    }
  };
}

/**
 * entity.search - Search entities by name/phone/email
 * Real DB-backed implementation
 */
export async function search(input) {
  const { query, entity_type, limit = 20 } = input;

  let queryBuilder = supabase
    .from('entities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (entity_type) {
    queryBuilder = queryBuilder.eq('entity_type', entity_type);
  }

  if (query) {
    queryBuilder = queryBuilder.ilike('name', `%${query}%`);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to search entities: ${error.message}`);
  }

  return {
    result: { results: data || [] },
    effects: {}
  };
}

/**
 * entity.get - Get a single entity by entity_id
 * Real DB-backed implementation
 */
export async function get(input) {
  const { entity_id } = input;

  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('id', entity_id)
    .single();

  if (error) {
    throw new Error(`Failed to get entity: ${error.message}`);
  }

  return {
    result: { entity: data },
    effects: {}
  };
}

/**
 * entity.link_to_conversation - Link entity to a conversation
 * Real DB-backed implementation (stores in metadata)
 */
export async function link_to_conversation(input) {
  const { entity_id, conversation_id } = input;

  const { data: entity, error: fetchError } = await supabase
    .from('entities')
    .select('metadata')
    .eq('id', entity_id)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch entity: ${fetchError.message}`);
  }

  const metadata = entity.metadata || {};
  const conversations = metadata.conversations || [];
  if (!conversations.includes(conversation_id)) {
    conversations.push(conversation_id);
  }

  const { error } = await supabase
    .from('entities')
    .update({
      metadata: { ...metadata, conversations },
      updated_at: new Date().toISOString()
    })
    .eq('id', entity_id);

  if (error) {
    throw new Error(`Failed to link conversation: ${error.message}`);
  }

  return {
    result: { linked: true },
    effects: {
      db_writes: [{ table: 'entities', action: 'update', id: entity_id }]
    }
  };
}

/**
 * entity.add_interaction - Record an interaction with an entity
 * Real DB-backed implementation
 */
export async function add_interaction(input) {
  const { entity_id, interaction_type, summary, details, occurred_at } = input;

  const { data, error } = await supabase
    .from('interactions')
    .insert({
      entity_id,
      interaction_type,
      summary,
      details: details || {},
      occurred_at: occurred_at || new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to add interaction: ${error.message}`);
  }

  return {
    result: { interaction_id: data.id },
    effects: {
      db_writes: [{ table: 'interactions', action: 'insert', id: data.id }]
    }
  };
}

/**
 * entity.add_address_site_details - Store site logistics
 * Real DB-backed implementation
 */
export async function add_address_site_details(input) {
  const { entity_id, site_details } = input;

  const { error } = await supabase
    .from('entities')
    .update({
      site_details,
      updated_at: new Date().toISOString()
    })
    .eq('id', entity_id);

  if (error) {
    throw new Error(`Failed to add site details: ${error.message}`);
  }

  return {
    result: { saved: true },
    effects: {
      db_writes: [{ table: 'entities', action: 'update', id: entity_id }]
    }
  };
}
