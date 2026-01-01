import { supabase } from '../lib/supabase.js';

/**
 * Helper for not_configured responses
 */
function notConfigured(toolName, reason = 'provider_not_configured') {
  return {
    result: {
      status: 'not_configured',
      reason,
      required_env: ['GOOGLE_CALENDAR_CREDENTIALS'],
      message: `Handler for ${toolName} requires additional configuration`,
      next_steps: 'Configure Google Calendar API integration'
    },
    effects: {}
  };
}

/**
 * calendar.find_slots - Find available time slots
 */
export async function find_slots(input) {
  return notConfigured('calendar.find_slots');
}

/**
 * calendar.create_event - Create a calendar event
 */
export async function create_event(input) {
  return notConfigured('calendar.create_event');
}

/**
 * calendar.update_event - Update a calendar event
 */
export async function update_event(input) {
  return notConfigured('calendar.update_event');
}

/**
 * calendar.cancel_event - Cancel a calendar event
 */
export async function cancel_event(input) {
  return notConfigured('calendar.cancel_event');
}

/**
 * calendar.attach_job_to_event - Attach a job/lead reference to an event
 */
export async function attach_job_to_event(input) {
  return notConfigured('calendar.attach_job_to_event');
}
