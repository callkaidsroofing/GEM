/**
 * GoHighLevel Integration
 *
 * Provides standardized access to GoHighLevel (LeadConnector) API
 * for contact management, opportunities, and workflow automation.
 *
 * API Documentation: https://marketplace.gohighlevel.com/docs/
 */

import { IntegrationBase, IntegrationRegistry } from './base.js';

/**
 * GoHighLevel API Integration
 */
export class GoHighLevelIntegration extends IntegrationBase {
  constructor() {
    super('GoHighLevel', {
      required_env: ['GHL_API_KEY', 'GHL_LOCATION_ID'],
      base_url: 'https://services.leadconnectorhq.com',
      timeout_ms: 30000,
      max_retries: 3,
    });
  }

  getAuthHeaders() {
    return {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      Version: '2021-07-28', // API version
    };
  }

  // ==================== Contacts ====================

  /**
   * Create a new contact in GoHighLevel
   */
  async createContact(data) {
    return this.call('POST', '/contacts/', {
      locationId: process.env.GHL_LOCATION_ID,
      ...data,
    });
  }

  /**
   * Update an existing contact
   */
  async updateContact(contactId, data) {
    return this.call('PUT', `/contacts/${contactId}`, data);
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId) {
    return this.call('GET', `/contacts/${contactId}`);
  }

  /**
   * Search contacts by phone or email
   */
  async searchContacts(query) {
    const params = new URLSearchParams({
      locationId: process.env.GHL_LOCATION_ID,
      query,
    });
    return this.call('GET', `/contacts/search/duplicate?${params}`);
  }

  /**
   * Add tags to a contact
   */
  async addTags(contactId, tags) {
    return this.call('POST', `/contacts/${contactId}/tags`, { tags });
  }

  /**
   * Remove tags from a contact
   */
  async removeTags(contactId, tags) {
    return this.call('DELETE', `/contacts/${contactId}/tags`, { tags });
  }

  // ==================== Opportunities ====================

  /**
   * Create an opportunity (deal)
   */
  async createOpportunity(data) {
    return this.call('POST', '/opportunities/', {
      locationId: process.env.GHL_LOCATION_ID,
      ...data,
    });
  }

  /**
   * Update opportunity status/stage
   */
  async updateOpportunity(opportunityId, data) {
    return this.call('PUT', `/opportunities/${opportunityId}`, data);
  }

  /**
   * Get pipeline stages
   */
  async getPipelines() {
    return this.call('GET', `/locations/${process.env.GHL_LOCATION_ID}/pipelines`);
  }

  // ==================== Appointments ====================

  /**
   * Create an appointment
   */
  async createAppointment(data) {
    return this.call('POST', '/appointments/', {
      locationId: process.env.GHL_LOCATION_ID,
      ...data,
    });
  }

  /**
   * Get available slots for a calendar
   */
  async getAvailableSlots(calendarId, startDate, endDate) {
    const params = new URLSearchParams({
      startDate,
      endDate,
    });
    return this.call('GET', `/calendars/${calendarId}/free-slots?${params}`);
  }

  // ==================== Workflows ====================

  /**
   * Add contact to a workflow
   */
  async addToWorkflow(contactId, workflowId) {
    return this.call('POST', `/contacts/${contactId}/workflow/${workflowId}`);
  }

  /**
   * Remove contact from a workflow
   */
  async removeFromWorkflow(contactId, workflowId) {
    return this.call('DELETE', `/contacts/${contactId}/workflow/${workflowId}`);
  }

  // ==================== Custom Fields ====================

  /**
   * Update custom field values
   */
  async updateCustomFields(contactId, customFields) {
    return this.call('PUT', `/contacts/${contactId}`, { customField: customFields });
  }

  // ==================== Webhook Handling ====================

  /**
   * Verify webhook signature
   * GHL uses HMAC-SHA256 for webhook verification
   */
  static verifyWebhookSignature(payload, signature, secret) {
    if (!secret) return false;

    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Map GHL webhook event to GEM tool
   */
  static mapWebhookToTool(event) {
    const mapping = {
      ContactCreate: 'leads.create',
      ContactUpdate: 'leads.update_stage',
      ContactDelete: 'leads.archive',
      ContactTagUpdate: 'leads.update_tags',
      AppointmentCreate: 'calendar.create_event',
      AppointmentUpdate: 'calendar.update_event',
      AppointmentDelete: 'calendar.cancel_event',
      OpportunityCreate: 'leads.create_opportunity',
      OpportunityStageUpdate: 'leads.update_stage',
      OpportunityStatusUpdate: 'leads.update_stage',
      InvoicePaid: 'invoice.record_payment',
      TaskCreate: 'os.create_task',
      TaskComplete: 'os.complete_task',
    };

    return mapping[event] || null;
  }

  /**
   * Map GHL payload to GEM tool input
   */
  static mapPayloadToInput(event, payload) {
    const mappers = {
      ContactCreate: (p) => ({
        name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        phone: p.phone,
        email: p.email,
        suburb: p.city || p.address1,
        source: 'ghl',
        leadconnector_contact_id: p.id,
        metadata: { ghl_payload: p },
      }),
      ContactUpdate: (p) => ({
        lead_id: p.id, // Will need lookup
        leadconnector_contact_id: p.id,
        stage: p.tags?.includes('won') ? 'won' : p.tags?.includes('lost') ? 'lost' : undefined,
        notes: `Updated via GHL: ${JSON.stringify(p)}`,
      }),
      AppointmentCreate: (p) => ({
        title: p.title,
        start_time: p.startTime,
        end_time: p.endTime,
        attendees: [p.contactId],
        location: p.address,
        metadata: { ghl_appointment_id: p.id },
      }),
    };

    const mapper = mappers[event];
    return mapper ? mapper(payload) : payload;
  }
}

// Register the integration
const ghlIntegration = new GoHighLevelIntegration();
IntegrationRegistry.register('gohighlevel', ghlIntegration);

export default ghlIntegration;
