/**
 * CKR-GEM Context Injection System
 *
 * Implements the High Council "Context Retention Patch" pattern.
 * Automatically injects conversation history into LLM calls.
 *
 * Features:
 * - JSONL-based conversation persistence
 * - Auto-inject last N turns into messages
 * - Session-based storage
 * - Termux-safe (no external dependencies)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONVERSATION_DIR = join(__dirname, '../../.conversations');

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  maxTurns: 50,           // Maximum conversation turns to retain
  maxTokensEstimate: 4000, // Rough token limit for context
  sessionIdEnvVar: 'GEM_SESSION_ID',
  sessionIdFile: join(__dirname, '../../.ledger/session_id.txt')
};

/**
 * Context Injection Manager
 */
export class ContextInjection {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.conversationDir = config.conversationDir || CONVERSATION_DIR;

    // Ensure conversation directory exists
    if (!existsSync(this.conversationDir)) {
      mkdirSync(this.conversationDir, { recursive: true });
    }
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    // Try environment variable first
    const envId = process.env[this.config.sessionIdEnvVar]?.trim();
    if (envId) return envId;

    // Try session file
    try {
      if (existsSync(this.config.sessionIdFile)) {
        const fileId = readFileSync(this.config.sessionIdFile, 'utf8').trim();
        if (fileId) return fileId;
      }
    } catch (error) {}

    // Generate new session ID
    const newId = `gem_${Date.now()}_${randomUUID().slice(0, 8)}`;

    // Try to persist it
    try {
      const dir = dirname(this.config.sessionIdFile);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.config.sessionIdFile, newId + '\n');
    } catch (error) {}

    return newId;
  }

  /**
   * Get conversation file path for session
   */
  getConversationPath(sessionId = null) {
    const id = sessionId || this.getSessionId();
    return join(this.conversationDir, `${id}.jsonl`);
  }

  /**
   * Append a message to conversation history
   */
  appendMessage(role, content, metadata = {}) {
    const path = this.getConversationPath();
    const entry = {
      ts: Date.now(),
      role,
      content,
      ...metadata
    };

    try {
      appendFileSync(path, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.warn('[ContextInjection] Failed to append message:', error.message);
    }

    return entry;
  }

  /**
   * Append user message
   */
  appendUser(content, metadata = {}) {
    return this.appendMessage('user', content, metadata);
  }

  /**
   * Append assistant message
   */
  appendAssistant(content, metadata = {}) {
    return this.appendMessage('assistant', content, metadata);
  }

  /**
   * Append system message
   */
  appendSystem(content, metadata = {}) {
    return this.appendMessage('system', content, metadata);
  }

  /**
   * Load conversation history
   */
  loadHistory(maxTurns = null) {
    const limit = maxTurns || this.config.maxTurns;
    const path = this.getConversationPath();

    if (!existsSync(path)) {
      return [];
    }

    try {
      const content = readFileSync(path, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());

      const messages = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.role && parsed.content) {
            messages.push({
              role: parsed.role,
              content: parsed.content
            });
          }
        } catch (e) {
          // Skip malformed lines
        }
      }

      // Return last N messages (limit * 2 for user+assistant pairs)
      return messages.slice(-(limit * 2));
    } catch (error) {
      console.warn('[ContextInjection] Failed to load history:', error.message);
      return [];
    }
  }

  /**
   * Inject history into messages array (for OpenRouter/Anthropic API format)
   *
   * Preserves system messages at the start, then injects history,
   * then appends new user message.
   */
  injectIntoMessages(messages, options = {}) {
    const history = this.loadHistory(options.maxTurns);

    if (history.length === 0) {
      return messages;
    }

    // Separate system messages from others
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Build new message array: system -> history -> current
    return [
      ...systemMessages,
      ...history,
      ...nonSystemMessages
    ];
  }

  /**
   * Build context block for prompt injection
   *
   * For APIs that don't support message arrays, inject as text block.
   */
  buildContextBlock(maxTurns = null) {
    const history = this.loadHistory(maxTurns);

    if (history.length === 0) {
      return '';
    }

    const lines = history.map(m => {
      const role = m.role.toUpperCase();
      const content = m.content.slice(0, 500); // Truncate long messages
      return `[${role}]: ${content}`;
    });

    return `CONVERSATION HISTORY (recent ${lines.length} messages):\n${lines.join('\n')}\n\nCURRENT REQUEST:`;
  }

  /**
   * Get conversation summary
   */
  getSummary() {
    const path = this.getConversationPath();

    if (!existsSync(path)) {
      return { total: 0, user: 0, assistant: 0, system: 0, sessionId: this.getSessionId() };
    }

    try {
      const content = readFileSync(path, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());

      let user = 0, assistant = 0, system = 0;

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.role === 'user') user++;
          else if (parsed.role === 'assistant') assistant++;
          else if (parsed.role === 'system') system++;
        } catch (e) {}
      }

      return {
        total: lines.length,
        user,
        assistant,
        system,
        sessionId: this.getSessionId()
      };
    } catch (error) {
      return { total: 0, user: 0, assistant: 0, system: 0, sessionId: this.getSessionId() };
    }
  }

  /**
   * Clear conversation history for current session
   */
  clear() {
    const path = this.getConversationPath();
    try {
      if (existsSync(path)) {
        writeFileSync(path, '');
      }
    } catch (error) {
      console.warn('[ContextInjection] Failed to clear history:', error.message);
    }
  }

  /**
   * Start a new conversation (new session)
   */
  newConversation() {
    // Generate new session ID
    const newId = `gem_${Date.now()}_${randomUUID().slice(0, 8)}`;

    // Update session file
    try {
      const dir = dirname(this.config.sessionIdFile);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.config.sessionIdFile, newId + '\n');
    } catch (error) {}

    // Update environment
    process.env[this.config.sessionIdEnvVar] = newId;

    return newId;
  }
}

/**
 * Wrapper function to enhance OpenRouter call with context injection
 */
export function wrapWithContextInjection(originalCallFn, contextInjection) {
  return async function wrappedCall(opts) {
    const ci = contextInjection || getSharedContextInjection();

    // Append user message to history
    if (opts.user) {
      ci.appendUser(opts.user);
    }

    // Inject history into messages if using message array format
    if (opts.messages && Array.isArray(opts.messages)) {
      opts.messages = ci.injectIntoMessages(opts.messages);
    }

    // Call original function
    const result = await originalCallFn(opts);

    // Append assistant response to history
    if (result && typeof result === 'object') {
      const content = result.choices?.[0]?.message?.content || JSON.stringify(result);
      ci.appendAssistant(content);
    } else if (typeof result === 'string') {
      ci.appendAssistant(result);
    }

    return result;
  };
}

/**
 * Shared context injection instance
 */
let sharedContextInjection = null;

export function getSharedContextInjection(config = {}) {
  if (!sharedContextInjection) {
    sharedContextInjection = new ContextInjection(config);
  }
  return sharedContextInjection;
}

export function resetSharedContextInjection() {
  sharedContextInjection = null;
}
