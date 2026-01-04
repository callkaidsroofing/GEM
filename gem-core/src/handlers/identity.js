import { notConfigured } from '../lib/responses.js';

/**
 * Identity handlers
 * These handlers return 'not_configured' status as they require
 * the identity/self-model tables and memory primitives schema.
 */

/**
 * identity.get_self_model - Fetch the current identity/self-model
 */
export async function get_self_model(input) {
  return notConfigured('identity.get_self_model', {
    reason: 'Identity model tables not configured',
    required_env: [],
    next_steps: ['Create identity_model table', 'Define persona/values/boundaries schema']
  });
}

/**
 * identity.update_self_model - Update identity/self-model with a validated patch
 */
export async function update_self_model(input) {
  return notConfigured('identity.update_self_model', {
    reason: 'Identity model tables not configured',
    required_env: [],
    next_steps: ['Create identity_model table', 'Implement patch validation']
  });
}

/**
 * identity.add_memory - Add or update a curated memory primitive
 */
export async function add_memory(input) {
  return notConfigured('identity.add_memory', {
    reason: 'Memory primitives table not configured',
    required_env: [],
    next_steps: ['Create memory_primitives table', 'Implement keyed idempotency']
  });
}

/**
 * identity.expire_memory - Expire a memory primitive
 */
export async function expire_memory(input) {
  return notConfigured('identity.expire_memory', {
    reason: 'Memory primitives table not configured',
    required_env: [],
    next_steps: ['Create memory_primitives table', 'Add valid_to column']
  });
}

/**
 * identity.list_memories - List active memories by type and/or key prefix
 */
export async function list_memories(input) {
  return notConfigured('identity.list_memories', {
    reason: 'Memory primitives table not configured',
    required_env: [],
    next_steps: ['Create memory_primitives table']
  });
}

/**
 * identity.score_pattern - Record an observed pattern with confidence
 */
export async function score_pattern(input) {
  return notConfigured('identity.score_pattern', {
    reason: 'Pattern scoring table not configured',
    required_env: [],
    next_steps: ['Create patterns table', 'Implement confidence scoring']
  });
}

/**
 * identity.set_boundaries - Set or update boundary/veto rules
 */
export async function set_boundaries(input) {
  return notConfigured('identity.set_boundaries', {
    reason: 'Boundary rules table not configured',
    required_env: [],
    next_steps: ['Create boundary_rules table', 'Define boundary schema']
  });
}
