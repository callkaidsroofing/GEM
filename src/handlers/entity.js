import { supabase } from '../lib/supabase.js';
import { notConfigured, success } from '../lib/responses.js';

/**
 * entity.create - Create an entity record (client/supplier/partner/friend/lead/other)
 * Real DB-backed implementation
 */
export async function create(input) {
  const { entity_type, name, contact = {}, notes } = input;

  const { data, error } = await supabase
    .from('entities')
    .insert({
      type: entity_type,
      name,
      metadata: { contact, notes }
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create entity: ${error.message}`);
  }

  return success(
    { entity_id: data.id },
    { db_writes: [{ table: 'entities', action: 'insert', id: data.id }] }
  );
}

/**
 * entity.update - Update an entity record with a patch
 * Real DB-backed implementation
 */
export async function update(input) {
  const { entity_id, patch } = input;

  // Get current entity to merge metadata
  const { data: current, error: fetchError } = await supabase
    .from('entities')
    .select('metadata')
    .eq('id', entity_id)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch entity: ${fetchError.message}`);
  }

  const updateData = {
    updated_at: new Date().toISOString()
  };

  if (patch.name) updateData.name = patch.name;
  if (patch.entity_type) updateData.type = patch.entity_type;
  if (patch.contact || patch.notes) {
    updateData.metadata = {
      ...current.metadata,
      ...(patch.contact && { contact: patch.contact }),
      ...(patch.notes && { notes: patch.notes })
    };
  }

  const { error } = await supabase
    .from('entities')
    .update(updateData)
    .eq('id', entity_id);

  if (error) {
    throw new Error(`Failed to update entity: ${error.message}`);
  }

  return success(
    { entity_id },
    { db_writes: [{ table: 'entities', action: 'update', id: entity_id }] }
  );
}

/**
 * entity.search - Search entities by name/phone/email and optional type filter
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
    queryBuilder = queryBuilder.eq('type', entity_type);
  }

  if (query) {
    queryBuilder = queryBuilder.ilike('name', `%${query}%`);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Failed to search entities: ${error.message}`);
  }

  return success({ results: data || [] }, {});
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

  return success({ entity: data }, {});
}

/**
 * entity.link_to_conversation - Link an entity to a conversation/thread
 * Not configured: requires conversation tracking system
 */
export async function link_to_conversation(input) {
  return notConfigured('entity.link_to_conversation', {
    reason: 'Conversation tracking system not configured',
    required_env: [],
    next_steps: ['Implement conversation tracking table', 'Add entity_conversation_links table']
  });
}

/**
 * entity.add_interaction - Record an interaction with an entity
 * Not configured: requires interactions table
 */
export async function add_interaction(input) {
  return notConfigured('entity.add_interaction', {
    reason: 'Entity interactions table not configured',
    required_env: [],
    next_steps: ['Create entity_interactions table', 'Implement interaction logging']
  });
}

/**
 * entity.add_address_site_details - Store site logistics for an entity
 * Not configured: requires site details schema
 */
export async function add_address_site_details(input) {
  return notConfigured('entity.add_address_site_details', {
    reason: 'Site details schema not configured',
    required_env: [],
    next_steps: ['Define site_details JSON schema', 'Add site_details column to entities']
  });
}
