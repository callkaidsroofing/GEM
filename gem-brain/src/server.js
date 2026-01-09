/**
 * GEM Brain API Server
 *
 * Provides HTTP API for the Brain layer.
 * Deployment: Render Web Service
 */

import Fastify from 'fastify';
import { runBrain } from './brain.js';
import { getHelpText } from './planner/rules.js';
import { getAllTools } from './lib/registry.js';
import { createOperator } from './operator.js';
import { checkLLMConfig } from './lib/llm.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

// Store active operator sessions
const operatorSessions = new Map();

/**
 * Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
  const llmConfig = checkLLMConfig();
  return {
    status: 'ok',
    service: 'gem-brain',
    timestamp: new Date().toISOString(),
    llm: {
      configured: llmConfig.configured,
      provider: llmConfig.provider,
      model: llmConfig.model
    }
  };
});

/**
 * Get available tools
 */
fastify.get('/brain/tools', async (request, reply) => {
  const tools = getAllTools();
  return {
    count: tools.length,
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      idempotency: t.idempotency?.mode || 'none'
    }))
  };
});

/**
 * Get help text for available commands
 */
fastify.get('/brain/help', async (request, reply) => {
  return {
    help: getHelpText()
  };
});

/**
 * Main Brain endpoint (rules-based)
 *
 * POST /brain/run
 * Body: BrainRunRequest
 * Response: BrainRunResponse
 */
fastify.post('/brain/run', {
  schema: {
    body: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
        mode: {
          type: 'string',
          enum: ['answer', 'plan', 'enqueue', 'enqueue_and_wait'],
          default: 'answer'
        },
        conversation_id: { type: 'string', format: 'uuid', nullable: true },
        context: {
          type: 'object',
          properties: {
            lead_id: { type: 'string', format: 'uuid' },
            job_id: { type: 'string', format: 'uuid' },
            quote_id: { type: 'string', format: 'uuid' }
          },
          additionalProperties: false
        },
        limits: {
          type: 'object',
          properties: {
            max_tool_calls: { type: 'integer', minimum: 1, maximum: 50 },
            wait_timeout_ms: { type: 'integer', minimum: 1000, maximum: 120000 }
          },
          additionalProperties: false
        }
      }
    }
  }
}, async (request, reply) => {
  const response = await runBrain(request.body);

  // Set appropriate status code
  if (!response.ok) {
    if (response.errors.some(e => e.code === 'validation_error' || e.code === 'invalid_message' || e.code === 'invalid_mode')) {
      reply.code(400);
    } else if (response.errors.some(e => e.code === 'internal_error')) {
      reply.code(500);
    }
  }

  return response;
});

/**
 * Operator Chat endpoint (LLM-powered conversational)
 *
 * POST /operator/chat
 * Body: { message, session_id? }
 * Response: { ok, response, session_id, mode }
 */
fastify.post('/operator/chat', {
  schema: {
    body: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string', minLength: 1 },
        session_id: { type: 'string', format: 'uuid', nullable: true }
      }
    }
  }
}, async (request, reply) => {
  const { message, session_id } = request.body;

  try {
    // Get or create operator for this session
    let operator = session_id ? operatorSessions.get(session_id) : null;
    
    if (!operator) {
      operator = await createOperator(session_id);
      operatorSessions.set(operator.getSessionId(), operator);
      
      // Clean up old sessions (keep last 100)
      if (operatorSessions.size > 100) {
        const oldest = operatorSessions.keys().next().value;
        operatorSessions.delete(oldest);
      }
    }

    const result = await operator.process(message);

    return {
      ok: result.ok,
      response: result.response,
      session_id: operator.getSessionId(),
      mode: result.mode,
      tool_results: result.toolResults ? {
        executed: result.toolResults.enqueued?.length || 0,
        succeeded: result.toolResults.receipts?.filter(r => r.status === 'succeeded').length || 0
      } : null
    };

  } catch (error) {
    fastify.log.error(error);
    reply.code(500);
    return {
      ok: false,
      response: `Error: ${error.message}`,
      session_id: session_id || null,
      mode: 'error'
    };
  }
});

/**
 * Get operator session info
 *
 * GET /operator/session/:session_id
 */
fastify.get('/operator/session/:session_id', async (request, reply) => {
  const { session_id } = request.params;
  const operator = operatorSessions.get(session_id);

  if (!operator) {
    reply.code(404);
    return {
      ok: false,
      error: 'Session not found'
    };
  }

  const stats = operator.memory.getStats();
  return {
    ok: true,
    session_id,
    mode: operator.mode,
    approved: operator.approved,
    context: operator.context,
    memory: {
      entry_count: stats.entry_count,
      memory_limit: stats.memory_limit
    }
  };
});

/**
 * Error handler
 */
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({
    ok: false,
    run_id: null,
    decision: { mode_used: 'answer', reason: 'Internal server error' },
    planned_tool_calls: [],
    enqueued: [],
    receipts: [],
    assistant_message: 'An internal error occurred.',
    next_actions: [],
    errors: [{
      code: 'internal_error',
      message: error.message,
      details: {}
    }]
  });
});

/**
 * Start server
 */
async function start() {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    
    const llmConfig = checkLLMConfig();
    
    console.log(`GEM Brain API running on http://${HOST}:${PORT}`);
    console.log('');
    console.log('LLM Status:');
    console.log(`  Configured: ${llmConfig.configured}`);
    console.log(`  Provider: ${llmConfig.provider || 'none'}`);
    console.log(`  Model: ${llmConfig.model}`);
    console.log('');
    console.log('Endpoints:');
    console.log('  GET  /health           - Health check');
    console.log('  GET  /brain/tools      - List available tools');
    console.log('  GET  /brain/help       - Get help text');
    console.log('  POST /brain/run        - Run Brain (rules-based)');
    console.log('  POST /operator/chat    - Operator chat (LLM-powered)');
    console.log('  GET  /operator/session/:id - Get session info');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
