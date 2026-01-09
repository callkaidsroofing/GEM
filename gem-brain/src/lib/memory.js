/**
 * Memory Module for GEM Brain
 *
 * Provides persistent conversation memory with Supabase storage.
 * Supports session management, context retention, and memory summarization.
 *
 * Tables required:
 *   - brain_sessions: Session metadata and state
 *   - brain_memory: Individual memory entries
 */

import { randomUUID } from 'crypto';
import { supabase } from './supabase.js';

const DEFAULT_MEMORY_LIMIT = 50;
const SUMMARY_THRESHOLD = 40; // Summarize when approaching limit

/**
 * Memory Manager class
 * Handles session-based memory with persistence
 */
export class MemoryManager {
  constructor(options = {}) {
    this.sessionId = options.sessionId || null;
    this.memoryLimit = options.memoryLimit || DEFAULT_MEMORY_LIMIT;
    this.entries = [];
    this.context = {};
    this.loaded = false;
  }

  /**
   * Initialize or load a session
   */
  async init(sessionId = null) {
    if (sessionId) {
      this.sessionId = sessionId;
      await this.loadSession();
    } else {
      await this.createSession();
    }
    return this;
  }

  /**
   * Create a new session
   */
  async createSession() {
    this.sessionId = randomUUID();
    this.entries = [];
    this.context = {};
    this.loaded = true;

    const { error } = await supabase
      .from('brain_sessions')
      .insert({
        id: this.sessionId,
        context: this.context,
        entry_count: 0,
        status: 'active'
      });

    if (error) {
      console.error('Failed to create session:', error);
      // Continue without persistence
    }

    return this.sessionId;
  }

  /**
   * Load an existing session
   */
  async loadSession() {
    if (!this.sessionId) {
      throw new Error('No session ID provided');
    }

    // Load session metadata
    const { data: session, error: sessionError } = await supabase
      .from('brain_sessions')
      .select('*')
      .eq('id', this.sessionId)
      .maybeSingle();

    if (sessionError) {
      console.error('Failed to load session:', sessionError);
    }

    if (session) {
      this.context = session.context || {};
    }

    // Load memory entries
    const { data: entries, error: entriesError } = await supabase
      .from('brain_memory')
      .select('*')
      .eq('session_id', this.sessionId)
      .order('created_at', { ascending: true })
      .limit(this.memoryLimit);

    if (entriesError) {
      console.error('Failed to load memory:', entriesError);
      this.entries = [];
    } else {
      this.entries = entries || [];
    }

    this.loaded = true;
    return this.entries.length;
  }

  /**
   * Add a memory entry
   */
  async add(role, content, metadata = {}) {
    if (!this.loaded) {
      await this.init();
    }

    const entry = {
      id: randomUUID(),
      session_id: this.sessionId,
      role, // 'user', 'assistant', 'system', 'tool_result'
      content,
      metadata,
      created_at: new Date().toISOString()
    };

    // Add to local cache
    this.entries.push(entry);

    // Persist to database
    const { error } = await supabase
      .from('brain_memory')
      .insert(entry);

    if (error) {
      console.error('Failed to persist memory:', error);
    }

    // Update session entry count
    await supabase
      .from('brain_sessions')
      .update({ 
        entry_count: this.entries.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.sessionId);

    // Check if we need to summarize
    if (this.entries.length >= SUMMARY_THRESHOLD) {
      // Note: Summarization would be triggered here in production
      // For now, we just trim oldest entries
      await this.trimOldest();
    }

    return entry;
  }

  /**
   * Add user message
   */
  async addUser(content, metadata = {}) {
    return this.add('user', content, metadata);
  }

  /**
   * Add assistant response
   */
  async addAssistant(content, metadata = {}) {
    return this.add('assistant', content, metadata);
  }

  /**
   * Add system note
   */
  async addSystem(content, metadata = {}) {
    return this.add('system', content, { ...metadata, isNote: true });
  }

  /**
   * Add tool result
   */
  async addToolResult(toolName, result, metadata = {}) {
    return this.add('tool_result', JSON.stringify(result), {
      ...metadata,
      tool_name: toolName
    });
  }

  /**
   * Get conversation history for LLM context
   */
  getHistory(limit = null) {
    const entries = limit ? this.entries.slice(-limit) : this.entries;
    return entries.map(e => ({
      role: e.role === 'tool_result' ? 'assistant' : e.role,
      content: e.content,
      metadata: e.metadata
    }));
  }

  /**
   * Get recent entries
   */
  getRecent(n = 10) {
    return this.entries.slice(-n);
  }

  /**
   * Set context value
   */
  async setContext(key, value) {
    this.context[key] = value;

    await supabase
      .from('brain_sessions')
      .update({ 
        context: this.context,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.sessionId);
  }

  /**
   * Get context value
   */
  getContext(key = null) {
    if (key) {
      return this.context[key];
    }
    return this.context;
  }

  /**
   * Clear context
   */
  async clearContext() {
    this.context = {};

    await supabase
      .from('brain_sessions')
      .update({ 
        context: {},
        updated_at: new Date().toISOString()
      })
      .eq('id', this.sessionId);
  }

  /**
   * Trim oldest entries when approaching limit
   */
  async trimOldest(keepCount = 30) {
    if (this.entries.length <= keepCount) return;

    const toRemove = this.entries.slice(0, this.entries.length - keepCount);
    const removeIds = toRemove.map(e => e.id);

    // Remove from database
    const { error } = await supabase
      .from('brain_memory')
      .delete()
      .in('id', removeIds);

    if (error) {
      console.error('Failed to trim memory:', error);
    }

    // Update local cache
    this.entries = this.entries.slice(-keepCount);
  }

  /**
   * Clear all memory for this session
   */
  async clear() {
    const { error } = await supabase
      .from('brain_memory')
      .delete()
      .eq('session_id', this.sessionId);

    if (error) {
      console.error('Failed to clear memory:', error);
    }

    this.entries = [];
    this.context = {};

    await supabase
      .from('brain_sessions')
      .update({ 
        entry_count: 0,
        context: {},
        updated_at: new Date().toISOString()
      })
      .eq('id', this.sessionId);
  }

  /**
   * Get memory stats
   */
  getStats() {
    return {
      session_id: this.sessionId,
      entry_count: this.entries.length,
      memory_limit: this.memoryLimit,
      context_keys: Object.keys(this.context),
      oldest_entry: this.entries[0]?.created_at || null,
      newest_entry: this.entries[this.entries.length - 1]?.created_at || null
    };
  }

  /**
   * Search memory for relevant entries
   */
  search(query, limit = 5) {
    const queryLower = query.toLowerCase();
    const matches = this.entries
      .filter(e => e.content.toLowerCase().includes(queryLower))
      .slice(-limit);
    return matches;
  }
}

/**
 * Get or create the most recent active session
 */
export async function getActiveSession(memoryLimit = DEFAULT_MEMORY_LIMIT) {
  // Try to find the most recent active session
  const { data: session, error } = await supabase
    .from('brain_sessions')
    .select('id')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to find active session:', error);
  }

  const manager = new MemoryManager({ memoryLimit });

  if (session) {
    await manager.init(session.id);
  } else {
    await manager.init();
  }

  return manager;
}

export default {
  MemoryManager,
  getActiveSession
};
