/**
 * Rules-First Planner
 *
 * Maps natural language messages to registry-valid tool calls using pattern matching.
 * No LLM required - operates purely on rules.
 *
 * Returns: { toolCalls: [...], confidence: 'high'|'medium'|'low'|'none', reason: string }
 */

import { getTool, validateToolInput } from '../lib/registry.js';

/**
 * Rule definitions: each rule has:
 * - patterns: regex patterns to match
 * - extract: function to extract parameters from the message
 * - tool: the tool name to call
 * - confidence: how confident we are in this mapping
 */
const RULES = [
  // System status
  {
    patterns: [
      /^(system\s+)?status$/i,
      /^health\s*check$/i,
      /^check\s+(system\s+)?status$/i,
      /^how('s| is) the system$/i
    ],
    tool: 'os.health_check',
    extract: () => ({}),
    confidence: 'high'
  },

  // Create note
  {
    patterns: [
      /^(create|add|make|new)\s+note\s*[:\-]?\s*(.+)$/i,
      /^note\s*[:\-]\s*(.+)$/i
    ],
    tool: 'os.create_note',
    extract: (match, message) => {
      const content = match[2] || match[1] || message.replace(/^(create|add|make|new)\s+note\s*/i, '').trim();
      // Try to extract domain from content
      let domain = 'business';
      if (/\b(personal|private|home)\b/i.test(content)) {
        domain = 'personal';
      }
      return {
        domain,
        title: content.substring(0, 100),
        content: content
      };
    },
    confidence: 'high'
  },

  // Create task
  {
    patterns: [
      /^(create|add|make|new)\s+task\s*[:\-]?\s*(.+)$/i,
      /^task\s*[:\-]\s*(.+)$/i,
      /^todo\s*[:\-]?\s*(.+)$/i,
      /^remind\s+me\s+to\s+(.+)$/i
    ],
    tool: 'os.create_task',
    extract: (match, message) => {
      const title = match[2] || match[1] || message.replace(/^(create|add|make|new)\s+task\s*/i, '').trim();
      let domain = 'business';
      let priority = 'normal';

      if (/\b(personal|private|home)\b/i.test(title)) {
        domain = 'personal';
      }
      if (/\b(urgent|asap|immediately)\b/i.test(title)) {
        priority = 'high';
      }
      if (/\b(low\s+priority|when\s+you\s+can|eventually)\b/i.test(title)) {
        priority = 'low';
      }

      return {
        title: title.substring(0, 200),
        domain,
        priority
      };
    },
    confidence: 'high'
  },

  // Complete task
  {
    patterns: [
      /^complete\s+task\s+([a-f0-9\-]{36})$/i,
      /^mark\s+task\s+([a-f0-9\-]{36})\s+(as\s+)?(done|complete|finished)$/i,
      /^finish\s+task\s+([a-f0-9\-]{36})$/i
    ],
    tool: 'os.complete_task',
    extract: (match) => ({
      task_id: match[1]
    }),
    confidence: 'high'
  },

  // List tasks
  {
    patterns: [
      /^(list|show|get)\s+(my\s+)?tasks$/i,
      /^what('s| are)\s+(my\s+)?tasks$/i,
      /^tasks$/i
    ],
    tool: 'os.list_tasks',
    extract: () => ({
      status: 'open'
    }),
    confidence: 'high'
  },

  // New lead
  {
    patterns: [
      /^new\s+lead\s*[:\-]?\s*(.+)$/i,
      /^(create|add)\s+lead\s*[:\-]?\s*(.+)$/i,
      /^lead\s+from\s+(.+)$/i
    ],
    tool: 'leads.create',
    extract: (match, message) => {
      const info = match[2] || match[1] || message;

      // Try to extract phone number
      const phoneMatch = info.match(/(\d{4}\s?\d{3}\s?\d{3}|\d{10}|\d{2}\s?\d{4}\s?\d{4})/);
      const phone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : '0400000000';

      // Try to extract name (first words before phone or comma)
      const nameMatch = info.match(/^([A-Za-z\s]+?)(?:\s+\d|,|$)/);
      const name = nameMatch ? nameMatch[1].trim() : 'Unknown';

      // Try to extract suburb
      const suburbPatterns = [
        /\bin\s+([A-Za-z\s]+?)(?:\s*,|\s+\d|$)/i,
        /suburb[:\s]+([A-Za-z\s]+?)(?:\s*,|$)/i
      ];
      let suburb = 'Unknown';
      for (const pattern of suburbPatterns) {
        const suburbMatch = info.match(pattern);
        if (suburbMatch) {
          suburb = suburbMatch[1].trim();
          break;
        }
      }

      return {
        name,
        phone,
        suburb,
        source: 'brain'
      };
    },
    confidence: 'medium'
  },

  // Calculate quote totals
  {
    patterns: [
      /^calculate\s+(quote\s+)?totals?\s+(for\s+)?([a-f0-9\-]{36})$/i,
      /^(update|recalculate)\s+quote\s+([a-f0-9\-]{36})\s+totals?$/i
    ],
    tool: 'quote.calculate_totals',
    extract: (match) => ({
      quote_id: match[3] || match[2]
    }),
    confidence: 'high'
  },

  // Search notes
  {
    patterns: [
      /^(search|find)\s+notes?\s+(for|about|containing)?\s*(.+)$/i,
      /^notes?\s+(about|for)\s+(.+)$/i
    ],
    tool: 'os.search_notes',
    extract: (match) => ({
      query: match[3] || match[2]
    }),
    confidence: 'high'
  },

  // List leads by stage
  {
    patterns: [
      /^(list|show|get)\s+(my\s+)?leads$/i,
      /^leads$/i,
      /^(list|show)\s+leads?\s+(in\s+)?(new|contacted|qualified|quoted|won|lost)(\s+stage)?$/i
    ],
    tool: 'leads.list_by_stage',
    extract: (match) => {
      const stage = match[3] || 'new';
      return { stage };
    },
    confidence: 'high'
  }
];

/**
 * Plan tool calls from a message using rules.
 *
 * @param {string} message - The user's message
 * @param {object} context - Optional context (lead_id, job_id, quote_id)
 * @returns {{ toolCalls: Array, confidence: string, reason: string }}
 */
export function planFromRules(message, context = {}) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return {
      toolCalls: [],
      confidence: 'none',
      reason: 'Empty message provided'
    };
  }

  // Try each rule
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = trimmedMessage.match(pattern);
      if (match) {
        try {
          const input = rule.extract(match, trimmedMessage);

          // Merge context if tool expects it
          const tool = getTool(rule.tool);
          if (tool && tool.input_schema?.properties) {
            if ('lead_id' in tool.input_schema.properties && context.lead_id && !input.lead_id) {
              input.lead_id = context.lead_id;
            }
            if ('job_id' in tool.input_schema.properties && context.job_id && !input.job_id) {
              input.job_id = context.job_id;
            }
            if ('quote_id' in tool.input_schema.properties && context.quote_id && !input.quote_id) {
              input.quote_id = context.quote_id;
            }
          }

          // Validate the input
          const validation = validateToolInput(rule.tool, input);
          if (!validation.valid) {
            return {
              toolCalls: [],
              confidence: 'none',
              reason: `Rule matched but validation failed: ${validation.error}`
            };
          }

          return {
            toolCalls: [{
              tool_name: rule.tool,
              input,
              idempotency_key: null
            }],
            confidence: rule.confidence,
            reason: `Matched rule pattern for ${rule.tool}`
          };
        } catch (error) {
          // Extraction failed, continue to next rule
          continue;
        }
      }
    }
  }

  // No rules matched
  return {
    toolCalls: [],
    confidence: 'none',
    reason: 'No matching rules found for this message. Try: "system status", "create task [title]", "new lead [name] [phone] in [suburb]", or "create note [content]"'
  };
}

/**
 * Get help text for available commands.
 */
export function getHelpText() {
  return `Available commands:
- "system status" or "health check" → Check system health
- "create note: [content]" → Create a note
- "create task: [title]" → Create a task
- "complete task [uuid]" → Mark task as done
- "list tasks" → Show open tasks
- "new lead: [name] [phone] in [suburb]" → Create a lead
- "list leads" → Show leads
- "search notes for [query]" → Search notes
- "calculate totals [quote_id]" → Calculate quote totals`;
}
