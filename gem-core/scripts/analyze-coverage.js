#!/usr/bin/env node
/**
 * Analyze tool registry coverage against handler implementations.
 * Generates data for registry_coverage.md
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read registry
const registryPath = join(rootDir, 'tools.registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

// Read all handler files
const handlersDir = join(rootDir, 'src', 'handlers');
const handlerFiles = readdirSync(handlersDir).filter(f => f.endsWith('.js'));

// Build a map of function content
const funcContent = {};
for (const file of handlerFiles) {
  const domain = file.replace('.js', '');
  const content = readFileSync(join(handlersDir, file), 'utf8');

  // Split by export function declarations
  const lines = content.split('\n');
  let currentFunc = null;
  let funcBody = '';

  for (const line of lines) {
    const funcMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      if (currentFunc) {
        funcContent[domain + '.' + currentFunc] = funcBody;
      }
      currentFunc = funcMatch[1];
      funcBody = line;
    } else if (currentFunc) {
      funcBody += '\n' + line;
    }
  }
  if (currentFunc) {
    funcContent[domain + '.' + currentFunc] = funcBody;
  }
}

// Analyze each tool
const tools = [];
for (const tool of registry.tools) {
  const parts = tool.name.split('.');
  const domain = parts[0];
  const method = parts.slice(1).join('_');
  const key = domain + '.' + method;

  const body = funcContent[key] || '';
  const isNotConfigured = body.includes('notConfigured(') || body.includes('return notConfigured');

  tools.push({
    name: tool.name,
    domain: domain,
    status: isNotConfigured ? 'not_configured' : 'real',
    idempotency: tool.idempotency?.mode || 'none',
    keyField: tool.idempotency?.key_field || null
  });
}

// Count by domain and status
const domains = {};
let realCount = 0;
let notConfiguredCount = 0;

for (const t of tools) {
  if (!domains[t.domain]) {
    domains[t.domain] = { real: [], not_configured: [] };
  }
  domains[t.domain][t.status === 'real' ? 'real' : 'not_configured'].push(t);
  if (t.status === 'real') realCount++;
  else notConfiguredCount++;
}

// Output summary
console.log('COVERAGE SUMMARY');
console.log('================');
console.log('Real Implementation:', realCount);
console.log('Not Configured:', notConfiguredCount);
console.log('Total:', tools.length);
console.log('');
console.log('BY DOMAIN:');
for (const [domain, data] of Object.entries(domains).sort()) {
  const total = data.real.length + data.not_configured.length;
  console.log(`  ${domain}: ${total} (${data.real.length} real, ${data.not_configured.length} not_configured)`);
}

// Output detailed JSON for reference
console.log('\nDETAILED TOOLS (JSON):');
console.log(JSON.stringify({ tools, domains, summary: { real: realCount, not_configured: notConfiguredCount, total: tools.length } }, null, 2));
