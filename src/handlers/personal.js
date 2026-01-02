import { notConfigured } from '../lib/responses.js';

/**
 * Personal handlers
 * These handlers return 'not_configured' status as they require
 * personal tracking tables and commitment management.
 */

/**
 * personal.check_in - Record a quick personal check-in
 */
export async function check_in(input) {
  return notConfigured('personal.check_in', {
    reason: 'Personal check-in table not configured',
    required_env: [],
    next_steps: ['Create checkins table', 'Define energy/stress/focus schema']
  });
}

/**
 * personal.create_commitment - Create a personal commitment
 */
export async function create_commitment(input) {
  return notConfigured('personal.create_commitment', {
    reason: 'Commitments table not configured',
    required_env: [],
    next_steps: ['Create commitments table', 'Implement reminder scheduling']
  });
}

/**
 * personal.review_commitments - List current personal commitments
 */
export async function review_commitments(input) {
  return notConfigured('personal.review_commitments', {
    reason: 'Commitments table not configured',
    required_env: [],
    next_steps: ['Create commitments table']
  });
}

/**
 * personal.decision_support - Decision support: structure options/tradeoffs
 */
export async function decision_support(input) {
  return notConfigured('personal.decision_support', {
    reason: 'AI decision support not configured',
    required_env: [],
    next_steps: ['Integrate AI reasoning service', 'Define decision framework']
  });
}

/**
 * personal.boundary_set - Store a personal boundary as a memory primitive
 */
export async function boundary_set(input) {
  return notConfigured('personal.boundary_set', {
    reason: 'Memory primitives table not configured',
    required_env: [],
    next_steps: ['Create memory_primitives table', 'Implement keyed idempotency']
  });
}
