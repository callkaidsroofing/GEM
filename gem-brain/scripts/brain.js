#!/usr/bin/env node
/**
 * GEM Brain CLI
 *
 * Usage:
 *   node scripts/brain.js --message "create task: test" --mode enqueue_and_wait
 *   node scripts/brain.js -m "system status" -M enqueue_and_wait
 *   node scripts/brain.js --help
 *
 * Outputs exactly one BrainRunResponse JSON to stdout.
 */

import { runBrain } from '../src/brain.js';
import { getHelpText } from '../src/planner/rules.js';

function parseArgs(args) {
  const result = {
    message: null,
    mode: 'enqueue_and_wait',
    context: {},
    limits: {},
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

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
        result.limits.wait_timeout_ms = parseInt(next, 10);
        i++;
        break;
      case '--max-calls':
        result.limits.max_tool_calls = parseInt(next, 10);
        i++;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
GEM Brain CLI

Usage:
  node scripts/brain.js --message "your message" [options]

Options:
  -m, --message <text>    Message to process (required)
  -M, --mode <mode>       Mode: answer, plan, enqueue, enqueue_and_wait (default: enqueue_and_wait)
  --lead-id <uuid>        Context: lead ID
  --job-id <uuid>         Context: job ID
  --quote-id <uuid>       Context: quote ID
  -t, --timeout <ms>      Wait timeout in ms (default: 30000)
  --max-calls <n>         Max tool calls to enqueue (default: 10)
  -h, --help              Show this help

Examples:
  node scripts/brain.js -m "system status" -M enqueue_and_wait
  node scripts/brain.js -m "create task: call client" -M enqueue
  node scripts/brain.js -m "new lead: John Smith 0400123456 in Sydney"

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

  if (!args.message) {
    console.error('Error: --message is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    const request = {
      message: args.message,
      mode: args.mode,
      context: Object.keys(args.context).length > 0 ? args.context : undefined,
      limits: Object.keys(args.limits).length > 0 ? args.limits : undefined
    };

    const response = await runBrain(request);

    // Output exactly one JSON object to stdout
    console.log(JSON.stringify(response, null, 2));

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
      assistant_message: `Error: ${error.message}`,
      next_actions: [],
      errors: [{
        code: 'cli_error',
        message: error.message,
        details: { stack: error.stack }
      }]
    };
    console.log(JSON.stringify(errorResponse, null, 2));
    process.exit(1);
  }
}

main();
