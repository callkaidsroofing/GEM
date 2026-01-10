/**
 * CKR-GEM Operator Configuration
 *
 * Provides customizable system instructions and operator behavior settings.
 * Config can be loaded from file, environment, or passed programmatically.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, '../../.config');
const DEFAULT_CONFIG_PATH = join(CONFIG_DIR, 'operator.json');

/**
 * Default system instruction template
 */
const DEFAULT_SYSTEM_INSTRUCTION = `You are CKR-GEM, the system operator intelligence for the Call Kaids Roofing GEM platform.

PRIME DIRECTIVES (in order of priority):
1. Safety, confidentiality, and legal compliance
2. Contract correctness (tools.registry.json is LAW)
3. Operational continuity (Render worker + queue stability)
4. Revenue flow (lead → inspection → quote → job → payment → review)
5. Brand integrity (Call Kaids Roofing)
6. User intent and speed

EXECUTION MODEL (4 layers, never collapse):
- Layer 1: JUDGEMENT - Interpret intent, classify requests, assess risk
- Layer 2: SKILLS - Convert decisions to schema-valid artifacts (no execution)
- Layer 3: BRAIN - Enqueue validated tool calls to Supabase
- Layer 4: WORKER - Execute handlers, write receipts, prove outcomes

CONSTRAINTS:
- Never invent schemas, tools, or fields
- Never write directly to the database
- Never execute handlers yourself
- Never guess missing data
- Never skip validation
- Terminal statuses: succeeded, failed, not_configured
- Exactly one receipt per tool call

BRAND:
- Australian English
- Proof-driven, no hype
- SE Melbourne default
- Call Kaids Roofing | ABN 39475055075 | 0435 900 709

OUTPUT FORMAT (mandatory every response):
[INTENT] 1-2 lines
[PLAN or RESULT] Clear, ordered, deterministic
[TOOL IMPACT] Which tools involved
[RISKS / GATES] Approval required or not
[NEXT ACTIONS] Concrete, actionable steps`;

/**
 * Default operator configuration
 */
const DEFAULT_CONFIG = {
  // System instruction (customizable)
  system_instruction: DEFAULT_SYSTEM_INSTRUCTION,

  // Operator behavior
  behavior: {
    // Auto-clarify when confidence below threshold
    clarify_threshold: 0.7,

    // Auto-execute T0/T1 without confirmation
    auto_execute_tiers: ['T0'],

    // Always require approval for these domains
    require_approval_domains: ['invoice', 'comms'],

    // Maximum tools in a single run plan
    max_tools_per_plan: 10,

    // Default mode when none specified
    default_mode: 'analyze',

    // Show verbose layer output
    verbose: false,

    // Enable memory persistence
    enable_memory: true,

    // Memory history limit
    memory_limit: 50,

    // V2: Ledger system (durable memory)
    enable_ledger: true,

    // V2: Context injection (auto-inject conversation history)
    enable_context_injection: true,

    // V2: V21 action ID format
    enable_v21_action_id: true,

    // V2: Quiet hours enforcement
    enable_quiet_hours: true,

    // V2: 3-pass RAG retrieval
    enable_3pass_rag: true,

    // V2: RAG citations
    enable_citations: true,

    // V2: Council deliberation (opt-in, disabled by default)
    enable_council: false,

    // V2: Notification classification
    enable_notifications: false
  },

  // LLM settings
  llm: {
    // OpenRouter settings
    openrouter_model: 'anthropic/claude-3-5-haiku-20241022',
    openrouter_base_url: 'https://openrouter.ai/api/v1',

    // Temperature for intent classification
    classification_temperature: 0.3,

    // Max tokens for classification response
    max_tokens: 1024
  },

  // Brand customization
  brand: {
    company_name: 'Call Kaids Roofing',
    abn: '39475055075',
    phone: '0435 900 709',
    email: 'info@callkaidsroofing.com.au',
    locale: 'en-AU',
    default_region: 'SE Melbourne'
  },

  // Risk tier overrides
  risk_overrides: {
    // Example: 'leads.create': 'T0' // Override default risk tier
  },

  // Custom tool descriptions (for better LLM understanding)
  tool_hints: {
    // Example: 'os.health_check': 'Use this for system status checks'
  },

  // V2: Quiet hours configuration
  quiet_hours: {
    start: '22:00',           // 10 PM
    end: '07:00',             // 7 AM
    timezone: 'Australia/Melbourne',
    emergency_override_required: true
  },

  // V2: Council deliberation settings
  council: {
    // Enable full deliberation for these risk tiers
    full_deliberation_tiers: ['T3', 'T4'],

    // Quick deliberation for these risk tiers
    quick_deliberation_tiers: ['T2'],

    // Skip deliberation for these tiers
    skip_tiers: ['T0', 'T1']
  },

  // V2: Context injection settings
  context_injection: {
    // Max conversation turns to retain
    max_turns: 50,

    // Estimated token limit for context
    max_tokens_estimate: 4000
  }
};

/**
 * Operator Configuration Manager
 */
export class OperatorConfig {
  constructor(configPath = null) {
    this.configPath = configPath || DEFAULT_CONFIG_PATH;
    this.config = { ...DEFAULT_CONFIG };

    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Load from file if exists
    if (existsSync(this.configPath)) {
      this._loadFromFile();
    } else {
      // Create default config file
      this._saveToFile();
    }

    // Override with environment variables
    this._loadFromEnv();
  }

  /**
   * Get the full system instruction
   */
  getSystemInstruction() {
    return this.config.system_instruction;
  }

  /**
   * Set custom system instruction
   */
  setSystemInstruction(instruction) {
    this.config.system_instruction = instruction;
    this._saveToFile();
  }

  /**
   * Append to system instruction
   */
  appendSystemInstruction(addition) {
    this.config.system_instruction += '\n\n' + addition;
    this._saveToFile();
  }

  /**
   * Reset system instruction to default
   */
  resetSystemInstruction() {
    this.config.system_instruction = DEFAULT_SYSTEM_INSTRUCTION;
    this._saveToFile();
  }

  /**
   * Get behavior setting
   */
  getBehavior(key) {
    return this.config.behavior[key];
  }

  /**
   * Set behavior setting
   */
  setBehavior(key, value) {
    this.config.behavior[key] = value;
    this._saveToFile();
  }

  /**
   * Get LLM setting
   */
  getLLM(key) {
    return this.config.llm[key];
  }

  /**
   * Set LLM setting
   */
  setLLM(key, value) {
    this.config.llm[key] = value;
    this._saveToFile();
  }

  /**
   * Get brand info
   */
  getBrand(key = null) {
    if (key) return this.config.brand[key];
    return this.config.brand;
  }

  /**
   * Set brand info
   */
  setBrand(key, value) {
    this.config.brand[key] = value;
    this._saveToFile();
  }

  /**
   * Get risk override for a tool
   */
  getRiskOverride(toolName) {
    return this.config.risk_overrides[toolName] || null;
  }

  /**
   * Set risk override for a tool
   */
  setRiskOverride(toolName, tier) {
    this.config.risk_overrides[toolName] = tier;
    this._saveToFile();
  }

  /**
   * Get tool hint
   */
  getToolHint(toolName) {
    return this.config.tool_hints[toolName] || null;
  }

  /**
   * Set tool hint
   */
  setToolHint(toolName, hint) {
    this.config.tool_hints[toolName] = hint;
    this._saveToFile();
  }

  /**
   * Get full config object
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Merge partial config
   */
  merge(partial) {
    this.config = this._deepMerge(this.config, partial);
    this._saveToFile();
  }

  /**
   * Export config to JSON string
   */
  export() {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import config from JSON string
   */
  import(jsonString) {
    const imported = JSON.parse(jsonString);
    this.config = this._deepMerge(DEFAULT_CONFIG, imported);
    this._saveToFile();
  }

  /**
   * Reset to defaults
   */
  reset() {
    this.config = { ...DEFAULT_CONFIG };
    this._saveToFile();
  }

  // Private methods

  _loadFromFile() {
    try {
      const data = JSON.parse(readFileSync(this.configPath, 'utf8'));
      this.config = this._deepMerge(DEFAULT_CONFIG, data);
    } catch (error) {
      console.warn('Config load failed:', error.message);
    }
  }

  _saveToFile() {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.warn('Config save failed:', error.message);
    }
  }

  _loadFromEnv() {
    // OpenRouter API key
    if (process.env.OPENROUTER_API_KEY) {
      this.config.llm.openrouter_api_key = process.env.OPENROUTER_API_KEY;
    }

    // OpenRouter model override
    if (process.env.OPENROUTER_MODEL) {
      this.config.llm.openrouter_model = process.env.OPENROUTER_MODEL;
    }

    // Verbose mode
    if (process.env.GEM_VERBOSE === 'true') {
      this.config.behavior.verbose = true;
    }

    // Memory disable
    if (process.env.GEM_NO_MEMORY === 'true') {
      this.config.behavior.enable_memory = false;
    }

    // V2: Ledger system
    if (process.env.GEM_ENABLE_LEDGER !== undefined) {
      this.config.behavior.enable_ledger = process.env.GEM_ENABLE_LEDGER === 'true';
    }

    // V2: Context injection
    if (process.env.GEM_ENABLE_CONTEXT_INJECTION !== undefined) {
      this.config.behavior.enable_context_injection = process.env.GEM_ENABLE_CONTEXT_INJECTION === 'true';
    }

    // V2: V21 action ID
    if (process.env.GEM_ENABLE_V21_ACTION_ID !== undefined) {
      this.config.behavior.enable_v21_action_id = process.env.GEM_ENABLE_V21_ACTION_ID === 'true';
    }

    // V2: Quiet hours
    if (process.env.GEM_ENABLE_QUIET_HOURS !== undefined) {
      this.config.behavior.enable_quiet_hours = process.env.GEM_ENABLE_QUIET_HOURS === 'true';
    }
    if (process.env.GEM_QUIET_HOURS_START) {
      this.config.quiet_hours.start = process.env.GEM_QUIET_HOURS_START;
    }
    if (process.env.GEM_QUIET_HOURS_END) {
      this.config.quiet_hours.end = process.env.GEM_QUIET_HOURS_END;
    }
    if (process.env.GEM_TIMEZONE) {
      this.config.quiet_hours.timezone = process.env.GEM_TIMEZONE;
    }

    // V2: 3-pass RAG
    if (process.env.GEM_ENABLE_3PASS_RAG !== undefined) {
      this.config.behavior.enable_3pass_rag = process.env.GEM_ENABLE_3PASS_RAG === 'true';
    }

    // V2: RAG citations
    if (process.env.GEM_ENABLE_CITATIONS !== undefined) {
      this.config.behavior.enable_citations = process.env.GEM_ENABLE_CITATIONS === 'true';
    }

    // V2: Council deliberation
    if (process.env.GEM_ENABLE_COUNCIL !== undefined) {
      this.config.behavior.enable_council = process.env.GEM_ENABLE_COUNCIL === 'true';
    }

    // V2: Notifications
    if (process.env.GEM_ENABLE_NOTIFICATIONS !== undefined) {
      this.config.behavior.enable_notifications = process.env.GEM_ENABLE_NOTIFICATIONS === 'true';
    }

    // V2: Max conversation turns
    if (process.env.GEM_MAX_TURNS) {
      this.config.context_injection.max_turns = parseInt(process.env.GEM_MAX_TURNS, 10);
    }
  }

  _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

/**
 * Shared config instance
 */
let sharedConfig = null;

export function getSharedConfig() {
  if (!sharedConfig) {
    sharedConfig = new OperatorConfig();
  }
  return sharedConfig;
}

export function resetSharedConfig() {
  if (sharedConfig) {
    sharedConfig.reset();
  }
  sharedConfig = null;
}

/**
 * Quick accessors
 */
export const getSystemInstruction = () => getSharedConfig().getSystemInstruction();
export const getBehavior = (key) => getSharedConfig().getBehavior(key);
export const getLLM = (key) => getSharedConfig().getLLM(key);
export const getBrand = (key) => getSharedConfig().getBrand(key);
