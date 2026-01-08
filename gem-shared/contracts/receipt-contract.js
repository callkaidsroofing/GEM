/**
 * Receipt Contract
 *
 * Defines the structure every tool execution must produce.
 * Receipts are immutable records of tool execution.
 */

import { RECEIPT_STATUSES } from './tool-contract.js';

/**
 * Receipt JSON Schema
 */
export const RECEIPT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'gem-receipt',
  type: 'object',
  required: ['status'],
  properties: {
    status: {
      enum: RECEIPT_STATUSES,
      description: 'Execution outcome status'
    },
    result: {
      type: 'object',
      description: 'Tool-specific result payload'
    },
    effects: {
      type: 'object',
      properties: {
        db_writes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['table', 'action'],
            properties: {
              table: { type: 'string' },
              action: { enum: ['insert', 'update', 'delete'] },
              id: { type: 'string' }
            }
          },
          description: 'Database write operations performed'
        },
        db_reads: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              table: { type: 'string' },
              count: { type: 'integer' }
            }
          },
          description: 'Database read operations performed'
        },
        messages_sent: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { enum: ['sms', 'email', 'push', 'webhook'] },
              recipient: { type: 'string' },
              message_id: { type: 'string' }
            }
          },
          description: 'Communications sent'
        },
        files_written: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              size_bytes: { type: 'integer' },
              mime_type: { type: 'string' }
            }
          },
          description: 'Files created or modified'
        },
        external_calls: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              service: { type: 'string' },
              endpoint: { type: 'string' },
              status_code: { type: 'integer' }
            }
          },
          description: 'External API calls made'
        },
        idempotency: {
          type: 'object',
          properties: {
            mode: { type: 'string' },
            hit: { type: 'boolean' },
            key_field: { type: 'string' },
            key_value: { type: 'string' }
          },
          description: 'Idempotency metadata'
        }
      }
    }
  }
};

/**
 * Create a receipt with proper structure
 *
 * @param {string} status - Receipt status
 * @param {Object} result - Result payload
 * @param {Object} effects - Effects record
 * @returns {Object} Properly structured receipt
 */
export function createReceipt(status, result = {}, effects = {}) {
  if (!RECEIPT_STATUSES.includes(status)) {
    throw new Error(`Invalid receipt status: ${status}. Valid statuses: ${RECEIPT_STATUSES.join(', ')}`);
  }

  return {
    status,
    result,
    effects: normalizeEffects(effects)
  };
}

/**
 * Create a success receipt
 *
 * @param {Object} result - Success result payload
 * @param {Object} effects - Effects record
 * @returns {Object} Success receipt
 */
export function createSuccessReceipt(result, effects = {}) {
  return createReceipt('succeeded', result, effects);
}

/**
 * Create a failed receipt
 *
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {Object} details - Error details
 * @returns {Object} Failed receipt
 */
export function createFailedReceipt(message, code = 'execution_error', details = {}) {
  return createReceipt('failed', {
    error: {
      code,
      message,
      details
    }
  }, {});
}

/**
 * Create a not_configured receipt
 *
 * @param {string} toolName - Tool name
 * @param {Object} options - Configuration options
 * @returns {Object} Not configured receipt
 */
export function createNotConfiguredReceipt(toolName, options = {}) {
  const {
    reason = `Tool ${toolName} requires additional configuration`,
    required_env = [],
    next_steps = []
  } = options;

  return createReceipt('not_configured', {
    status: 'not_configured',
    reason,
    required_env,
    next_steps
  }, {});
}

/**
 * Normalize effects object to ensure all arrays exist
 *
 * @param {Object} effects - Raw effects object
 * @returns {Object} Normalized effects
 */
function normalizeEffects(effects = {}) {
  return {
    db_writes: effects.db_writes || [],
    db_reads: effects.db_reads || [],
    messages_sent: effects.messages_sent || [],
    files_written: effects.files_written || [],
    external_calls: effects.external_calls || [],
    ...effects
  };
}

/**
 * Validate a receipt structure
 *
 * @param {Object} receipt - Receipt to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateReceipt(receipt) {
  const errors = [];

  if (!receipt) {
    errors.push('Receipt is null or undefined');
    return { valid: false, errors };
  }

  if (!receipt.status) {
    errors.push('Receipt must have a status');
  } else if (!RECEIPT_STATUSES.includes(receipt.status)) {
    errors.push(`Invalid receipt status: ${receipt.status}`);
  }

  if (receipt.status === 'failed' && !receipt.result?.error) {
    errors.push('Failed receipts must include an error in result');
  }

  if (receipt.status === 'not_configured' && !receipt.result?.reason) {
    errors.push('Not configured receipts must include a reason');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract audit fields from receipt based on tool's receipt_fields config
 *
 * @param {Object} receipt - Full receipt
 * @param {string[]} fields - Fields to extract (e.g., ['result.lead_id', 'effects.db_writes'])
 * @returns {Object} Extracted audit fields
 */
export function extractAuditFields(receipt, fields = []) {
  const audit = {};

  for (const field of fields) {
    const value = getNestedValue(receipt, field);
    if (value !== undefined) {
      audit[field] = value;
    }
  }

  return audit;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}
