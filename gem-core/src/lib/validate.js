/**
 * Basic JSON Schema validation.
 * In a production environment, you'd use a library like Ajv.
 * For this implementation, we'll perform basic type and required field checks.
 */
export function validateInput(tool, input) {
  const schema = tool.input_schema;
  if (!schema) return { valid: true };

  if (schema.type === 'object') {
    if (typeof input !== 'object' || input === null) {
      return { valid: false, error: 'Input must be an object' };
    }

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in input)) {
          return { valid: false, error: `Missing required field: ${field}` };
        }
      }
    }

    // Basic property type check if properties are defined
    if (schema.properties) {
      for (const [key, value] of Object.entries(input)) {
        const propSchema = schema.properties[key];
        if (propSchema && propSchema.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (propSchema.type === 'integer' && !Number.isInteger(value)) {
            return { valid: false, error: `Field ${key} must be an integer` };
          }
          if (propSchema.type !== 'integer' && actualType !== propSchema.type) {
            // Allow string for date-time format
            if (propSchema.format === 'date-time' && actualType === 'string') continue;
            return { valid: false, error: `Field ${key} must be ${propSchema.type}, got ${actualType}` };
          }
        }
      }
    }
  }

  return { valid: true };
}

export function validateOutput(tool, output) {
  const schema = tool.output_schema;
  if (!schema) return { valid: true };

  // Similar logic to validateInput but for output
  if (schema.type === 'object') {
    if (typeof output !== 'object' || output === null) {
      return { valid: false, error: 'Output must be an object' };
    }

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in output)) {
          return { valid: false, error: `Missing required output field: ${field}` };
        }
      }
    }
  }

  return { valid: true };
}
