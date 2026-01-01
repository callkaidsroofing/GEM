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
      next_steps: 'Identity system tables not yet implemented'
    },
    effects: {}
  };
}

/**
 * identity.get_self_model - Fetch current identity/self-model
 */
export async function get_self_model(input) {
  return notConfigured('identity.get_self_model');
}

/**
 * identity.update_self_model - Update identity/self-model with a validated patch
 */
export async function update_self_model(input) {
  return notConfigured('identity.update_self_model');
}

/**
 * identity.add_memory - Add or update a curated memory primitive
 */
export async function add_memory(input) {
  return notConfigured('identity.add_memory');
}

/**
 * identity.expire_memory - Expire a memory primitive
 */
export async function expire_memory(input) {
  return notConfigured('identity.expire_memory');
}

/**
 * identity.list_memories - List active memories by type and/or key prefix
 */
export async function list_memories(input) {
  return notConfigured('identity.list_memories');
}

/**
 * identity.score_pattern - Record an observed pattern with confidence
 */
export async function score_pattern(input) {
  return notConfigured('identity.score_pattern');
}

/**
 * identity.set_boundaries - Set or update boundary/veto rules
 */
export async function set_boundaries(input) {
  return notConfigured('identity.set_boundaries');
}
