/**
 * Tool Contract Types
 *
 * Single source of truth for tool contract structures.
 * Both gem-brain and gem-core must use these definitions.
 */

/**
 * Valid idempotency modes for tools
 * - none: Execute every time, no deduplication
 * - safe-retry: Return existing receipt if one exists for this call_id
 * - keyed: Check for existing receipt matching tool_name + idempotency_key
 */
export const IDEMPOTENCY_MODES = ['none', 'safe-retry', 'keyed'];

/**
 * Valid receipt statuses
 * - succeeded: Tool executed successfully
 * - failed: Tool execution failed with error
 * - not_configured: Tool exists but requires configuration
 */
export const RECEIPT_STATUSES = ['succeeded', 'failed', 'not_configured'];

/**
 * Valid tool permissions
 * Used to categorize what a tool can do
 */
export const TOOL_PERMISSIONS = [
  'read:db',      // Can read from database
  'write:db',     // Can write to database
  'read:files',   // Can read files/media
  'write:files',  // Can write files/media
  'send:comms',   // Can send communications (SMS, email, etc.)
  'call:external' // Can call external APIs
];

/**
 * Tool contract schema
 */
export const TOOL_CONTRACT_SCHEMA = {
  type: 'object',
  required: ['name', 'description', 'input_schema', 'output_schema', 'permissions', 'idempotency', 'timeout_ms'],
  properties: {
    name: {
      type: 'string',
      pattern: '^[a-z_]+\\.[a-z_]+$',
      description: 'Tool name in domain.method format'
    },
    description: {
      type: 'string',
      minLength: 10,
      description: 'Human-readable description of what the tool does'
    },
    input_schema: {
      type: 'object',
      description: 'JSON Schema for tool input validation'
    },
    output_schema: {
      type: 'object',
      description: 'JSON Schema for tool output validation'
    },
    permissions: {
      type: 'array',
      items: { enum: TOOL_PERMISSIONS }
    },
    idempotency: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { enum: IDEMPOTENCY_MODES },
        key_field: { type: 'string' }
      }
    },
    timeout_ms: {
      type: 'integer',
      minimum: 1000,
      maximum: 300000
    },
    receipt_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Fields to include in receipt audit'
    }
  }
};

/**
 * Validate a tool contract definition
 *
 * @param {Object} tool - Tool contract object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateToolContract(tool) {
  const errors = [];

  // Required fields
  if (!tool.name || typeof tool.name !== 'string') {
    errors.push('Tool must have a valid name');
  }

  // Name format: domain.method
  if (tool.name && !tool.name.includes('.')) {
    errors.push('Tool name must be in domain.method format (e.g., leads.create)');
  }

  // Name pattern check
  if (tool.name && !/^[a-z_]+(\.[a-z_]+)+$/.test(tool.name)) {
    errors.push('Tool name must use lowercase letters and underscores only');
  }

  // Description required
  if (!tool.description || tool.description.length < 10) {
    errors.push('Tool must have a meaningful description (min 10 chars)');
  }

  // Input schema required
  if (!tool.input_schema || typeof tool.input_schema !== 'object') {
    errors.push('Tool must have an input_schema object');
  }

  // Output schema required
  if (!tool.output_schema || typeof tool.output_schema !== 'object') {
    errors.push('Tool must have an output_schema object');
  }

  // Idempotency validation
  if (!tool.idempotency) {
    errors.push('Tool must define idempotency configuration');
  } else {
    if (!IDEMPOTENCY_MODES.includes(tool.idempotency.mode)) {
      errors.push(`Invalid idempotency mode: ${tool.idempotency.mode}. Valid modes: ${IDEMPOTENCY_MODES.join(', ')}`);
    }

    if (tool.idempotency.mode === 'keyed' && !tool.idempotency.key_field) {
      errors.push('Keyed idempotency requires key_field to be specified');
    }
  }

  // Timeout validation
  if (!tool.timeout_ms || typeof tool.timeout_ms !== 'number') {
    errors.push('Tool must have a timeout_ms value');
  } else if (tool.timeout_ms < 1000 || tool.timeout_ms > 300000) {
    errors.push('timeout_ms must be between 1000 and 300000');
  }

  // Permissions validation
  if (!Array.isArray(tool.permissions)) {
    errors.push('Tool must have a permissions array');
  } else {
    for (const perm of tool.permissions) {
      if (!TOOL_PERMISSIONS.includes(perm)) {
        errors.push(`Invalid permission: ${perm}. Valid permissions: ${TOOL_PERMISSIONS.join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Parse tool name into domain and method
 *
 * @param {string} toolName - Full tool name (e.g., 'leads.create')
 * @returns {{ domain: string, method: string, handlerExport: string }}
 */
export function parseToolName(toolName) {
  const parts = toolName.split('.');
  const domain = parts[0];
  const method = parts.slice(1).join('_'); // e.g., 'google_drive.search' → 'google_drive_search'

  return {
    domain,
    method,
    handlerExport: method,
    handlerPath: `./src/handlers/${domain}.js`
  };
}

/**
 * Build handler path from tool name
 *
 * @param {string} toolName - Full tool name
 * @returns {string} Handler file path
 */
export function getHandlerPath(toolName) {
  const { domain } = parseToolName(toolName);
  return `./src/handlers/${domain}.js`;
}
