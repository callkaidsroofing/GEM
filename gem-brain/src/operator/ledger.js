/**
 * CKR-GEM Operator Ledger System
 *
 * Provides durable memory across sessions via repo-backed ledger files.
 * Implements the High Council context retention pattern.
 *
 * Files managed:
 *   .ledger/FACTS.json      - System facts and configuration
 *   .ledger/DECISIONS.md    - Decision log with timestamps
 *   .ledger/OPEN_LOOPS.md   - Outstanding tasks/questions
 *   .ledger/RUN_LOG.md      - Execution history
 *   .ledger/session_id.txt  - Current session identifier
 */

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LEDGER_DIR = join(__dirname, '../../.ledger');

/**
 * Default FACTS structure for GEM
 */
const DEFAULT_FACTS = {
  mode: 'GEM-OPERATOR-V2',
  created_at: new Date().toISOString(),
  repo_root: '/data/data/com.termux/files/home/GEM',
  termux_safe: true,
  network_default: 'on',
  db_default: 'supabase',
  secrets_policy: 'redact_never_print_tokens',
  write_permissions: 'queue_only',
  brand: {
    company: 'Call Kaids Roofing',
    abn: '39475055075',
    phone: '0435 900 709',
    email: 'info@callkaidsroofing.com.au',
    region: 'South-East Melbourne',
    slogan: 'Proof In Every Roof'
  },
  ledger_version: '1.0.0'
};

/**
 * Operator Ledger Manager
 *
 * Manages the ledger files for durable context retention.
 */
export class OperatorLedger {
  constructor(ledgerDir = null) {
    this.ledgerDir = ledgerDir || DEFAULT_LEDGER_DIR;
    this.paths = {
      facts: join(this.ledgerDir, 'FACTS.json'),
      decisions: join(this.ledgerDir, 'DECISIONS.md'),
      openLoops: join(this.ledgerDir, 'OPEN_LOOPS.md'),
      runLog: join(this.ledgerDir, 'RUN_LOG.md'),
      sessionId: join(this.ledgerDir, 'session_id.txt')
    };

    // Ensure ledger directory exists
    this._ensureDirectory();

    // Initialize files if needed
    this._initializeFiles();
  }

  /**
   * Load FACTS.json
   */
  loadFacts() {
    try {
      if (existsSync(this.paths.facts)) {
        return JSON.parse(readFileSync(this.paths.facts, 'utf8'));
      }
    } catch (error) {
      console.warn('[Ledger] Failed to load FACTS:', error.message);
    }
    return { ...DEFAULT_FACTS };
  }

  /**
   * Update FACTS.json
   */
  updateFacts(updates) {
    const facts = this.loadFacts();
    const updated = { ...facts, ...updates, updated_at: new Date().toISOString() };
    writeFileSync(this.paths.facts, JSON.stringify(updated, null, 2));
    return updated;
  }

  /**
   * Get or create session ID
   */
  getSessionId() {
    try {
      if (existsSync(this.paths.sessionId)) {
        const id = readFileSync(this.paths.sessionId, 'utf8').trim();
        if (id) return id;
      }
    } catch (error) {}

    const newId = `gem_${Date.now()}_${randomUUID().slice(0, 8)}`;
    writeFileSync(this.paths.sessionId, newId + '\n');
    return newId;
  }

  /**
   * Start a new session
   */
  newSession() {
    const newId = `gem_${Date.now()}_${randomUUID().slice(0, 8)}`;
    writeFileSync(this.paths.sessionId, newId + '\n');

    // Log session start
    this.logRun({
      type: 'session_start',
      session_id: newId,
      message: 'New session started'
    });

    return newId;
  }

  /**
   * Append a decision to DECISIONS.md
   */
  appendDecision(decision, reasoning, context = {}) {
    const timestamp = new Date().toISOString();
    const sessionId = this.getSessionId();
    const decisionId = `DEC_${Date.now()}`;

    const entry = `
## ${decisionId} - ${timestamp}

**Session:** ${sessionId}
**Decision:** ${decision}
**Reasoning:** ${reasoning}
${context.risk_tier ? `**Risk Tier:** ${context.risk_tier}` : ''}
${context.tools ? `**Tools:** ${context.tools.join(', ')}` : ''}
${context.approval ? `**Approval:** ${context.approval}` : ''}

---
`;

    appendFileSync(this.paths.decisions, entry);
    return decisionId;
  }

  /**
   * Add an open loop (outstanding task/question)
   */
  addOpenLoop(description, priority = 'normal', context = {}) {
    const timestamp = new Date().toISOString();
    const loopId = `LOOP_${Date.now()}`;

    const entry = `
### ${loopId} - ${priority.toUpperCase()}

**Created:** ${timestamp}
**Description:** ${description}
${context.depends_on ? `**Depends On:** ${context.depends_on}` : ''}
${context.assigned_to ? `**Assigned To:** ${context.assigned_to}` : ''}
**Status:** OPEN

---
`;

    appendFileSync(this.paths.openLoops, entry);
    return loopId;
  }

  /**
   * Close an open loop
   */
  closeOpenLoop(loopId, resolution) {
    try {
      let content = readFileSync(this.paths.openLoops, 'utf8');

      // Find and update the loop status
      const pattern = new RegExp(`(### ${loopId}[\\s\\S]*?\\*\\*Status:\\*\\*) OPEN`, 'g');
      if (pattern.test(content)) {
        content = content.replace(pattern, `$1 CLOSED - ${resolution} (${new Date().toISOString()})`);
        writeFileSync(this.paths.openLoops, content);
        return true;
      }
    } catch (error) {
      console.warn('[Ledger] Failed to close loop:', error.message);
    }
    return false;
  }

  /**
   * Log a run to RUN_LOG.md
   */
  logRun(summary) {
    const timestamp = new Date().toISOString();
    const sessionId = this.getSessionId();

    let entry = `| ${timestamp} | ${sessionId.slice(-12)} | `;

    if (typeof summary === 'string') {
      entry += `${summary} |\n`;
    } else {
      const type = summary.type || 'run';
      const message = summary.message || summary.intent || 'Execution';
      const status = summary.status || summary.brain_ok ? 'OK' : 'FAILED';
      const tools = summary.tools || summary.tool_impact || '-';

      entry += `${type} | ${message.slice(0, 50)} | ${status} | ${tools} |\n`;
    }

    appendFileSync(this.paths.runLog, entry);
  }

  /**
   * Get recent runs from RUN_LOG.md
   */
  getRecentRuns(limit = 10) {
    try {
      const content = readFileSync(this.paths.runLog, 'utf8');
      const lines = content.split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
      return lines.slice(-limit);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get open loops
   */
  getOpenLoops() {
    try {
      const content = readFileSync(this.paths.openLoops, 'utf8');
      const matches = content.match(/### (LOOP_\d+)[^\n]*\n[\s\S]*?\*\*Status:\*\* OPEN/g) || [];
      return matches.map(m => {
        const idMatch = m.match(/### (LOOP_\d+)/);
        const descMatch = m.match(/\*\*Description:\*\* ([^\n]+)/);
        const priorityMatch = m.match(/### LOOP_\d+ - (\w+)/);
        return {
          id: idMatch ? idMatch[1] : null,
          description: descMatch ? descMatch[1] : '',
          priority: priorityMatch ? priorityMatch[1].toLowerCase() : 'normal'
        };
      }).filter(l => l.id);
    } catch (error) {
      return [];
    }
  }

  /**
   * Build context packet for LLM injection
   *
   * This creates a condensed summary of ledger state for the LLM.
   */
  buildContextPacket() {
    const facts = this.loadFacts();
    const openLoops = this.getOpenLoops();
    const recentRuns = this.getRecentRuns(5);
    const sessionId = this.getSessionId();

    let packet = '';

    // FACTS summary
    packet += 'SYSTEM FACTS:\n';
    packet += `- Mode: ${facts.mode}\n`;
    packet += `- Brand: ${facts.brand?.company || 'Call Kaids Roofing'}\n`;
    packet += `- Region: ${facts.brand?.region || 'SE Melbourne'}\n`;
    packet += `- Session: ${sessionId}\n`;
    packet += '\n';

    // Open loops
    if (openLoops.length > 0) {
      packet += 'OPEN LOOPS:\n';
      openLoops.forEach(loop => {
        packet += `- [${loop.priority.toUpperCase()}] ${loop.description}\n`;
      });
      packet += '\n';
    }

    // Recent activity
    if (recentRuns.length > 0) {
      packet += 'RECENT ACTIVITY:\n';
      recentRuns.slice(-3).forEach(run => {
        packet += `  ${run}\n`;
      });
      packet += '\n';
    }

    return packet.trim();
  }

  /**
   * Export full ledger state
   */
  export() {
    return {
      facts: this.loadFacts(),
      sessionId: this.getSessionId(),
      openLoops: this.getOpenLoops(),
      recentRuns: this.getRecentRuns(20),
      exportedAt: new Date().toISOString()
    };
  }

  // Private methods

  _ensureDirectory() {
    if (!existsSync(this.ledgerDir)) {
      mkdirSync(this.ledgerDir, { recursive: true });
    }
  }

  _initializeFiles() {
    // Initialize FACTS.json
    if (!existsSync(this.paths.facts)) {
      writeFileSync(this.paths.facts, JSON.stringify(DEFAULT_FACTS, null, 2));
    }

    // Initialize DECISIONS.md
    if (!existsSync(this.paths.decisions)) {
      writeFileSync(this.paths.decisions, `# CKR-GEM Decision Log

This file records significant decisions made by the operator.

| Timestamp | Session | Decision | Risk |
|-----------|---------|----------|------|
| --- | --- | --- | --- |

---

`);
    }

    // Initialize OPEN_LOOPS.md
    if (!existsSync(this.paths.openLoops)) {
      writeFileSync(this.paths.openLoops, `# CKR-GEM Open Loops

Outstanding tasks, questions, and items requiring follow-up.

---

`);
    }

    // Initialize RUN_LOG.md
    if (!existsSync(this.paths.runLog)) {
      writeFileSync(this.paths.runLog, `# CKR-GEM Run Log

Execution history for audit and context retention.

| Timestamp | Session | Type | Message | Status | Tools |
|-----------|---------|------|---------|--------|-------|
| --- | --- | --- | --- | --- | --- |
`);
    }
  }
}

/**
 * Shared ledger instance
 */
let sharedLedger = null;

export function getSharedLedger(config = {}) {
  if (!sharedLedger) {
    sharedLedger = new OperatorLedger(config.ledgerDir);
  }
  return sharedLedger;
}

export function resetSharedLedger() {
  sharedLedger = null;
}
