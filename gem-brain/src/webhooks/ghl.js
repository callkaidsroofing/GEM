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
 * All transformers are async to support database lookups
 */
const PAYLOAD_TRANSFORMERS = {
  ContactCreate: async (payload) => {
    // Track inbound sync
    await trackInboundSync(payload.id, payload.locationId, payload);

    return {
      name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || 'Unknown',
      phone: payload.phone || payload.mobile,
      email: payload.email,
      suburb: payload.city || payload.address1,
      source: 'ghl',
      leadconnector_contact_id: payload.id,
      highlevel_contact_id: payload.id,
      metadata: {
        ghl_location_id: payload.locationId,
        ghl_tags: payload.tags,
        ghl_custom_fields: payload.customFields,
        webhook_received_at: new Date().toISOString(),
      },
    };
  },

  ContactUpdate: async (payload) => {
    // Track inbound sync
    await trackInboundSync(payload.id, payload.locationId, payload);

    return {
      leadconnector_contact_id: payload.id,
      highlevel_contact_id: payload.id,
      updates: {
        name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
        email: payload.email,
        phone: payload.phone,
        address: payload.address1,
        city: payload.city,
        state: payload.state,
        postal_code: payload.postalCode,
      },
      metadata: {
        ghl_tags: payload.tags,
        ghl_location_id: payload.locationId,
        webhook_received_at: new Date().toISOString(),
      },
    };
  },

  AppointmentCreate: async (payload) => ({
    title: payload.title || 'GHL Appointment',
    start_time: payload.startTime,
    end_time: payload.endTime,
    attendee_contact_id: payload.contactId,
    highlevel_contact_id: payload.contactId,
    location: payload.address,
    notes: payload.notes,
    metadata: {
      ghl_appointment_id: payload.id,
      ghl_calendar_id: payload.calendarId,
      webhook_received_at: new Date().toISOString(),
    },
  }),

  OpportunityStageUpdate: async (payload) => {
    // Use async stage mapping with database lookup
    const gemStage = await mapGHLStageToGEM(payload.pipelineStage, payload.pipelineStageId);

    return {
      leadconnector_contact_id: payload.contactId,
      highlevel_contact_id: payload.contactId,
      highlevel_opportunity_id: payload.id,
      stage: gemStage,
      notes: `Stage updated via GHL: ${payload.pipelineStage}`,
      metadata: {
        ghl_opportunity_id: payload.id,
        ghl_pipeline_id: payload.pipelineId,
        ghl_stage_id: payload.pipelineStageId,
        ghl_stage_name: payload.pipelineStage,
        webhook_received_at: new Date().toISOString(),
      },
    };
  },

  OpportunityCreate: async (payload) => {
    const gemStage = await mapGHLStageToGEM(payload.pipelineStage, payload.pipelineStageId);

    return {
      leadconnector_contact_id: payload.contactId,
      highlevel_contact_id: payload.contactId,
      highlevel_opportunity_id: payload.id,
      name: payload.name,
      stage: gemStage,
      monetary_value: payload.monetaryValue || 0,
      metadata: {
        ghl_opportunity_id: payload.id,
        ghl_pipeline_id: payload.pipelineId,
        ghl_stage_id: payload.pipelineStageId,
        webhook_received_at: new Date().toISOString(),
      },
    };
  },

  TaskCreate: async (payload) => ({
    title: payload.title,
    description: payload.body || payload.description,
    due_date: payload.dueDate,
    assigned_to: payload.assignedTo,
    priority: payload.priority || 'medium',
    highlevel_contact_id: payload.contactId,
    metadata: {
      ghl_task_id: payload.id,
      ghl_contact_id: payload.contactId,
      webhook_received_at: new Date().toISOString(),
    },
  }),

  NoteCreate: async (payload) => ({
    content: payload.body,
    entity_type: 'lead',
    entity_id: payload.contactId,
    highlevel_contact_id: payload.contactId,
    metadata: {
      ghl_note_id: payload.id,
      webhook_received_at: new Date().toISOString(),
    },
  }),
};

/**
 * Map GHL pipeline stages to GEM lead stages
 * Uses database mapping table with fallback to hardcoded values
 */
const STAGE_MAPPING_CACHE = {
  data: null,
  lastFetch: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

async function loadStageMappingFromDB() {
  if (STAGE_MAPPING_CACHE.data && Date.now() - STAGE_MAPPING_CACHE.lastFetch < STAGE_MAPPING_CACHE.ttl) {
    return STAGE_MAPPING_CACHE.data;
  }

  try {
    const { data, error } = await supabase
      .from('highlevel_stage_mapping')
      .select('highlevel_stage_id, highlevel_stage_name, ckr_lead_status');

    if (!error && data) {
      const mapping = {};
      data.forEach(row => {
        mapping[row.highlevel_stage_id] = row.ckr_lead_status;
        mapping[row.highlevel_stage_name] = row.ckr_lead_status;
        mapping[row.highlevel_stage_name.toLowerCase()] = row.ckr_lead_status;
      });
      STAGE_MAPPING_CACHE.data = mapping;
      STAGE_MAPPING_CACHE.lastFetch = Date.now();
      return mapping;
    }
  } catch (err) {
    console.warn('Failed to load stage mapping from DB:', err.message);
  }

  return null;
}

async function mapGHLStageToGEM(ghlStage, stageId = null) {
  // Try database mapping first
  const dbMapping = await loadStageMappingFromDB();
  if (dbMapping) {
    if (stageId && dbMapping[stageId]) return dbMapping[stageId];
    if (dbMapping[ghlStage]) return dbMapping[ghlStage];
    if (dbMapping[ghlStage?.toLowerCase()]) return dbMapping[ghlStage.toLowerCase()];
  }

  // Fallback to hardcoded mapping
  const stageMapping = {
    new: 'new',
    'New Lead': 'new',
    contacted: 'contacted',
    Contacted: 'contacted',
    'Roof Health Check Booked': 'inspection_scheduled',
    'Appointment Set': 'inspection_scheduled',
    'appointment set': 'inspection_scheduled',
    'Quoting': 'quoted',
    'Quote Sent': 'quoted',
    'quote sent': 'quoted',
    'Follow Up': 'quoted',
    'Services Sold': 'won',
    Won: 'won',
    won: 'won',
    'Closed Won': 'won',
    'Ghosting': 'lost',
    'Disqualified': 'lost',
    Lost: 'lost',
    lost: 'lost',
    'Closed Lost': 'lost',
  };

  return stageMapping[ghlStage] || 'new';
}

/**
 * Track inbound sync in database
 */
async function trackInboundSync(contactId, locationId, payload) {
  try {
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    await supabase
      .from('highlevel_contact_sync')
      .upsert({
        highlevel_contact_id: contactId,
        highlevel_location_id: locationId,
        sync_direction: 'inbound',
        sync_status: 'synced',
        last_sync_at: new Date().toISOString(),
        last_sync_direction: 'inbound',
        highlevel_updated_at: new Date().toISOString(),
        highlevel_payload_hash: payloadHash
      }, {
        onConflict: 'highlevel_contact_id,highlevel_location_id'
      });
  } catch (err) {
    console.warn('Failed to track inbound sync:', err.message);
  }
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

    // Transform payload (transformers are now async)
    const transformer = PAYLOAD_TRANSFORMERS[event];
    const toolInput = transformer ? await transformer(payload) : payload;

    // Check for required fields
    if (!toolInput || Object.keys(toolInput).length === 0) {
      console.warn(`Empty payload for event: ${event}`);
      return res.status(200).json({
        status: 'ignored',
        reason: 'Empty payload after transformation',
        event,
      });
    }

    // Add sync tracking metadata
    toolInput._sync_metadata = {
      source: 'ghl_webhook',
      direction: 'inbound',
      received_at: new Date().toISOString(),
      highlevel_location_id: payload.locationId || process.env.HIGHLEVEL_LOCATION_ID
    };

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
    // Support both naming conventions for Private Integration token
    const hasPrivateIntegrationToken = !!(process.env.HIGHLEVEL_PRIVATE_API_KEY || process.env.GHL_API_KEY);
    const hasLocationId = !!(process.env.HIGHLEVEL_LOCATION_ID || process.env.GHL_LOCATION_ID);

    res.json({
      status: hasPrivateIntegrationToken && hasLocationId ? 'ok' : 'degraded',
      integration: 'GoHighLevel',
      api_version: 'v2.0',
      configured: hasPrivateIntegrationToken && hasLocationId,
      private_integration_token: hasPrivateIntegrationToken,
      location_id_set: hasLocationId,
      signature_verification: !!process.env.GHL_WEBHOOK_SECRET,
      supported_events: Object.keys(EVENT_TO_TOOL),
      security_notes: {
        token_type: 'Private Integration (static, requires manual 90-day rotation)',
        rotation_reminder: 'Rotate token every 90 days via GHL Settings > Private Integrations',
      },
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
