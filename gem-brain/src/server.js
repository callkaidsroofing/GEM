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

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

/**
 * Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    service: 'gem-brain',
    timestamp: new Date().toISOString()
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
 * Main Brain endpoint
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
    console.log(`GEM Brain API running on http://${HOST}:${PORT}`);
    console.log('Endpoints:');
    console.log('  GET  /health      - Health check');
    console.log('  GET  /brain/tools - List available tools');
    console.log('  GET  /brain/help  - Get help text');
    console.log('  POST /brain/run   - Run Brain');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
