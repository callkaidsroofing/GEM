/**
 * Standard response helpers for CKR-CORE tool handlers.
 * These ensure consistent receipt payloads across all tools.
 */

/**
 * Create a not_configured response with proper structure.
 * Use this when a tool requires external providers or additional setup.
 *
 * @param {string} toolName - Full tool name (e.g., 'comms.send_sms')
 * @param {Object} options - Configuration options
 * @param {string} options.reason - Why the tool is not configured
 * @param {string[]} options.required_env - Environment variables needed
 * @param {string[]} options.next_steps - Steps to enable this tool
 */
export function notConfigured(toolName, options = {}) {
  const {
    reason = `Tool ${toolName} requires additional configuration`,
    required_env = [],
    next_steps = []
  } = options;

  return {
    result: {
      status: 'not_configured',
      reason,
      required_env,
      next_steps
    },
    effects: {}
  };
}

/**
 * Create a successful response with result and effects.
 *
 * @param {Object} result - The result payload
 * @param {Object} effects - Effects record (db_writes, messages_sent, etc.)
 */
export function success(result, effects = {}) {
  return {
    result,
    effects
  };
}

/**
 * Create a failed response (throw this as an error in handlers).
 * Note: For validation failures, the executor handles this automatically.
 * Use this for execution errors within handlers.
 *
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {Object} details - Additional error details
 */
export function failed(message, code = 'execution_error', details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
