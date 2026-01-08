/**
 * GEM Standardized Error System
 *
 * Provides consistent error codes, structured error objects,
 * and error handling utilities across the GEM platform.
 */

/**
 * Error code registry - single source of truth for all GEM errors
 */
export const ErrorCodes = {
  // Validation errors (E001-E099)
  VALIDATION_ERROR: 'E001',
  SCHEMA_VALIDATION_FAILED: 'E002',
  MISSING_REQUIRED_FIELD: 'E003',
  INVALID_FIELD_TYPE: 'E004',
  INVALID_ENUM_VALUE: 'E005',

  // Registry errors (E100-E199)
  REGISTRY_NOT_FOUND: 'E100',
  TOOL_NOT_FOUND: 'E101',
  HANDLER_NOT_FOUND: 'E102',
  REGISTRY_VERSION_MISMATCH: 'E103',

  // Execution errors (E200-E299)
  EXECUTION_TIMEOUT: 'E200',
  HANDLER_THREW: 'E201',
  RECEIPT_WRITE_FAILED: 'E202',
  CLAIM_FAILED: 'E203',

  // Database errors (E300-E399)
  DATABASE_ERROR: 'E300',
  UNIQUE_CONSTRAINT_VIOLATION: 'E301',
  FOREIGN_KEY_VIOLATION: 'E302',
  CONNECTION_ERROR: 'E303',
  QUERY_ERROR: 'E304',

  // Integration errors (E400-E499)
  INTEGRATION_NOT_CONFIGURED: 'E400',
  INTEGRATION_AUTH_FAILED: 'E401',
  INTEGRATION_RATE_LIMITED: 'E402',
  INTEGRATION_TIMEOUT: 'E403',
  INTEGRATION_API_ERROR: 'E404',
  WEBHOOK_SIGNATURE_INVALID: 'E405',

  // Idempotency errors (E500-E599)
  IDEMPOTENCY_KEY_MISSING: 'E500',
  IDEMPOTENCY_VIOLATION: 'E501',
  DUPLICATE_CALL_DETECTED: 'E502',

  // Business logic errors (E600-E699)
  LEAD_NOT_FOUND: 'E600',
  QUOTE_NOT_FOUND: 'E601',
  JOB_NOT_FOUND: 'E602',
  INVALID_STATE_TRANSITION: 'E603',
  PRECONDITION_FAILED: 'E604',
};

/**
 * Base GEM Error class with structured metadata
 */
export class GEMError extends Error {
  /**
   * @param {string} code - Error code from ErrorCodes
   * @param {string} message - Human-readable error message
   * @param {Object} context - Additional context for debugging
   */
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'GEMError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GEMError);
    }
  }

  /**
   * Convert to JSON for logging and API responses
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }

  /**
   * Create a receipt-compatible error object
   */
  toReceipt() {
    return {
      status: 'failed',
      result: {},
      effects: {
        errors: [this.toJSON()],
      },
    };
  }
}

/**
 * Validation-specific error
 */
export class ValidationError extends GEMError {
  constructor(message, field, expected, actual) {
    super(ErrorCodes.VALIDATION_ERROR, message, { field, expected, actual });
    this.name = 'ValidationError';
  }
}

/**
 * Database-specific error with Supabase error mapping
 */
export class DatabaseError extends GEMError {
  constructor(message, supabaseError = null) {
    const code = DatabaseError.mapSupabaseError(supabaseError);
    super(code, message, {
      originalCode: supabaseError?.code,
      details: supabaseError?.details,
      hint: supabaseError?.hint,
    });
    this.name = 'DatabaseError';
  }

  static mapSupabaseError(error) {
    if (!error?.code) return ErrorCodes.DATABASE_ERROR;

    const mapping = {
      '23505': ErrorCodes.UNIQUE_CONSTRAINT_VIOLATION,
      '23503': ErrorCodes.FOREIGN_KEY_VIOLATION,
      'PGRST301': ErrorCodes.CONNECTION_ERROR,
    };

    return mapping[error.code] || ErrorCodes.DATABASE_ERROR;
  }
}

/**
 * Integration-specific error
 */
export class IntegrationError extends GEMError {
  constructor(integration, message, statusCode = null) {
    const code = IntegrationError.mapStatusCode(statusCode);
    super(code, message, { integration, statusCode });
    this.name = 'IntegrationError';
  }

  static mapStatusCode(status) {
    if (!status) return ErrorCodes.INTEGRATION_API_ERROR;

    if (status === 401 || status === 403) return ErrorCodes.INTEGRATION_AUTH_FAILED;
    if (status === 429) return ErrorCodes.INTEGRATION_RATE_LIMITED;
    if (status === 408 || status === 504) return ErrorCodes.INTEGRATION_TIMEOUT;

    return ErrorCodes.INTEGRATION_API_ERROR;
  }
}

/**
 * Timeout error for handler execution
 */
export class TimeoutError extends GEMError {
  constructor(toolName, timeoutMs) {
    super(ErrorCodes.EXECUTION_TIMEOUT, `Handler for ${toolName} timed out after ${timeoutMs}ms`, {
      tool_name: toolName,
      timeout_ms: timeoutMs,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Error handler utility for consistent error processing
 */
export function handleError(error, toolName = 'unknown') {
  // Already a GEMError
  if (error instanceof GEMError) {
    return error.toReceipt();
  }

  // Supabase error
  if (error?.code && (error.code.startsWith('PGRST') || error.code.match(/^\d{5}$/))) {
    const dbError = new DatabaseError(`Database error in ${toolName}: ${error.message}`, error);
    return dbError.toReceipt();
  }

  // Generic error - wrap it
  const gemError = new GEMError(ErrorCodes.HANDLER_THREW, `Handler ${toolName} threw: ${error.message}`, {
    tool_name: toolName,
    original_error: error.message,
  });
  return gemError.toReceipt();
}

/**
 * Create a standardized error message for user-facing errors
 */
export function formatUserError(error) {
  const templates = {
    [ErrorCodes.VALIDATION_ERROR]: `Invalid input: ${error.message}`,
    [ErrorCodes.LEAD_NOT_FOUND]: `Lead not found. Verify the lead_id exists.`,
    [ErrorCodes.QUOTE_NOT_FOUND]: `Quote not found. Verify the quote_id exists.`,
    [ErrorCodes.IDEMPOTENCY_KEY_MISSING]: `Missing idempotency key. This tool requires a unique key.`,
    [ErrorCodes.INTEGRATION_NOT_CONFIGURED]: `Integration not configured. Check environment variables.`,
  };

  return templates[error.code] || error.message;
}
