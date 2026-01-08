import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ============================================
// AJV SETUP
// ============================================

const ajv = new Ajv({ 
  allErrors: true,
  strict: false,
  coerceTypes: false
});
addFormats(ajv);

// Cache for compiled validators
const inputValidators = new Map();
const outputValidators = new Map();

// ============================================
// SCHEMA COMPILATION
// ============================================

/**
 * Get or compile input validator for a tool
 */
function getInputValidator(tool) {
  if (!tool.input_schema) return null;
  
  const key = tool.name;
  if (!inputValidators.has(key)) {
    try {
      const validator = ajv.compile(tool.input_schema);
      inputValidators.set(key, validator);
    } catch (err) {
      console.error(`Failed to compile input schema for ${tool.name}:`, err.message);
      return null;
    }
  }
  return inputValidators.get(key);
}

/**
 * Get or compile output validator for a tool
 */
function getOutputValidator(tool) {
  if (!tool.output_schema) return null;
  
  const key = tool.name;
  if (!outputValidators.has(key)) {
    try {
      const validator = ajv.compile(tool.output_schema);
      outputValidators.set(key, validator);
    } catch (err) {
      console.error(`Failed to compile output schema for ${tool.name}:`, err.message);
      return null;
    }
  }
  return outputValidators.get(key);
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate input against tool's input_schema using AJV
 * @param {Object} tool - Tool definition from registry
 * @param {Object} input - Input to validate
 * @returns {{ valid: boolean, error?: string | Object[] }}
 */
export function validateInput(tool, input) {
  // No schema means anything is valid
  if (!tool.input_schema) {
    return { valid: true };
  }

  const validator = getInputValidator(tool);
  if (!validator) {
    // Schema compilation failed - be permissive
    return { valid: true };
  }

  const valid = validator(input);
  if (valid) {
    return { valid: true };
  }

  // Format errors for readability
  const errors = validator.errors.map(err => ({
    path: err.instancePath || '/',
    message: err.message,
    keyword: err.keyword,
    params: err.params
  }));

  return {
    valid: false,
    error: errors
  };
}

/**
 * Validate output against tool's output_schema using AJV
 * @param {Object} tool - Tool definition from registry
 * @param {Object} output - Output to validate
 * @returns {{ valid: boolean, error?: string | Object[] }}
 */
export function validateOutput(tool, output) {
  // No schema means anything is valid
  if (!tool.output_schema) {
    return { valid: true };
  }

  const validator = getOutputValidator(tool);
  if (!validator) {
    // Schema compilation failed - be permissive
    return { valid: true };
  }

  const valid = validator(output);
  if (valid) {
    return { valid: true };
  }

  // Format errors for readability
  const errors = validator.errors.map(err => ({
    path: err.instancePath || '/',
    message: err.message,
    keyword: err.keyword,
    params: err.params
  }));

  return {
    valid: false,
    error: errors
  };
}

/**
 * Pre-compile all schemas from registry for faster runtime validation
 * Call this at startup if you want to catch schema errors early
 */
export function precompileSchemas(tools) {
  let compiled = 0;
  let failed = 0;
  
  for (const tool of tools) {
    try {
      if (tool.input_schema) {
        getInputValidator(tool);
        compiled++;
      }
      if (tool.output_schema) {
        getOutputValidator(tool);
        compiled++;
      }
    } catch (err) {
      console.error(`Schema compilation failed for ${tool.name}:`, err.message);
      failed++;
    }
  }
  
  return { compiled, failed };
}
