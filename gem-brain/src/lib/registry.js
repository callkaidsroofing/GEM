import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load registry from gem-core (sibling directory)
const registryPath = process.env.REGISTRY_PATH || join(__dirname, '..', '..', '..', 'gem-core', 'tools.registry.json');

let registryData;
try {
  registryData = JSON.parse(readFileSync(registryPath, 'utf8'));
} catch (error) {
  console.error(`Failed to load registry from ${registryPath}:`, error.message);
  throw new Error('Registry not found. Ensure gem-core/tools.registry.json exists.');
}

export const registry = {
  version: registryData.version,
  tools: new Map(registryData.tools.map(tool => [tool.name, tool]))
};

export function getTool(name) {
  return registry.tools.get(name);
}

export function getAllTools() {
  return Array.from(registry.tools.values());
}

export function getToolNames() {
  return Array.from(registry.tools.keys());
}

/**
 * Validate input against a tool's schema.
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateToolInput(toolName, input) {
  const tool = getTool(toolName);
  if (!tool) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  const schema = tool.input_schema;
  if (!schema) {
    return { valid: true };
  }

  if (schema.type === 'object') {
    if (typeof input !== 'object' || input === null) {
      return { valid: false, error: 'Input must be an object' };
    }

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in input)) {
          return { valid: false, error: `Missing required field: ${field}` };
        }
      }
    }

    // Basic property type check
    if (schema.properties) {
      for (const [key, value] of Object.entries(input)) {
        const propSchema = schema.properties[key];
        if (propSchema && propSchema.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (propSchema.type === 'integer' && !Number.isInteger(value)) {
            return { valid: false, error: `Field ${key} must be an integer` };
          }
          if (propSchema.type !== 'integer' && actualType !== propSchema.type) {
            if (propSchema.format === 'date-time' && actualType === 'string') continue;
            return { valid: false, error: `Field ${key} must be ${propSchema.type}, got ${actualType}` };
          }
        }
      }
    }
  }

  return { valid: true };
}
