#!/usr/bin/env node
/**
 * GEM Operator Interactive CLI (gemo)
 *
 * Interactive conversational interface to the GEM system.
 * Provides natural language interaction with memory persistence.
 *
 * Usage:
 *   node scripts/gemo.js                    # Start new or resume session
 *   node scripts/gemo.js --session <uuid>   # Resume specific session
 *   node scripts/gemo.js --new              # Force new session
 *   node scripts/gemo.js --help             # Show help
 */

import readline from 'readline';
import { createOperator } from '../src/operator.js';
import { checkLLMConfig } from '../src/lib/llm.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function color(text, c) {
  return `${colors[c] || ''}${text}${colors.reset}`;
}

function printBanner() {
  console.log(color(`
═══════════════════════════════════════════════════════════════════════════════
CKR-GEM INTERACTIVE OPERATOR
═══════════════════════════════════════════════════════════════════════════════
`, 'cyan'));
}

function printHelp() {
  console.log(`
${color('GEM Operator Interactive CLI', 'bright')}

${color('Usage:', 'yellow')}
  gemo                         Start or resume session
  gemo --session <uuid>        Resume specific session
  gemo --new                   Force new session
  gemo --help                  Show this help

${color('In-session commands:', 'yellow')}
  :help                        Show all commands
  :mode <mode>                 Set mode (analyze, plan, enqueue, execute)
  :approve                     Toggle approval for execution
  :memory                      Show memory status
  :history [n]                 Show recent history
  :quit                        Exit

${color('Examples:', 'yellow')}
  "system status"              Check system health
  "create task: call John"     Create a new task
  "new lead: Jane 0400123456"  Create a new lead
  "highlevel status"           Check HighLevel integration

Type naturally - I'll understand what you need.
`);
}

function parseArgs(args) {
  const result = {
    sessionId: null,
    forceNew: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--session':
      case '-s':
        result.sessionId = next;
        i++;
        break;
      case '--new':
      case '-n':
        result.forceNew = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  printBanner();

  // Check LLM configuration
  const llmConfig = checkLLMConfig();
  if (!llmConfig.configured) {
    console.log(color('[Warning] No LLM API key configured. Running in rules-only mode.', 'yellow'));
    console.log(color('Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY for natural conversation.', 'dim'));
    console.log();
  } else {
    console.log(color(`[LLM] Using ${llmConfig.provider} with ${llmConfig.model}`, 'dim'));
  }

  // Initialize operator
  let operator;
  try {
    const sessionId = args.forceNew ? null : args.sessionId;
    operator = await createOperator(sessionId);
    
    const memStats = operator.memory.getStats();
    console.log(color(`[Memory] ${args.forceNew ? 'New' : 'Loaded'} session ${operator.getSessionId()} (${memStats.entry_count} entries)`, 'dim'));
    console.log();
  } catch (error) {
    console.error(color(`[Error] Failed to initialize: ${error.message}`, 'red'));
    console.log(color('Continuing without persistence...', 'yellow'));
    operator = await createOperator(null);
  }

  // Set up readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: color('operator> ', 'green')
  });

  console.log('Type your message and press Enter.');
  console.log(color('Commands: :help for full list', 'dim'));
  console.log();

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    
    if (!input) {
      rl.prompt();
      return;
    }

    try {
      const result = await operator.process(input);
      
      console.log();
      
      if (result.response) {
        // Format response nicely
        const lines = result.response.split('\n');
        for (const line of lines) {
          console.log(line);
        }
      }
      
      if (result.exit) {
        rl.close();
        process.exit(0);
      }
      
      console.log();
    } catch (error) {
      console.log();
      console.log(color(`[Error] ${error.message}`, 'red'));
      console.log();
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log();
    console.log(color('Session saved. Goodbye!', 'cyan'));
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log();
    console.log(color('\nSession saved. Goodbye!', 'cyan'));
    process.exit(0);
  });
}

main().catch(error => {
  console.error(color(`Fatal error: ${error.message}`, 'red'));
  console.error(error.stack);
  process.exit(1);
});
