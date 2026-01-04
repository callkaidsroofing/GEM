import { notConfigured } from '../lib/responses.js';

/**
 * Finance handlers
 * These handlers return 'not_configured' status as they require
 * financial data aggregation and reporting tables.
 */

/**
 * finance.generate_cashflow_snapshot - Generate a basic cashflow snapshot
 */
export async function generate_cashflow_snapshot(input) {
  return notConfigured('finance.generate_cashflow_snapshot', {
    reason: 'Financial reporting tables not configured',
    required_env: [],
    next_steps: ['Create expenses table', 'Implement cashflow aggregation queries']
  });
}

/**
 * finance.generate_pnl_snapshot - Generate a lightweight P&L snapshot
 */
export async function generate_pnl_snapshot(input) {
  return notConfigured('finance.generate_pnl_snapshot', {
    reason: 'Financial reporting tables not configured',
    required_env: [],
    next_steps: ['Create cost_categories table', 'Implement P&L aggregation queries']
  });
}
