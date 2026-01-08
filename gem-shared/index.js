/**
 * GEM Shared Module
 *
 * Single source of truth for contracts, schemas, and validation
 * shared across gem-brain and gem-core modules.
 */

// Contract Types
export {
  IDEMPOTENCY_MODES,
  RECEIPT_STATUSES,
  TOOL_PERMISSIONS,
  validateToolContract
} from './contracts/tool-contract.js';

export {
  RECEIPT_SCHEMA,
  createReceipt,
  createSuccessReceipt,
  createFailedReceipt,
  createNotConfiguredReceipt
} from './contracts/receipt-contract.js';

export {
  INSPECTION_PACKET_V1_SCHEMA,
  normalizeInspectionPacket,
  validateInspectionPacket
} from './contracts/inspection-packet.js';

export {
  IDEMPOTENCY_CONFIG,
  getIdempotencyKey,
  shouldCheckIdempotency
} from './contracts/idempotency.js';

// Validation
export {
  createValidator,
  validateAgainstSchema
} from './validation/ajv-validator.js';

// Schema paths (for direct import)
export const SCHEMAS = {
  INSPECTION_PACKET_V1: './schemas/inspection-packet-v1.json',
  TOOL_CALL: './schemas/tool-call.json'
};
