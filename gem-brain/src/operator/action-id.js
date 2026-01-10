/**
 * CKR-GEM V21 Action ID Generator
 *
 * Implements the High Council V21 action ID standard.
 *
 * Format: YYYYMMDD-HHMM-TYPE-slug
 * - Exactly 4 hyphen-separated parts
 * - TYPE is uppercase (SMS, EMAIL, QUOTE, TASK, GIT, POST, CALL, LEAD, JOB)
 * - slug uses underscores only (no hyphens)
 *
 * Valid examples:
 *   20260111-1430-SMS-ack_missedcall
 *   20260111-0900-TASK-call_john_smith
 *   20260111-1200-LEAD-new_enquiry_dandenong
 *
 * Invalid examples:
 *   20260111-1430-sms-ack_missedcall (type not uppercase)
 *   20260111-1430-SMS-ack-missed-call (slug has hyphens)
 */

/**
 * Valid action types
 */
export const ACTION_TYPES = {
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  QUOTE: 'QUOTE',
  TASK: 'TASK',
  LEAD: 'LEAD',
  JOB: 'JOB',
  INSPECTION: 'INSPECTION',
  INVOICE: 'INVOICE',
  GIT: 'GIT',
  POST: 'POST',
  SYSTEM: 'SYSTEM',
  READ: 'READ',
  WRITE: 'WRITE'
};

/**
 * V21 action ID pattern
 */
export const V21_PATTERN = /^\d{8}-\d{4}-[A-Z]+-[a-z0-9_]+$/;

/**
 * Generate a V21-compliant action ID
 *
 * @param {string} actionType - The action type (SMS, EMAIL, TASK, etc.)
 * @param {string} slug - A descriptive slug (will be cleaned)
 * @param {Date} [timestamp] - Optional timestamp (defaults to now)
 * @returns {string} V21 action ID
 */
export function generateV21ActionId(actionType, slug, timestamp = null) {
  const now = timestamp || new Date();

  // Format date as YYYYMMDD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // Format time as HHMM
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}${minutes}`;

  // Normalize action type to uppercase
  const typeCaps = String(actionType).toUpperCase();

  // Clean slug: lowercase, replace non-alphanumeric with underscore, collapse multiple underscores
  let cleanSlug = String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30); // Limit length

  // Ensure slug is not empty
  if (!cleanSlug) {
    cleanSlug = 'action';
  }

  const actionId = `${dateStr}-${timeStr}-${typeCaps}-${cleanSlug}`;

  // Validate the generated ID
  if (!V21_PATTERN.test(actionId)) {
    throw new Error(`Generated action ID '${actionId}' does not match V21 format`);
  }

  return actionId;
}

/**
 * Validate a V21 action ID
 *
 * @param {string} actionId - The action ID to validate
 * @returns {object} { valid: boolean, parts?: object, error?: string }
 */
export function validateV21ActionId(actionId) {
  if (!actionId || typeof actionId !== 'string') {
    return { valid: false, error: 'Action ID must be a non-empty string' };
  }

  if (!V21_PATTERN.test(actionId)) {
    return { valid: false, error: 'Action ID does not match V21 pattern (YYYYMMDD-HHMM-TYPE-slug)' };
  }

  const parts = actionId.split('-');
  if (parts.length !== 4) {
    return { valid: false, error: 'Action ID must have exactly 4 hyphen-separated parts' };
  }

  const [date, time, type, slug] = parts;

  // Validate date
  const dateValid = /^\d{8}$/.test(date);
  if (!dateValid) {
    return { valid: false, error: 'Date part must be 8 digits (YYYYMMDD)' };
  }

  // Validate time
  const timeValid = /^\d{4}$/.test(time);
  if (!timeValid) {
    return { valid: false, error: 'Time part must be 4 digits (HHMM)' };
  }

  // Validate type is uppercase
  if (type !== type.toUpperCase()) {
    return { valid: false, error: 'Type must be uppercase' };
  }

  // Validate slug has no hyphens and is lowercase
  if (slug !== slug.toLowerCase() || slug.includes('-')) {
    return { valid: false, error: 'Slug must be lowercase with underscores only (no hyphens)' };
  }

  return {
    valid: true,
    parts: {
      date,
      time,
      type,
      slug,
      timestamp: parseActionIdTimestamp(actionId)
    }
  };
}

/**
 * Parse timestamp from V21 action ID
 *
 * @param {string} actionId - V21 action ID
 * @returns {Date|null} Parsed date or null if invalid
 */
export function parseActionIdTimestamp(actionId) {
  const validation = validateV21ActionId(actionId);
  if (!validation.valid) return null;

  const [date, time] = actionId.split('-');

  const year = parseInt(date.slice(0, 4), 10);
  const month = parseInt(date.slice(4, 6), 10) - 1;
  const day = parseInt(date.slice(6, 8), 10);
  const hours = parseInt(time.slice(0, 2), 10);
  const minutes = parseInt(time.slice(2, 4), 10);

  return new Date(year, month, day, hours, minutes);
}

/**
 * Infer action type from tool name
 *
 * @param {string} toolName - Tool name (e.g., 'comms.send_sms', 'leads.create')
 * @returns {string} Action type
 */
export function inferActionType(toolName) {
  if (!toolName) return ACTION_TYPES.SYSTEM;

  const lower = toolName.toLowerCase();

  if (lower.includes('sms') || lower.includes('send_sms')) return ACTION_TYPES.SMS;
  if (lower.includes('email') || lower.includes('send_email')) return ACTION_TYPES.EMAIL;
  if (lower.includes('call')) return ACTION_TYPES.CALL;
  if (lower.includes('quote')) return ACTION_TYPES.QUOTE;
  if (lower.includes('task')) return ACTION_TYPES.TASK;
  if (lower.includes('lead')) return ACTION_TYPES.LEAD;
  if (lower.includes('job')) return ACTION_TYPES.JOB;
  if (lower.includes('inspection')) return ACTION_TYPES.INSPECTION;
  if (lower.includes('invoice')) return ACTION_TYPES.INVOICE;

  // Domain-based inference
  const domain = toolName.split('.')[0];
  switch (domain) {
    case 'comms': return ACTION_TYPES.SMS;
    case 'leads': return ACTION_TYPES.LEAD;
    case 'quote': return ACTION_TYPES.QUOTE;
    case 'job': return ACTION_TYPES.JOB;
    case 'inspection': return ACTION_TYPES.INSPECTION;
    case 'invoice': return ACTION_TYPES.INVOICE;
    case 'os': return ACTION_TYPES.TASK;
    default: return ACTION_TYPES.SYSTEM;
  }
}

/**
 * Generate slug from message or context
 *
 * @param {string} message - User message or context
 * @returns {string} Cleaned slug
 */
export function generateSlugFromMessage(message) {
  if (!message) return 'action';

  // Extract key words
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'how', 'when', 'where', 'who', 'create', 'make', 'add', 'new'].includes(w))
    .slice(0, 3);

  if (words.length === 0) return 'action';

  return words.join('_').slice(0, 30);
}
