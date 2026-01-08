/**
 * Idempotency Contract
 *
 * Defines idempotency behavior and utilities for tool execution.
 * Idempotency is enforced by the executor BEFORE handler execution.
 */

import { IDEMPOTENCY_MODES } from './tool-contract.js';

/**
 * Idempotency configuration schema
 */
export const IDEMPOTENCY_CONFIG = {
  /**
   * none: Execute every time, no deduplication
   * - Handler runs on every call
   * - Suitable for read-only operations
   * - Example: os.health_check, leads.list_by_stage
   */
  none: {
    description: 'Execute every time, no deduplication',
    requires_key: false,
    use_cases: ['read operations', 'status checks', 'listings']
  },

  /**
   * safe-retry: Return existing receipt if one exists for this call_id
   * - Prevents duplicate execution of the same call
   * - Suitable for operations that should not run twice
   * - Example: inspection.submit, quote.send
   */
  'safe-retry': {
    description: 'Return existing receipt if call_id already processed',
    requires_key: false,
    use_cases: ['submit operations', 'send operations', 'one-time actions']
  },

  /**
   * keyed: Check for existing receipt matching tool_name + key_field value
   * - Prevents duplicate creation based on business key
   * - Requires key_field in idempotency config
   * - Example: leads.create (phone), media.register_asset (file_ref)
   */
  keyed: {
    description: 'Check for existing record using business key before creation',
    requires_key: true,
    use_cases: ['create operations', 'registration', 'unique entities']
  }
};

/**
 * Check if idempotency should be checked for a tool
 *
 * @param {Object} tool - Tool definition from registry
 * @returns {boolean}
 */
export function shouldCheckIdempotency(tool) {
  if (!tool.idempotency) {
    return false;
  }

  return tool.idempotency.mode !== 'none';
}

/**
 * Get the idempotency key for a tool call
 *
 * @param {Object} tool - Tool definition from registry
 * @param {Object} input - Tool call input
 * @returns {string|null} The idempotency key or null
 */
export function getIdempotencyKey(tool, input) {
  if (!tool.idempotency) {
    return null;
  }

  if (tool.idempotency.mode === 'keyed' && tool.idempotency.key_field) {
    const keyValue = input[tool.idempotency.key_field];
    if (keyValue) {
      return `${tool.name}:${tool.idempotency.key_field}:${keyValue}`;
    }
  }

  return null;
}

/**
 * Validate idempotency configuration for a tool
 *
 * @param {Object} idempotency - Idempotency config from tool
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateIdempotencyConfig(idempotency) {
  const errors = [];

  if (!idempotency) {
    errors.push('Idempotency configuration is required');
    return { valid: false, errors };
  }

  if (!idempotency.mode) {
    errors.push('Idempotency mode is required');
  } else if (!IDEMPOTENCY_MODES.includes(idempotency.mode)) {
    errors.push(`Invalid idempotency mode: ${idempotency.mode}`);
  }

  if (idempotency.mode === 'keyed') {
    if (!idempotency.key_field) {
      errors.push('Keyed idempotency requires key_field');
    }
    if (typeof idempotency.key_field !== 'string') {
      errors.push('key_field must be a string');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if input satisfies keyed idempotency requirements
 *
 * @param {Object} tool - Tool definition
 * @param {Object} input - Tool call input
 * @returns {{ valid: boolean, error: string|null }}
 */
export function checkKeyedIdempotencyInput(tool, input) {
  if (tool.idempotency?.mode !== 'keyed') {
    return { valid: true, error: null };
  }

  const keyField = tool.idempotency.key_field;
  if (!keyField) {
    return { valid: false, error: 'Tool has keyed idempotency but no key_field defined' };
  }

  if (input[keyField] === undefined || input[keyField] === null) {
    return {
      valid: false,
      error: `Missing required key field for keyed idempotency: ${keyField}`
    };
  }

  if (input[keyField] === '') {
    return {
      valid: false,
      error: `Key field ${keyField} cannot be empty`
    };
  }

  return { valid: true, error: null };
}

/**
 * Build idempotency effects for receipt
 *
 * @param {Object} tool - Tool definition
 * @param {Object} input - Tool call input
 * @param {boolean} hit - Whether idempotency was hit
 * @returns {Object} Idempotency effects object
 */
export function buildIdempotencyEffects(tool, input, hit = false) {
  const effects = {
    mode: tool.idempotency?.mode || 'none',
    hit
  };

  if (tool.idempotency?.key_field) {
    effects.key_field = tool.idempotency.key_field;
    effects.key_value = input[tool.idempotency.key_field];
  }

  return effects;
}
