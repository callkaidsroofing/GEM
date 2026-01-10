#!/usr/bin/env node
/**
 * CKR-GEM Operator CLI
 *
 * Interactive command-line interface for the CKR-GEM operator model.
 * Demonstrates the 4-layer execution pipeline with structured outputs.
 *
 * Usage:
 *   node scripts/operator-cli.js "create a task to call John"
 *   node scripts/operator-cli.js --message "new lead: Sarah 0400123456 in Clayton" --mode execute
 *   node scripts/operator-cli.js --interactive
 */

import { createOperator, getSharedMemory, getSharedConfig, resetSharedMemory } from '../src/operator/orchestrator.js';
import * as readline from 'readline';

function parseArgs(args) {
  const result = {
    message: null,
    mode: 'analyze',
    context: {},
    interactive: false,
    approve: false,
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
      case '--inspection-id':
        result.context.inspection_id = next;
        i++;
        break;
      case '--quote-id':
        result.context.quote_id = next;
        i++;
        break;
      case '--job-id':
        result.context.job_id = next;
        i++;
        break;
      case '--approve':
        result.approve = true;
        break;
      case '--interactive':
      case '-i':
        result.interactive = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      default:
        // If it's not a flag and we don't have a message yet, treat it as the message
        if (!arg.startsWith('-') && !result.message) {
          result.message = arg;
        }
    }
  }

  return result;
}

function printHelp() {
  console.log(`
CKR-GEM Operator CLI
Implements the 4-layer execution model with structured outputs.

Usage:
  node scripts/operator-cli.js [message] [options]

Options:
  -m, --message <text>       Message to process
  -M, --mode <mode>          Mode: analyze, plan, enqueue, enqueue_and_wait, execute
                             - analyze: Classification only (default)
                             - plan: Generate execution plan
                             - enqueue: Queue tools without waiting
                             - enqueue_and_wait: Queue and wait for results
                             - execute: Full execution with approval

  --lead-id <uuid>           Context: lead ID
  --inspection-id <uuid>     Context: inspection ID
  --quote-id <uuid>          Context: quote ID
  --job-id <uuid>            Context: job ID

  --approve                  Provide explicit approval for T2+ operations
  -i, --interactive          Interactive mode (REPL)
  -h, --help                 Show this help

Examples:
  # Analyze intent only
  node scripts/operator-cli.js "system status"

  # Generate execution plan
  node scripts/operator-cli.js -m "create task: call client" -M plan

  # Execute with approval
  node scripts/operator-cli.js -m "new lead: John 0400123456 in Clayton" -M execute --approve

  # Interactive mode
  node scripts/operator-cli.js --interactive

4-Layer Execution Model:
  Layer 1: JUDGEMENT   - Intent classification, risk assessment
  Layer 2: SKILLS      - Schema-valid artifact generation
  Layer 3: BRAIN       - Tool call orchestration
  Layer 4: WORKER      - Execution (gem-core)

Risk Tiers:
  T0: Read/Analysis (no approval)
  T1: Local artifacts (allowed)
  T2: Schema changes (approval required)
  T3: External comms (approval required)
  T4: Irreversible ops (approval required)

Operational Domains:
  lead, inspection, quote, task, note, job, invoice, comms, devops, system
`);
}

async function processMessage(operator, args) {
  const { message, mode, context, approve } = args;

  if (!message) {
    console.error('Error: Message is required');
    console.error('Use --help for usage information');
    return;
  }

  try {
    const result = await operator.process({
      message,
      context,
      mode,
      explicit_approval: approve
    });

    // Display structured output
    displayStructuredOutput(result);

    // Return status code
    return result.brain_ok !== false ? 0 : 1;
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    return 1;
  }
}

function displayStructuredOutput(response) {
  console.log('\n' + '═'.repeat(80));
  console.log('CKR-GEM OPERATOR RESPONSE');
  console.log('═'.repeat(80) + '\n');

  console.log('[INTENT]');
  console.log(response.intent_summary);
  console.log();

  if (response.result_summary) {
    console.log('[RESULT]');
    console.log(response.result_summary);
  } else {
    console.log('[PLAN]');
    console.log(response.plan_summary);
  }
  console.log();

  console.log('[TOOL IMPACT]');
  console.log(response.tool_impact);
  console.log();

  console.log('[RISKS / GATES]');
  console.log(response.risks_and_gates);
  console.log();

  console.log('[NEXT ACTIONS]');
  if (response.next_actions && response.next_actions.length > 0) {
    response.next_actions.forEach((action, idx) => {
      console.log(`  ${idx + 1}. ${action}`);
    });
  } else {
    console.log('  None');
  }
  console.log();

  if (response.brain_run_id) {
    console.log(`Brain Run ID: ${response.brain_run_id}`);
  }
  if (response.execution_time_ms) {
    console.log(`Execution Time: ${response.execution_time_ms}ms`);
  }

  console.log('\n' + '═'.repeat(80) + '\n');
}

async function interactiveMode(operator) {
  console.log('\n' + '═'.repeat(80));
  console.log('CKR-GEM INTERACTIVE OPERATOR');
  console.log('═'.repeat(80));
  console.log('\nType your message and press Enter.');
  console.log('Commands: :help for full list\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'operator> '
  });

  let currentMode = 'analyze';
  let currentContext = {};
  let approvalFlag = false;

  // Get memory and config references
  const memory = getSharedMemory();
  const config = getSharedConfig();

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith(':')) {
      const parts = input.split(/\s+/);
      const cmd = parts[0];

      switch (cmd) {
        case ':quit':
        case ':exit':
        case ':q':
          console.log('Goodbye!');
          process.exit(0);
          break;

        case ':mode':
          if (parts[1]) {
            currentMode = parts[1];
            console.log(`Mode set to: ${currentMode}`);
          } else {
            console.log(`Current mode: ${currentMode}`);
          }
          rl.prompt();
          return;

        case ':approve':
          approvalFlag = !approvalFlag;
          console.log(`Approval flag: ${approvalFlag}`);
          rl.prompt();
          return;

        case ':context':
          if (parts[1] && parts[2]) {
            currentContext[parts[1]] = parts[2];
            console.log(`Context updated: ${parts[1]} = ${parts[2]}`);
          } else {
            console.log('Current context:', currentContext);
          }
          rl.prompt();
          return;

        case ':clear':
          currentContext = {};
          approvalFlag = false;
          console.log('Context and approval cleared');
          rl.prompt();
          return;

        // Memory commands
        case ':memory':
          console.log('\n[MEMORY STATUS]');
          const summary = memory.getConversationSummary();
          console.log(`  Session: ${memory.sessionId}`);
          console.log(`  Messages: ${summary.total_messages} (${summary.user_messages} user, ${summary.assistant_messages} system)`);
          console.log(`  Intents: ${summary.intents_classified}`);
          console.log(`  Executions: ${summary.executions} (${summary.successful_executions} successful)`);
          console.log(`  Active context: ${summary.active_context.join(', ') || 'none'}`);
          console.log(`  System notes: ${summary.system_notes}`);
          console.log();
          rl.prompt();
          return;

        case ':memory-clear':
        case ':forget':
          memory.clear();
          console.log('Memory cleared');
          rl.prompt();
          return;

        case ':memory-new':
          const newId = memory.newSession();
          console.log(`New session started: ${newId}`);
          rl.prompt();
          return;

        case ':remember':
          if (parts[1]) {
            const note = parts.slice(1).join(' ');
            memory.addSystemNote(note, 'high');
            console.log(`Remembered: ${note}`);
          } else {
            console.log('Usage: :remember <note>');
          }
          rl.prompt();
          return;

        case ':history':
          const recent = memory.getRecentHistory(parts[1] ? parseInt(parts[1]) : 5);
          console.log('\n[RECENT HISTORY]');
          recent.forEach((entry, i) => {
            if (entry.type === 'message') {
              console.log(`  ${i + 1}. [${entry.content.role}] ${entry.content.text.slice(0, 60)}...`);
            } else if (entry.type === 'execution') {
              console.log(`  ${i + 1}. [exec] ${entry.content.summary?.slice(0, 60) || 'completed'}...`);
            }
          });
          console.log();
          rl.prompt();
          return;

        // Config commands
        case ':config':
          if (parts[1]) {
            const value = config.getBehavior(parts[1]) || config.getLLM(parts[1]);
            console.log(`${parts[1]} = ${JSON.stringify(value)}`);
          } else {
            console.log('\n[CONFIGURATION]');
            const all = config.getAll();
            console.log('  Behavior:');
            Object.entries(all.behavior).forEach(([k, v]) => {
              console.log(`    ${k}: ${JSON.stringify(v)}`);
            });
            console.log('  LLM:');
            console.log(`    model: ${all.llm.openrouter_model}`);
            console.log(`    temperature: ${all.llm.classification_temperature}`);
            console.log();
          }
          rl.prompt();
          return;

        case ':config-set':
          if (parts[1] && parts[2]) {
            let value = parts.slice(2).join(' ');
            // Try to parse as JSON for booleans/numbers
            try { value = JSON.parse(value); } catch (e) {}
            config.setBehavior(parts[1], value);
            console.log(`Config set: ${parts[1]} = ${JSON.stringify(value)}`);
          } else {
            console.log('Usage: :config-set <key> <value>');
          }
          rl.prompt();
          return;

        case ':instruction':
          if (parts[1]) {
            const instruction = parts.slice(1).join(' ');
            config.appendSystemInstruction(instruction);
            console.log('System instruction appended');
          } else {
            const current = config.getSystemInstruction();
            console.log('\n[SYSTEM INSTRUCTION]');
            console.log(current.slice(0, 500) + '...');
            console.log();
          }
          rl.prompt();
          return;

        case ':instruction-reset':
          config.resetSystemInstruction();
          console.log('System instruction reset to default');
          rl.prompt();
          return;

        case ':help':
          console.log(`
Commands:
  MODE & EXECUTION
    :mode <mode>          Set mode (analyze, plan, enqueue, execute)
    :approve              Toggle approval flag
    :context <key> <val>  Set context value (lead_id, job_id, etc)
    :clear                Clear context and approval

  MEMORY
    :memory               Show memory status
    :memory-clear         Clear all memory
    :memory-new           Start new session
    :remember <note>      Add a system note
    :history [n]          Show last n history entries

  CONFIGURATION
    :config               Show current config
    :config-set <k> <v>   Set config value
    :instruction          Show system instruction
    :instruction-reset    Reset to default instruction

  GENERAL
    :quit                 Exit
    :help                 Show this help
`);
          rl.prompt();
          return;

        default:
          console.log(`Unknown command: ${cmd}. Type :help for commands.`);
          rl.prompt();
          return;
      }
    }

    // Process message
    try {
      console.log(); // blank line

      const result = await operator.process({
        message: input,
        context: currentContext,
        mode: currentMode,
        explicit_approval: approvalFlag
      });

      displayStructuredOutput(result);

    } catch (error) {
      console.error('\n❌ ERROR:', error.message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Initialize operator
  const operator = createOperator({
    openrouter_api_key: process.env.OPENROUTER_API_KEY,
    openrouter_model: process.env.OPENROUTER_MODEL,
    anthropic_api_key: process.env.ANTHROPIC_API_KEY
  });

  // Interactive mode
  if (args.interactive) {
    await interactiveMode(operator);
    return;
  }

  // Single message mode
  const exitCode = await processMessage(operator, args);
  process.exit(exitCode);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

main();
