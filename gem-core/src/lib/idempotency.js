import { supabase } from './supabase.js';

/**
 * Idempotency modes (as defined in registry):
 *
 * - none: Always execute, always create new receipt
 *
 * - safe-retry: If a receipt already exists for same call_id or idempotency_key,
 *   return existing receipt result, do not re-execute effects
 *
 * - keyed: Uses key_field from tool definition. If key field is missing → validation failure.
 *   If prior successful receipt exists for same tool_name + same key value,
 *   return prior result, do not create duplicate domain rows.
 *
 * Registry-verified keyed tools (AUTHORITATIVE):
 * - leads.create → key_field: phone
 * - media.register_asset → key_field: file_ref
 * - identity.add_memory → key_field: key
 * - identity.score_pattern → key_field: key
 * - personal.boundary_set → key_field: key
 */
export async function checkIdempotency(tool, call) {
  const mode = tool.idempotency?.mode || 'none';

  if (mode === 'none') {
    return null;
  }

  if (mode === 'safe-retry') {
    // First check by call_id (same request retried)
    const { data: byCallId, error: callIdError } = await supabase
      .from('core_tool_receipts')
      .select('*')
      .eq('call_id', call.id)
      .eq('status', 'succeeded')
      .maybeSingle();

    if (callIdError) {
      console.error('Error checking idempotency by call_id:', callIdError);
    }

    if (byCallId) {
      return byCallId;
    }

    // Then check by idempotency_key if provided
    if (call.idempotency_key) {
      const { data: byKey, error: keyError } = await supabase
        .from('core_tool_receipts')
        .select('*, core_tool_calls!inner(idempotency_key)')
        .eq('tool_name', tool.name)
        .eq('status', 'succeeded')
        .eq('core_tool_calls.idempotency_key', call.idempotency_key)
        .maybeSingle();

      if (keyError) {
        console.error('Error checking idempotency by key:', keyError);
        return null;
      }

      return byKey;
    }

    return null;
  }

  if (mode === 'keyed') {
    const keyField = tool.idempotency?.key_field;

    // Key field is required for keyed idempotency
    // Note: The executor should validate key_field presence before reaching here
    if (!keyField) {
      console.warn(`Keyed idempotency tool ${tool.name} missing key_field definition`);
      return null;
    }

    const keyValue = call.input?.[keyField];
    if (!keyValue) {
      // Missing key value - let executor handle as validation error
      return null;
    }

    // Compute idempotency key as: tool_name + key_field_value
    const computedKey = `${tool.name}:${keyField}:${keyValue}`;

    // Check for existing successful receipt with same computed key
    // We store the computed key in a special way: check receipts where
    // the result contains the same key value for successful operations
    const { data: existingReceipts, error } = await supabase
      .from('core_tool_receipts')
      .select('*, core_tool_calls!inner(input)')
      .eq('tool_name', tool.name)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error checking keyed idempotency:', error);
      return null;
    }

    // Find a receipt where the input's key_field matches our key value
    for (const receipt of existingReceipts || []) {
      const receiptInput = receipt.core_tool_calls?.input;
      if (receiptInput && receiptInput[keyField] === keyValue) {
        console.log(`Keyed idempotency hit for ${tool.name}: ${keyField}=${keyValue}`);
        return receipt;
      }
    }

    return null;
  }

  return null;
}

/**
 * Compute idempotency key for a keyed tool call.
 * Used to generate consistent keys for deduplication.
 */
export function computeIdempotencyKey(tool, input) {
  const mode = tool.idempotency?.mode;
  const keyField = tool.idempotency?.key_field;

  if (mode !== 'keyed' || !keyField) {
    return null;
  }

  const keyValue = input?.[keyField];
  if (!keyValue) {
    return null;
  }

  return `${tool.name}:${keyField}:${keyValue}`;
}
