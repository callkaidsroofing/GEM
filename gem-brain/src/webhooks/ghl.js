/**
 * GoHighLevel Webhook Handler
 *
 * Receives webhooks from GoHighLevel (LeadConnector) and translates them
 * into GEM tool calls for processing by the executor.
 *
 * Webhook Events: https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/
 */

import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';

/**
 * GHL Event to GEM Tool Mapping
 */
const EVENT_TO_TOOL = {
  // Contact Events
  ContactCreate: 'leads.create',
  ContactUpdate: 'leads.update_stage',
  ContactDelete: 'leads.archive',
  ContactTagUpdate: 'leads.update_tags',
  ContactDndUpdate: 'leads.update_dnd',

  // Appointment Events
  AppointmentCreate: 'calendar.create_event',
  AppointmentUpdate: 'calendar.update_event',
  AppointmentDelete: 'calendar.cancel_event',

  // Opportunity Events
  OpportunityCreate: 'leads.create_opportunity',
  OpportunityUpdate: 'leads.update_opportunity',
  OpportunityStageUpdate: 'leads.update_stage',
  OpportunityStatusUpdate: 'leads.update_stage',
  OpportunityDelete: 'leads.archive_opportunity',

  // Task Events
  TaskCreate: 'os.create_task',
  TaskComplete: 'os.complete_task',
  TaskDelete: 'os.delete_task',

  // Invoice Events
  InvoiceCreate: 'invoice.create',
  InvoicePaid: 'invoice.record_payment',
  InvoiceVoided: 'invoice.void',

  // Note Events
  NoteCreate: 'os.create_note',
};

/**
 * Payload Transformers - Convert GHL payload to GEM tool input
 */
const PAYLOAD_TRANSFORMERS = {
  ContactCreate: (payload) => ({
    name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || 'Unknown',
    phone: payload.phone || payload.mobile,
    email: payload.email,
    suburb: payload.city || payload.address1,
    source: 'ghl',
    leadconnector_contact_id: payload.id,
    metadata: {
      ghl_location_id: payload.locationId,
      ghl_tags: payload.tags,
      ghl_custom_fields: payload.customFields,
      webhook_received_at: new Date().toISOString(),
    },
  }),

  ContactUpdate: (payload) => ({
    leadconnector_contact_id: payload.id,
    updates: {
      name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
      email: payload.email,
      phone: payload.phone,
    },
    metadata: {
      ghl_tags: payload.tags,
      webhook_received_at: new Date().toISOString(),
    },
  }),

  AppointmentCreate: (payload) => ({
    title: payload.title || 'GHL Appointment',
    start_time: payload.startTime,
    end_time: payload.endTime,
    attendee_contact_id: payload.contactId,
    location: payload.address,
    notes: payload.notes,
    metadata: {
      ghl_appointment_id: payload.id,
      ghl_calendar_id: payload.calendarId,
      webhook_received_at: new Date().toISOString(),
    },
  }),

  OpportunityStageUpdate: (payload) => ({
    leadconnector_contact_id: payload.contactId,
    stage: mapGHLStageToGEM(payload.pipelineStage),
    notes: `Stage updated via GHL: ${payload.pipelineStage}`,
    metadata: {
      ghl_opportunity_id: payload.id,
      ghl_pipeline_id: payload.pipelineId,
      webhook_received_at: new Date().toISOString(),
    },
  }),

  TaskCreate: (payload) => ({
    title: payload.title,
    description: payload.body || payload.description,
    due_date: payload.dueDate,
    assigned_to: payload.assignedTo,
    priority: payload.priority || 'medium',
    metadata: {
      ghl_task_id: payload.id,
      ghl_contact_id: payload.contactId,
      webhook_received_at: new Date().toISOString(),
    },
  }),

  NoteCreate: (payload) => ({
    content: payload.body,
    entity_type: 'lead',
    entity_id: payload.contactId,
    metadata: {
      ghl_note_id: payload.id,
      webhook_received_at: new Date().toISOString(),
    },
  }),
};

/**
 * Map GHL pipeline stages to GEM lead stages
 */
function mapGHLStageToGEM(ghlStage) {
  const stageMapping = {
    new: 'new',
    'New Lead': 'new',
    contacted: 'contacted',
    Contacted: 'contacted',
    'Appointment Set': 'inspection_scheduled',
    'appointment set': 'inspection_scheduled',
    'Quote Sent': 'quoted',
    'quote sent': 'quoted',
    Won: 'won',
    won: 'won',
    'Closed Won': 'won',
    Lost: 'lost',
    lost: 'lost',
    'Closed Lost': 'lost',
  };

  return stageMapping[ghlStage] || 'new';
}

/**
 * Verify GHL webhook signature
 * GHL uses HMAC-SHA256 for webhook verification
 */
export function verifyWebhookSignature(payload, signature) {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('GHL_WEBHOOK_SECRET not set - skipping signature verification');
    return true; // Allow in development
  }

  if (!signature) {
    console.error('No signature provided in webhook');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Handle incoming GHL webhook
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function handleGHLWebhook(req, res) {
  const startTime = Date.now();

  try {
    // Extract event type and payload
    const event = req.body.event || req.body.type;
    const payload = req.body.data || req.body;
    const signature = req.headers['x-ghl-signature'] || req.headers['x-webhook-signature'];

    console.info(`GHL Webhook received: ${event}`);

    // Verify signature
    if (!verifyWebhookSignature(req.body, signature)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({
        status: 'rejected',
        reason: 'invalid_signature',
      });
    }

    // Map event to tool
    const toolName = EVENT_TO_TOOL[event];
    if (!toolName) {
      console.warn(`Unmapped GHL event: ${event}`);
      return res.status(200).json({
        status: 'ignored',
        reason: `Event ${event} not mapped to GEM tool`,
        event,
      });
    }

    // Transform payload
    const transformer = PAYLOAD_TRANSFORMERS[event];
    const toolInput = transformer ? transformer(payload) : payload;

    // Check for required fields
    if (!toolInput || Object.keys(toolInput).length === 0) {
      console.warn(`Empty payload for event: ${event}`);
      return res.status(200).json({
        status: 'ignored',
        reason: 'Empty payload after transformation',
        event,
      });
    }

    // Enqueue tool call
    const { data: call, error } = await supabase
      .from('core_tool_calls')
      .insert({
        tool_name: toolName,
        input: toolInput,
        status: 'queued',
        idempotency_key: `ghl-${event}-${payload.id || Date.now()}`,
        metadata: {
          source: 'ghl_webhook',
          ghl_event: event,
          received_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (error) {
      // Check for idempotency (duplicate webhook)
      if (error.code === '23505') {
        console.info(`Duplicate webhook ignored: ${event} - ${payload.id}`);
        return res.status(200).json({
          status: 'duplicate',
          reason: 'Webhook already processed (idempotency)',
          event,
        });
      }

      console.error('Failed to enqueue tool call:', error);
      return res.status(500).json({
        status: 'error',
        reason: 'Failed to enqueue tool call',
        error: error.message,
      });
    }

    const processingTime = Date.now() - startTime;
    console.info(`GHL Webhook processed: ${event} -> ${toolName} (call_id: ${call.id}, ${processingTime}ms)`);

    return res.status(200).json({
      status: 'queued',
      tool_name: toolName,
      call_id: call.id,
      processing_time_ms: processingTime,
    });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({
      status: 'error',
      reason: 'Internal server error',
      error: error.message,
    });
  }
}

/**
 * Express router setup for GHL webhooks
 */
export function setupGHLWebhookRoutes(app) {
  // Main webhook endpoint
  app.post('/webhooks/ghl', handleGHLWebhook);

  // Health check for webhook endpoint
  app.get('/webhooks/ghl/health', (req, res) => {
    res.json({
      status: 'ok',
      integration: 'GoHighLevel',
      configured: !!process.env.GHL_API_KEY,
      signature_verification: !!process.env.GHL_WEBHOOK_SECRET,
      supported_events: Object.keys(EVENT_TO_TOOL),
    });
  });

  // List supported events (for documentation)
  app.get('/webhooks/ghl/events', (req, res) => {
    res.json({
      events: EVENT_TO_TOOL,
      transformers: Object.keys(PAYLOAD_TRANSFORMERS),
    });
  });

  console.info('GHL webhook routes registered: POST /webhooks/ghl');
}

export default {
  handleGHLWebhook,
  setupGHLWebhookRoutes,
  verifyWebhookSignature,
  EVENT_TO_TOOL,
};
