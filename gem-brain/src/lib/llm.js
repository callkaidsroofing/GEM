/**
 * LLM Provider for GEM Brain
 *
 * Provides conversational AI via OpenRouter or direct Anthropic API.
 * Supports streaming, function calling, and context management.
 *
 * Environment Variables:
 *   OPENROUTER_API_KEY - For OpenRouter (preferred, multi-model)
 *   ANTHROPIC_API_KEY  - For direct Anthropic access
 *   LLM_MODEL         - Model to use (default: anthropic/claude-3-5-haiku-20241022)
 *   LLM_TEMPERATURE   - Temperature (default: 0.3)
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

const DEFAULT_MODEL = 'anthropic/claude-3-5-haiku-20241022';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Check LLM configuration
 */
export function checkLLMConfig() {
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  
  return {
    configured: hasOpenRouter || hasAnthropic,
    provider: hasOpenRouter ? 'openrouter' : (hasAnthropic ? 'anthropic' : null),
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || DEFAULT_TEMPERATURE
  };
}

/**
 * Build messages array from conversation history
 */
function buildMessages(systemPrompt, history, currentMessage) {
  const messages = [];
  
  // Add conversation history
  for (const entry of history) {
    if (entry.role === 'user' || entry.role === 'assistant') {
      messages.push({
        role: entry.role,
        content: entry.content
      });
    }
  }
  
  // Add current message
  messages.push({
    role: 'user',
    content: currentMessage
  });
  
  return { systemPrompt, messages };
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(systemPrompt, messages, options = {}) {
  const {
    model = process.env.LLM_MODEL || DEFAULT_MODEL,
    temperature = parseFloat(process.env.LLM_TEMPERATURE) || DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    tools = null
  } = options;

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    temperature,
    max_tokens: maxTokens
  };

  // Add tools if provided (for function calling)
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://callkaidsroofing.com.au',
      'X-Title': 'CKR-GEM Operator'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    toolCalls: data.choices?.[0]?.message?.tool_calls || null,
    usage: data.usage,
    model: data.model
  };
}

/**
 * Call Anthropic API directly
 */
async function callAnthropic(systemPrompt, messages, options = {}) {
  const {
    model = 'claude-3-5-haiku-20241022',
    temperature = parseFloat(process.env.LLM_TEMPERATURE) || DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    tools = null
  } = options;

  // Convert model name if using OpenRouter format
  const anthropicModel = model.replace('anthropic/', '');

  const body = {
    model: anthropicModel,
    system: systemPrompt,
    messages,
    temperature,
    max_tokens: maxTokens
  };

  // Add tools if provided
  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters
    }));
  }

  const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  // Extract text content
  let content = '';
  let toolCalls = null;
  
  for (const block of data.content || []) {
    if (block.type === 'text') {
      content += block.text;
    } else if (block.type === 'tool_use') {
      if (!toolCalls) toolCalls = [];
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input)
        }
      });
    }
  }

  return {
    content,
    toolCalls,
    usage: data.usage,
    model: data.model
  };
}

/**
 * Main chat completion function
 * Automatically selects provider based on available API keys
 */
export async function chatCompletion(systemPrompt, history, currentMessage, options = {}) {
  const config = checkLLMConfig();
  
  if (!config.configured) {
    throw new Error('No LLM API key configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY.');
  }

  const { messages } = buildMessages(systemPrompt, history, currentMessage);

  if (config.provider === 'openrouter') {
    return callOpenRouter(systemPrompt, messages, options);
  } else {
    return callAnthropic(systemPrompt, messages, options);
  }
}

/**
 * Simple text completion (no history)
 */
export async function complete(systemPrompt, userMessage, options = {}) {
  return chatCompletion(systemPrompt, [], userMessage, options);
}

export default {
  checkLLMConfig,
  chatCompletion,
  complete
};
