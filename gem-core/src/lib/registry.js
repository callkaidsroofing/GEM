import { readFileSync } from 'fs';
import { join } from 'path';

const registryPath = join(process.cwd(), 'tools.registry.json');
const registryData = JSON.parse(readFileSync(registryPath, 'utf8'));

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
