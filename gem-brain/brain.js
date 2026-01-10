#!/usr/bin/env node
/**
 * GEM Brain CLI
 *
 * Usage:
 *   node scripts/brain.js --message "create task: test" --mode enqueue_and_wait
 *   node scripts/brain.js -m "system status" -M enqueue_and_wait
 *   node scripts/brain.js "create inspection at 1 Test St" -M enqueue_and_wait
 *   node scripts/brain.js --help
 *
 * Outputs exactly one BrainRunResponse JSON to stdout.
 */

import { runBrain } from '../src/brain.js';
import { getHelpText } from '../src/planner/rules.js';

function parseArgs(argv) {
  const result = {
    message: null,
    mode: 'enqueue_and_wait',
    context: {},
    limits: {},
    help: false
  };

  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--message':
      case '-m':
        result.message = next;
        i++;
        break;

      case '--mode':
      case '-M':
        result.mode = next;
        i++;
        break;

      case '--lead-id':
        result.context.lead_id = next;
        i++;
        break;

      case '--job-id':
        result.context.job_id = next;
        i++;
        break;

      case '--quote-id':
        result.context.quote_id = next;
        i++;
        break;

      case '--timeout':
      case '-t':
        result.limits.wait_timeout_ms = Number.parseInt(next, 10);
        i++;
        break;

      case '--max-calls':
        result.limits.max_tool_calls = Number.parseInt(next, 10);
        i++;
        break;

      case '--help':
      case '-h':
        result.help = true;
        break;

      default:
        // Anything not a flag becomes part of the message (positional mode)
        if (typeof arg === 'string' && arg.startsWith('-')) {
          // Unknown flag: keep it as positional so user sees the failure clearly
          positionals.push(arg);
        } else {
          positionals.push(arg);
        }
        break;
    }
  }

  // If no explicit --message, treat remaining positionals as the message
  if (!result.message && positionals.length > 0) {
    result.message = positionals.join(' ').trim();
  }

  // Clean up invalid numbers
  if (Number.isNaN(result.limits.wait_timeout_ms)) delete result.limits.wait_timeout_ms;
  if (Number.isNaN(result.limits.max_tool_calls)) delete result.limits.max_tool_calls;

  return result;
}

function printHelp() {
  console.log(`
GEM Brain CLI

Usage:
  node scripts/brain.js --message "your message" [options]
  node scripts/brain.js "your message" [options]

Options:
  -m, --message <text>    Message to process (required unless provided positionally)
  -M, --mode <mode>       Mode: answer, plan, enqueue, enqueue_and_wait (default: enqueue_and_wait)
  --lead-id <uuid>        Context: lead ID
  --job-id <uuid>         Context: job ID
  --quote-id <uuid>       Context: quote ID
  -t, --timeout <ms>      Wait timeout in ms (default: 30000)
  --max-calls <n>         Max tool calls to enqueue (default: 10)
  -h, --help              Show this help

Examples:
  node scripts/brain.js -m "system status" -M enqueue_and_wait
  node scripts/brain.js "create task: call client" -M enqueue
  node scripts/brain.js "new lead: John Smith 0400123456 in Sydney"

Available Commands:
${getHelpText()}
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.message || !String(args.message).trim()) {
    console.error('Error: --message is required (or provide message positionally)');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const request = {
    message: String(args.message).trim(),
    mode: args.mode,
    context: Object.keys(args.context).length ? args.context : undefined,
    limits: Object.keys(args.limits).length ? args.limits : undefined
  };

  try {
    const response = await runBrain(request);

    // Output exactly one JSON object to stdout
    process.stdout.write(JSON.stringify(response, null, 2) + '\n');

    // Exit with appropriate code
    process.exit(response.ok ? 0 : 1);
  } catch (error) {
    const errorResponse = {
      ok: false,
      run_id: null,
      decision: { mode_used: 'answer', reason: 'CLI error' },
      planned_tool_calls: [],
      enqueued: [],
      receipts: [],
      assistant_message: `Error: ${error?.message || String(error)}`,
      next_actions: [],
      errors: [
        {
          code: 'cli_error',
          message: error?.message || String(error),
          details: { stack: error?.stack }
        }
      ]
    };

    process.stdout.write(JSON.stringify(errorResponse, null, 2) + '\n');
    process.exit(1);
  }
}

main();
