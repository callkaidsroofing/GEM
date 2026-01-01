import { supabase } from '../lib/supabase.js';

/**
 * finance.generate_cashflow_snapshot - Generate a basic cashflow snapshot
 * Real DB-backed implementation
 */
export async function generate_cashflow_snapshot(input) {
  const { from, to } = input;

  // Get invoices in date range
  let query = supabase
    .from('invoices')
    .select('total_cents, paid_cents, status, created_at');

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data: invoices, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch invoices: ${error.message}`);
  }

  const total_invoiced = (invoices || []).reduce((sum, inv) => sum + (inv.total_cents || 0), 0);
  const total_received = (invoices || []).reduce((sum, inv) => sum + (inv.paid_cents || 0), 0);
  const outstanding = total_invoiced - total_received;

  return {
    result: {
      summary: {
        total_invoiced_cents: total_invoiced,
        total_received_cents: total_received,
        outstanding_cents: outstanding,
        invoice_count: (invoices || []).length,
        period: { from, to }
      }
    },
    effects: {}
  };
}

/**
 * finance.generate_pnl_snapshot - Generate a lightweight P&L snapshot
 * Real DB-backed implementation
 */
export async function generate_pnl_snapshot(input) {
  const { from, to } = input;

  // Get paid invoices in date range for revenue
  let query = supabase
    .from('invoices')
    .select('total_cents, paid_cents, status')
    .eq('status', 'paid');

  if (from) query = query.gte('paid_at', from);
  if (to) query = query.lte('paid_at', to);

  const { data: invoices, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch invoices: ${error.message}`);
  }

  const revenue_cents = (invoices || []).reduce((sum, inv) => sum + (inv.paid_cents || 0), 0);
  // Placeholder: direct costs would come from a separate expenses table
  const direct_costs_cents = 0;
  const gross_margin_cents = revenue_cents - direct_costs_cents;

  return {
    result: {
      summary: {
        revenue_cents,
        direct_costs_cents,
        gross_margin_cents,
        period: { from, to },
        note: 'Direct costs not yet tracked - requires expenses table'
      }
    },
    effects: {}
  };
}
