import { notConfigured } from '../lib/responses.js';

/**
 * Calendar handlers
 * These handlers return 'not_configured' status as they require
 * Google Calendar API integration.
 */

/**
 * calendar.find_slots - Find available time slots within a date range
 */
export async function find_slots(input) {
  return notConfigured('calendar.find_slots', {
    reason: 'Google Calendar API not configured',
    required_env: ['GOOGLE_CALENDAR_CREDENTIALS', 'GOOGLE_CALENDAR_ID'],
    next_steps: ['Set up Google Cloud project', 'Configure Calendar API credentials']
  });
}

/**
 * calendar.create_event - Create a calendar event
 */
export async function create_event(input) {
  return notConfigured('calendar.create_event', {
    reason: 'Google Calendar API not configured',
    required_env: ['GOOGLE_CALENDAR_CREDENTIALS', 'GOOGLE_CALENDAR_ID'],
    next_steps: ['Set up Google Cloud project', 'Configure Calendar API credentials']
  });
}

/**
 * calendar.update_event - Update a calendar event
 */
export async function update_event(input) {
  return notConfigured('calendar.update_event', {
    reason: 'Google Calendar API not configured',
    required_env: ['GOOGLE_CALENDAR_CREDENTIALS', 'GOOGLE_CALENDAR_ID'],
    next_steps: ['Set up Google Cloud project', 'Configure Calendar API credentials']
  });
}

/**
 * calendar.cancel_event - Cancel a calendar event
 */
export async function cancel_event(input) {
  return notConfigured('calendar.cancel_event', {
    reason: 'Google Calendar API not configured',
    required_env: ['GOOGLE_CALENDAR_CREDENTIALS', 'GOOGLE_CALENDAR_ID'],
    next_steps: ['Set up Google Cloud project', 'Configure Calendar API credentials']
  });
}

/**
 * calendar.attach_job_to_event - Attach a job/lead reference to an existing calendar event
 */
export async function attach_job_to_event(input) {
  return notConfigured('calendar.attach_job_to_event', {
    reason: 'Google Calendar API not configured',
    required_env: ['GOOGLE_CALENDAR_CREDENTIALS', 'GOOGLE_CALENDAR_ID'],
    next_steps: ['Set up Google Cloud project', 'Configure Calendar API credentials']
  });
}
