#!/usr/bin/env node
/**
 * GEM Operator Interactive CLI (gemo)
 *
 * Interactive conversational interface to the GEM system.
 * Provides natural language interaction with memory persistence.
 *
 * Usage:
 *   gemo                    # Start or resume session
 *   gemo --new              # Force new session
 *   gemo --help             # Show help
 */

import readline from 'readline';
import { createOperator } from '../src/operator.js';
import { checkLLMConfig } from '../src/lib/llm.js';

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function printBanner() {
  console.log(`
${c.cyan}╔═══════════════════════════════════════╗
║           ${c.bold}GEM OPERATOR${c.reset}${c.cyan}                ║
║     Call Kaids Roofing System         ║
╚═══════════════════════════════════════╝${c.reset}
`);
}

function printHelp() {
  console.log(`
${c.bold}GEM Operator${c.reset} - Natural language interface to GEM

${c.yellow}Usage:${c.reset}
  gemo              Start or resume session
  gemo --new        Start fresh session
  gemo --help       Show this help

${c.yellow}In-session:${c.reset}
  Just type naturally - I'll figure out what you need.
  
  :help             Show commands
  :status           Quick system check
  :quit             Exit

${c.yellow}Examples:${c.reset}
  "system status"
  "create task: call John tomorrow"
  "new lead: Sarah 0412345678 in Penrith"
  "highlevel status"
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
    console.log(`${c.yellow}⚠ No LLM key - running in basic mode${c.reset}`);
    console.log(`${c.dim}Set OPENROUTER_API_KEY for natural conversation${c.reset}`);
  } else {
    console.log(`${c.dim}LLM: ${llmConfig.provider}${c.reset}`);
  }

  // Initialize operator
  let operator;
  try {
    const sessionId = args.forceNew ? null : args.sessionId;
    operator = await createOperator(sessionId);
    
    const memStats = operator.memory.getStats();
    const sessionShort = operator.getSessionId()?.slice(0, 8) || 'new';
    console.log(`${c.dim}Session: ${sessionShort}... (${memStats.entry_count} entries)${c.reset}`);
  } catch (error) {
    console.error(`${c.red}Init error: ${error.message}${c.reset}`);
    console.log(`${c.yellow}Continuing without persistence...${c.reset}`);
    operator = await createOperator(null);
  }

  console.log();
  console.log(`${c.dim}Type naturally or :help for commands${c.reset}`);
  console.log();

  // Set up readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.green}>${c.reset} `
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    
    if (!input) {
      rl.prompt();
      return;
    }

    try {
      // Show thinking indicator for non-commands
      if (!input.startsWith(':')) {
        process.stdout.write(`${c.dim}...${c.reset}`);
      }

      const result = await operator.process(input);
      
      // Clear thinking indicator
      if (!input.startsWith(':')) {
        process.stdout.write('\r   \r');
      }
      
      console.log();
      
      if (result.response) {
        // Format response - indent multi-line responses
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
      // Clear thinking indicator
      process.stdout.write('\r   \r');
      console.log();
      console.log(`${c.red}Error: ${error.message}${c.reset}`);
      console.log();
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log();
    console.log(`${c.cyan}Session saved. See you! 👋${c.reset}`);
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log();
    console.log(`${c.cyan}Session saved. See you! 👋${c.reset}`);
    process.exit(0);
  });
}

main().catch(error => {
  console.error(`${c.red}Fatal: ${error.message}${c.reset}`);
  process.exit(1);
});
