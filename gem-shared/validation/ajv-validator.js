/**
 * AJV Validator
 *
 * Shared JSON Schema validator using AJV for consistent validation
 * across gem-brain and gem-core modules.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Create singleton AJV instance with formats
let ajvInstance = null;

/**
 * Get or create the AJV validator instance
 *
 * @returns {Ajv} AJV instance
 */
export function getAjv() {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      useDefaults: true
    });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

/**
 * Create a validator function for a schema
 *
 * @param {Object} schema - JSON Schema
 * @returns {Function} Validator function
 */
export function createValidator(schema) {
  const ajv = getAjv();
  return ajv.compile(schema);
}

/**
 * Validate data against a schema
 *
 * @param {Object} schema - JSON Schema
 * @param {any} data - Data to validate
 * @returns {{ valid: boolean, errors: Array|null }}
 */
export function validateAgainstSchema(schema, data) {
  const ajv = getAjv();
  const validate = ajv.compile(schema);
  const valid = validate(data);

  return {
    valid,
    errors: valid ? null : formatErrors(validate.errors)
  };
}

/**
 * Format AJV errors into readable messages
 *
 * @param {Array} errors - AJV error objects
 * @returns {Array<string>} Formatted error messages
 */
function formatErrors(errors) {
  if (!errors || !Array.isArray(errors)) {
    return [];
  }

  return errors.map(err => {
    const path = err.instancePath || '(root)';
    const message = err.message || 'Unknown validation error';

    switch (err.keyword) {
      case 'required':
        return `${path}: Missing required property '${err.params.missingProperty}'`;

      case 'type':
        return `${path}: Expected ${err.params.type}, got ${typeof err.data}`;

      case 'enum':
        return `${path}: ${message}. Allowed values: ${err.params.allowedValues.join(', ')}`;

      case 'pattern':
        return `${path}: Does not match pattern ${err.params.pattern}`;

      case 'format':
        return `${path}: Invalid ${err.params.format} format`;

      case 'additionalProperties':
        return `${path}: Unexpected property '${err.params.additionalProperty}'`;

      case 'minimum':
      case 'maximum':
        return `${path}: ${message}`;

      default:
        return `${path}: ${message}`;
    }
  });
}

/**
 * Validate tool input against registry schema
 *
 * @param {Object} inputSchema - Tool's input_schema from registry
 * @param {Object} input - Input data to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateToolInput(inputSchema, input) {
  if (!inputSchema) {
    return { valid: true, error: null };
  }

  const result = validateAgainstSchema(inputSchema, input);

  return {
    valid: result.valid,
    error: result.errors ? result.errors.join('; ') : null
  };
}

/**
 * Validate tool output against registry schema
 *
 * @param {Object} outputSchema - Tool's output_schema from registry
 * @param {Object} output - Output data to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateToolOutput(outputSchema, output) {
  if (!outputSchema) {
    return { valid: true, error: null };
  }

  const result = validateAgainstSchema(outputSchema, output);

  return {
    valid: result.valid,
    error: result.errors ? result.errors.join('; ') : null
  };
}

/**
 * Check if a schema has all required fields for tool definition
 *
 * @param {Object} schema - Schema to check
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function checkSchemaCompleteness(schema) {
  const requiredFields = ['type'];
  const missing = [];

  for (const field of requiredFields) {
    if (schema[field] === undefined) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}
