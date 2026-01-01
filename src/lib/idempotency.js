import { supabase } from './supabase.js';

/**
 * Idempotency modes:
 * - safe-retry: return existing receipt if present
 * - keyed: compute key from tool + key_field (not fully specified, but we'll handle basic case)
 * - none: always execute
 */
export async function checkIdempotency(tool, call) {
  const mode = tool.idempotency?.mode || 'none';

  if (mode === 'none') {
    return null;
  }

  if (mode === 'safe-retry') {
    // Check if a receipt already exists for this call_id
    const { data, error } = await supabase
      .from('core_tool_receipts')
      .select('*')
      .eq('call_id', call.id)
      .maybeSingle();

    if (error) {
      console.error('Error checking idempotency:', error);
      return null;
    }

    return data;
  }

  if (mode === 'keyed') {
    const key = call.idempotency_key;
    if (!key) return null;

    // Check if a receipt exists with the same tool_name and idempotency_key
    // Note: We need to join with core_tool_calls to check idempotency_key
    const { data, error } = await supabase
      .from('core_tool_receipts')
      .select('*, core_tool_calls!inner(idempotency_key)')
      .eq('tool_name', tool.name)
      .eq('core_tool_calls.idempotency_key', key)
      .maybeSingle();

    if (error) {
      console.error('Error checking keyed idempotency:', error);
      return null;
    }

    return data;
  }

  return null;
}
