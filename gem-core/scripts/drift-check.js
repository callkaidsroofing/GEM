#!/usr/bin/env node

/**
 * Drift Check Script
 *
 * Compares tools.registry.json tool names against handler exports
 * to detect missing implementations or orphan exports.
 *
 * Exit codes:
 *   0 - All tools have handlers, no orphans
 *   1 - Mismatch detected (missing implementations or orphan exports)
 *
 * Usage:
 *   node scripts/drift-check.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const REGISTRY_PATH = path.join(__dirname, '..', 'tools.registry.json');
const HANDLERS_DIR = path.join(__dirname, '..', 'src', 'handlers');

/**
 * Load and parse the tools registry
 */
function loadRegistry() {
  const content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  const registry = JSON.parse(content);
  return registry.tools || [];
}

/**
 * Extract all exported function names from a handler file
 */
async function getHandlerExports(filePath) {
  try {
    const module = await import(filePath);
    return Object.keys(module).filter(key => typeof module[key] === 'function');
  } catch (error) {
    console.error(`  Warning: Could not load ${filePath}: ${error.message}`);
    return [];
  }
}

/**
 * Convert tool name to handler function name
 * e.g., "integrations.highlevel.health_check" -> "highlevel_health_check"
 * e.g., "os.health_check" -> "health_check"
 */
function toolNameToHandlerName(toolName) {
  const parts = toolName.split('.');
  // Remove the domain (first part) and join the rest with underscores
  return parts.slice(1).join('_');
}

/**
 * Get the handler file for a tool
 * e.g., "integrations.highlevel.health_check" -> "src/handlers/integrations.js"
 */
function getHandlerFile(toolName) {
  const domain = toolName.split('.')[0];
  return path.join(HANDLERS_DIR, `${domain}.js`);
}

/**
 * Main drift check
 */
async function main() {
  console.log('='.repeat(60));
  console.log('GEM Tool Registry Drift Check');
  console.log('='.repeat(60));
  console.log();

  // Load registry
  console.log('Loading tools.registry.json...');
  const tools = loadRegistry();
  console.log(`  Found ${tools.length} tools in registry`);
  console.log();

  // Group tools by domain
  const toolsByDomain = {};
  for (const tool of tools) {
    const domain = tool.name.split('.')[0];
    if (!toolsByDomain[domain]) {
      toolsByDomain[domain] = [];
    }
    toolsByDomain[domain].push(tool.name);
  }

  // Track results
  const missingImplementations = [];
  const orphanExports = [];
  const implementedTools = [];

  // Check each domain
  console.log('Checking handler implementations...');
  console.log();

  for (const [domain, toolNames] of Object.entries(toolsByDomain)) {
    const handlerFile = path.join(HANDLERS_DIR, `${domain}.js`);
    console.log(`Domain: ${domain}`);
    console.log(`  Handler: ${handlerFile}`);

    // Check if handler file exists
    if (!fs.existsSync(handlerFile)) {
      console.log(`  Status: MISSING FILE`);
      for (const toolName of toolNames) {
        missingImplementations.push({
          tool: toolName,
          handler: toolNameToHandlerName(toolName),
          file: handlerFile,
          reason: 'Handler file does not exist'
        });
      }
      console.log();
      continue;
    }

    // Get exports from handler file
    const exports = await getHandlerExports(handlerFile);
    console.log(`  Exports: ${exports.length} functions`);

    // Check each tool in this domain
    const expectedHandlers = new Set();
    for (const toolName of toolNames) {
      const handlerName = toolNameToHandlerName(toolName);
      expectedHandlers.add(handlerName);

      if (exports.includes(handlerName)) {
        implementedTools.push({ tool: toolName, handler: handlerName });
      } else {
        missingImplementations.push({
          tool: toolName,
          handler: handlerName,
          file: handlerFile,
          reason: 'Export not found'
        });
      }
    }

    // Check for orphan exports (exports that don't match any tool)
    for (const exportName of exports) {
      if (!expectedHandlers.has(exportName)) {
        // Check if it's a utility function (starts with underscore or is default)
        if (exportName.startsWith('_') || exportName === 'default') {
          continue;
        }
        orphanExports.push({
          export: exportName,
          file: handlerFile,
          reason: 'No matching tool in registry'
        });
      }
    }

    console.log();
  }

  // Print results
  console.log('='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log();

  console.log(`Implemented: ${implementedTools.length}/${tools.length} tools`);
  console.log();

  if (missingImplementations.length > 0) {
    console.log('MISSING IMPLEMENTATIONS:');
    for (const missing of missingImplementations) {
      console.log(`  ❌ ${missing.tool}`);
      console.log(`     Expected handler: ${missing.handler}`);
      console.log(`     In file: ${missing.file}`);
      console.log(`     Reason: ${missing.reason}`);
    }
    console.log();
  }

  if (orphanExports.length > 0) {
    console.log('ORPHAN EXPORTS (no matching tool):');
    for (const orphan of orphanExports) {
      console.log(`  ⚠️  ${orphan.export}`);
      console.log(`     In file: ${orphan.file}`);
    }
    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total tools in registry: ${tools.length}`);
  console.log(`  Implemented handlers:    ${implementedTools.length}`);
  console.log(`  Missing implementations: ${missingImplementations.length}`);
  console.log(`  Orphan exports:          ${orphanExports.length}`);
  console.log();

  // Exit code
  if (missingImplementations.length > 0 || orphanExports.length > 0) {
    console.log('❌ DRIFT DETECTED - Registry and handlers are out of sync');
    process.exit(1);
  } else {
    console.log('✅ NO DRIFT - All tools have handlers, no orphans');
    process.exit(0);
  }
}

// Run
main().catch(error => {
  console.error('Drift check failed:', error);
  process.exit(1);
});
