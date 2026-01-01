import { supabase } from '../lib/supabase.js';

/**
 * Helper for not_configured responses
 */
function notConfigured(toolName, reason = 'feature_pending') {
  return {
    result: {
      status: 'not_configured',
      reason,
      message: `Handler for ${toolName} requires additional configuration`,
      next_steps: 'Personal domain tables not yet implemented'
    },
    effects: {}
  };
}

/**
 * personal.check_in - Record a quick personal check-in
 * Real DB-backed implementation (stores as a note)
 */
export async function check_in(input) {
  const { energy, stress, focus, notes } = input;

  const { data, error } = await supabase
    .from('notes')
    .insert({
      domain: 'personal',
      title: `Check-in: E:${energy} S:${stress} F:${focus}`,
      content: notes || `Energy: ${energy}, Stress: ${stress}, Focus: ${focus}`,
      entity_refs: [{ type: 'checkin', energy, stress, focus }]
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create check-in: ${error.message}`);
  }

  return {
    result: { checkin_id: data.id },
    effects: {
      db_writes: [{ table: 'notes', action: 'insert', id: data.id }]
    }
  };
}

/**
 * personal.create_commitment - Create a personal commitment
 * Real DB-backed implementation (stores as a task)
 */
export async function create_commitment(input) {
  const { title, details, review_at } = input;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      domain: 'personal',
      description: details,
      due_at: review_at,
      status: 'open',
      context_ref: { type: 'commitment' }
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create commitment: ${error.message}`);
  }

  return {
    result: { commitment_id: data.id },
    effects: {
      db_writes: [{ table: 'tasks', action: 'insert', id: data.id }]
    }
  };
}

/**
 * personal.review_commitments - List current personal commitments
 * Real DB-backed implementation
 */
export async function review_commitments(input) {
  const { status = 'active', limit = 50 } = input;

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('domain', 'personal')
    .contains('context_ref', { type: 'commitment' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status === 'active') {
    query = query.eq('status', 'open');
  } else if (status === 'closed') {
    query = query.eq('status', 'done');
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list commitments: ${error.message}`);
  }

  return {
    result: { commitments: data || [] },
    effects: {}
  };
}

/**
 * personal.decision_support - Decision support analysis
 * Returns not_configured (requires LLM provider)
 */
export async function decision_support(input) {
  return notConfigured('personal.decision_support', 'requires_llm_provider');
}

/**
 * personal.boundary_set - Store a personal boundary
 * Returns not_configured (requires identity/memory system)
 */
export async function boundary_set(input) {
  return notConfigured('personal.boundary_set');
}
