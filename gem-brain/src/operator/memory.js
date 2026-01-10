/**
 * CKR-GEM Operator Memory System
 *
 * Provides conversation history, context retention, and session management.
 * Memory persists to file system and can optionally sync to Supabase.
 */

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = join(__dirname, '../../.memory');

/**
 * Memory entry structure
 */
const createMemoryEntry = (type, content, metadata = {}) => ({
  id: randomUUID(),
  type, // 'message', 'intent', 'execution', 'context', 'system'
  content,
  metadata,
  timestamp: new Date().toISOString(),
  ttl: metadata.ttl || null // null = permanent
});

/**
 * Operator Memory Manager
 */
export class OperatorMemory {
  constructor(config = {}) {
    this.sessionId = config.sessionId || randomUUID();
    this.maxHistory = config.maxHistory || 50;
    this.persistPath = config.persistPath || join(MEMORY_DIR, `session_${this.sessionId}.json`);
    this.enablePersist = config.enablePersist !== false;

    // In-memory stores
    this.conversationHistory = [];
    this.contextStore = new Map();
    this.entityCache = new Map();
    this.systemNotes = [];

    // Ensure memory directory exists
    if (this.enablePersist && !existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true });
    }

    // Load existing session if present
    if (this.enablePersist && existsSync(this.persistPath)) {
      this._loadFromDisk();
    }
  }

  /**
   * Add a user message to history
   */
  addMessage(message, role = 'user') {
    const entry = createMemoryEntry('message', {
      role,
      text: message
    });

    this.conversationHistory.push(entry);
    this._trimHistory();
    this._persist();

    return entry.id;
  }

  /**
   * Add an intent classification result
   */
  addIntent(intent, messageId = null) {
    const entry = createMemoryEntry('intent', intent, { messageId });
    this.conversationHistory.push(entry);
    this._persist();
    return entry.id;
  }

  /**
   * Add an execution result
   */
  addExecution(result, planId = null) {
    const entry = createMemoryEntry('execution', {
      success: result.brain_ok || false,
      tools: result.tool_impact || 'none',
      summary: result.plan_summary || result.result_summary
    }, { planId });

    this.conversationHistory.push(entry);
    this._persist();
    return entry.id;
  }

  /**
   * Store context for entity references (lead_id, job_id, etc.)
   */
  setContext(key, value, ttl = null) {
    this.contextStore.set(key, {
      value,
      setAt: new Date().toISOString(),
      ttl
    });
    this._persist();
  }

  /**
   * Get context value
   */
  getContext(key) {
    const entry = this.contextStore.get(key);
    if (!entry) return null;

    // Check TTL
    if (entry.ttl) {
      const age = Date.now() - new Date(entry.setAt).getTime();
      if (age > entry.ttl) {
        this.contextStore.delete(key);
        return null;
      }
    }

    return entry.value;
  }

  /**
   * Get all active context as object
   */
  getAllContext() {
    const context = {};
    for (const [key, entry] of this.contextStore) {
      const value = this.getContext(key);
      if (value !== null) {
        context[key] = value;
      }
    }
    return context;
  }

  /**
   * Cache entity data (leads, jobs, etc.)
   */
  cacheEntity(type, id, data, ttl = 300000) { // 5 min default
    const key = `${type}:${id}`;
    this.entityCache.set(key, {
      data,
      cachedAt: Date.now(),
      ttl
    });
  }

  /**
   * Get cached entity
   */
  getCachedEntity(type, id) {
    const key = `${type}:${id}`;
    const entry = this.entityCache.get(key);

    if (!entry) return null;

    const age = Date.now() - entry.cachedAt;
    if (age > entry.ttl) {
      this.entityCache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Add system note (important info to remember)
   */
  addSystemNote(note, priority = 'normal') {
    const entry = createMemoryEntry('system', { note, priority });
    this.systemNotes.push(entry);
    this._persist();
    return entry.id;
  }

  /**
   * Get recent conversation for LLM context
   */
  getRecentHistory(limit = 10) {
    return this.conversationHistory
      .slice(-limit)
      .map(entry => ({
        type: entry.type,
        content: entry.content,
        timestamp: entry.timestamp
      }));
  }

  /**
   * Get conversation summary for LLM
   */
  getConversationSummary() {
    const messages = this.conversationHistory.filter(e => e.type === 'message');
    const intents = this.conversationHistory.filter(e => e.type === 'intent');
    const executions = this.conversationHistory.filter(e => e.type === 'execution');

    return {
      total_messages: messages.length,
      user_messages: messages.filter(m => m.content.role === 'user').length,
      assistant_messages: messages.filter(m => m.content.role === 'assistant').length,
      intents_classified: intents.length,
      executions: executions.length,
      successful_executions: executions.filter(e => e.content.success).length,
      active_context: Object.keys(this.getAllContext()),
      system_notes: this.systemNotes.length
    };
  }

  /**
   * Build context block for LLM prompt
   */
  buildLLMContext() {
    const recent = this.getRecentHistory(5);
    const context = this.getAllContext();
    const notes = this.systemNotes.slice(-3);

    let contextBlock = '';

    if (Object.keys(context).length > 0) {
      contextBlock += 'ACTIVE CONTEXT:\n';
      for (const [key, value] of Object.entries(context)) {
        contextBlock += `- ${key}: ${JSON.stringify(value)}\n`;
      }
      contextBlock += '\n';
    }

    if (recent.length > 0) {
      contextBlock += 'RECENT CONVERSATION:\n';
      recent.forEach(entry => {
        if (entry.type === 'message') {
          contextBlock += `[${entry.content.role}]: ${entry.content.text}\n`;
        } else if (entry.type === 'execution') {
          contextBlock += `[execution]: ${entry.content.summary}\n`;
        }
      });
      contextBlock += '\n';
    }

    if (notes.length > 0) {
      contextBlock += 'SYSTEM NOTES:\n';
      notes.forEach(n => {
        contextBlock += `- ${n.content.note}\n`;
      });
    }

    return contextBlock.trim();
  }

  /**
   * Clear session memory
   */
  clear() {
    this.conversationHistory = [];
    this.contextStore.clear();
    this.entityCache.clear();
    this.systemNotes = [];
    this._persist();
  }

  /**
   * Start a new session (preserves system notes)
   */
  newSession() {
    const oldNotes = this.systemNotes;
    this.sessionId = randomUUID();
    this.persistPath = join(MEMORY_DIR, `session_${this.sessionId}.json`);
    this.conversationHistory = [];
    this.contextStore.clear();
    this.entityCache.clear();
    this.systemNotes = oldNotes; // Keep system notes
    this._persist();
    return this.sessionId;
  }

  /**
   * Export session data
   */
  export() {
    return {
      sessionId: this.sessionId,
      exportedAt: new Date().toISOString(),
      conversationHistory: this.conversationHistory,
      context: Object.fromEntries(this.contextStore),
      systemNotes: this.systemNotes,
      summary: this.getConversationSummary()
    };
  }

  /**
   * Import session data
   */
  import(data) {
    if (data.conversationHistory) {
      this.conversationHistory = data.conversationHistory;
    }
    if (data.context) {
      this.contextStore = new Map(Object.entries(data.context));
    }
    if (data.systemNotes) {
      this.systemNotes = data.systemNotes;
    }
    this._persist();
  }

  // Private methods

  _trimHistory() {
    if (this.conversationHistory.length > this.maxHistory) {
      // Keep system notes, trim oldest messages
      const systemEntries = this.conversationHistory.filter(e => e.type === 'system');
      const otherEntries = this.conversationHistory.filter(e => e.type !== 'system');

      this.conversationHistory = [
        ...systemEntries,
        ...otherEntries.slice(-this.maxHistory + systemEntries.length)
      ];
    }
  }

  _persist() {
    if (!this.enablePersist) return;

    try {
      const data = JSON.stringify({
        sessionId: this.sessionId,
        savedAt: new Date().toISOString(),
        conversationHistory: this.conversationHistory,
        context: Object.fromEntries(this.contextStore),
        systemNotes: this.systemNotes
      }, null, 2);

      writeFileSync(this.persistPath, data);
    } catch (error) {
      console.warn('Memory persist failed:', error.message);
    }
  }

  _loadFromDisk() {
    try {
      const data = JSON.parse(readFileSync(this.persistPath, 'utf8'));

      this.conversationHistory = data.conversationHistory || [];
      this.contextStore = new Map(Object.entries(data.context || {}));
      this.systemNotes = data.systemNotes || [];

      console.log(`[Memory] Loaded session ${this.sessionId} (${this.conversationHistory.length} entries)`);
    } catch (error) {
      console.warn('Memory load failed:', error.message);
    }
  }
}

/**
 * Shared memory instance for CLI usage
 */
let sharedMemory = null;

export function getSharedMemory(config = {}) {
  if (!sharedMemory) {
    // Use a consistent session ID for CLI
    const sessionPath = join(MEMORY_DIR, 'current_session.json');
    let sessionId = null;

    if (existsSync(sessionPath)) {
      try {
        const data = JSON.parse(readFileSync(sessionPath, 'utf8'));
        sessionId = data.sessionId;
      } catch (e) {}
    }

    if (!sessionId) {
      sessionId = randomUUID();
      try {
        if (!existsSync(MEMORY_DIR)) {
          mkdirSync(MEMORY_DIR, { recursive: true });
        }
        writeFileSync(sessionPath, JSON.stringify({ sessionId }));
      } catch (e) {}
    }

    sharedMemory = new OperatorMemory({ ...config, sessionId });
  }

  return sharedMemory;
}

export function resetSharedMemory() {
  if (sharedMemory) {
    sharedMemory.newSession();
  }
  sharedMemory = null;
}
