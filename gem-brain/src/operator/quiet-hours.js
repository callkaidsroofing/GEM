/**
 * CKR-GEM Quiet Hours Manager
 *
 * Implements time-based automation control for external communications.
 * During quiet hours, external communications (SMS, email, calls) are
 * queued rather than sent immediately.
 *
 * Features:
 * - Configurable quiet hours window
 * - Timezone support (Australia/Melbourne default)
 * - Emergency override mechanism
 * - Queue management for delayed sends
 */

/**
 * Default quiet hours configuration
 */
const DEFAULT_CONFIG = {
  start: '22:00',       // 10 PM
  end: '07:00',         // 7 AM
  timezone: 'Australia/Melbourne',
  enabled: true,
  emergencyOverrideRequired: true
};

/**
 * External communication tool names that should respect quiet hours
 */
const EXTERNAL_COMM_TOOLS = [
  'comms.send_sms',
  'comms.send_email',
  'comms.make_call',
  'sms.send',
  'email.send',
  'email.send_quote',
  'email.send_invoice'
];

/**
 * Emergency override reasons (valid for quiet hours override)
 */
const VALID_OVERRIDE_REASONS = [
  'active_leak',
  'safety_hazard',
  'property_damage',
  'emergency_repair',
  'customer_emergency'
];

/**
 * Quiet Hours Manager
 */
export class QuietHoursManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Load from environment if available
    if (process.env.GEM_QUIET_HOURS_START) {
      this.config.start = process.env.GEM_QUIET_HOURS_START;
    }
    if (process.env.GEM_QUIET_HOURS_END) {
      this.config.end = process.env.GEM_QUIET_HOURS_END;
    }
    if (process.env.GEM_TIMEZONE) {
      this.config.timezone = process.env.GEM_TIMEZONE;
    }
    if (process.env.GEM_QUIET_HOURS_ENABLED !== undefined) {
      this.config.enabled = process.env.GEM_QUIET_HOURS_ENABLED === 'true';
    }

    // Queue for delayed messages
    this.queue = [];
  }

  /**
   * Check if current time is within quiet hours
   *
   * @param {Date} [now] - Optional timestamp to check (defaults to current time)
   * @returns {boolean} True if within quiet hours
   */
  isQuietHours(now = null) {
    if (!this.config.enabled) {
      return false;
    }

    const timestamp = now || new Date();

    // Get current time in configured timezone
    const localTime = this._getLocalTime(timestamp);

    const [startHour, startMin] = this.config.start.split(':').map(Number);
    const [endHour, endMin] = this.config.end.split(':').map(Number);

    const currentMinutes = localTime.hours * 60 + localTime.minutes;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 - 07:00)
    if (startMinutes > endMinutes) {
      // Quiet hours span midnight
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      // Quiet hours within same day
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  /**
   * Check if a tool should be blocked during quiet hours
   *
   * @param {string} toolName - The tool name to check
   * @returns {boolean} True if tool is external comm and should be blocked
   */
  isExternalCommTool(toolName) {
    return EXTERNAL_COMM_TOOLS.some(t =>
      toolName.toLowerCase().includes(t.toLowerCase()) ||
      t.toLowerCase().includes(toolName.toLowerCase())
    );
  }

  /**
   * Check if operation should proceed or be queued
   *
   * @param {string} toolName - The tool name
   * @param {object} options - Options including override
   * @returns {object} { proceed: boolean, reason: string, queueUntil?: Date }
   */
  shouldProceed(toolName, options = {}) {
    // If quiet hours disabled, always proceed
    if (!this.config.enabled) {
      return { proceed: true, reason: 'quiet_hours_disabled' };
    }

    // If not an external comm tool, always proceed
    if (!this.isExternalCommTool(toolName)) {
      return { proceed: true, reason: 'not_external_comm' };
    }

    // If not quiet hours, proceed
    if (!this.isQuietHours()) {
      return { proceed: true, reason: 'not_quiet_hours' };
    }

    // Check for emergency override
    if (options.override && this.canOverride(options.overrideReason)) {
      return {
        proceed: true,
        reason: 'emergency_override',
        overrideReason: options.overrideReason
      };
    }

    // Block and queue
    const queueUntil = this.getNextActiveTime();
    return {
      proceed: false,
      reason: 'quiet_hours_active',
      message: `External communications blocked during quiet hours (${this.config.start} - ${this.config.end} ${this.config.timezone})`,
      queueUntil,
      queueUntilFormatted: this._formatTime(queueUntil)
    };
  }

  /**
   * Check if override reason is valid for emergency
   *
   * @param {string} reason - The override reason
   * @returns {boolean} True if valid emergency override
   */
  canOverride(reason) {
    if (!this.config.emergencyOverrideRequired) {
      return true;
    }

    if (!reason) {
      return false;
    }

    const lowerReason = reason.toLowerCase();
    return VALID_OVERRIDE_REASONS.some(valid =>
      lowerReason.includes(valid.replace(/_/g, ' ')) ||
      lowerReason.includes(valid)
    );
  }

  /**
   * Get the next time quiet hours end
   *
   * @returns {Date} Next active time
   */
  getNextActiveTime() {
    const now = new Date();
    const [endHour, endMin] = this.config.end.split(':').map(Number);

    const nextActive = new Date(now);
    nextActive.setHours(endHour, endMin, 0, 0);

    // If we're past end time today, it's tomorrow's end time
    if (nextActive <= now) {
      nextActive.setDate(nextActive.getDate() + 1);
    }

    return nextActive;
  }

  /**
   * Queue an action for later execution
   *
   * @param {object} action - The action to queue
   * @returns {object} Queued action with ID and scheduled time
   */
  queueAction(action) {
    const queuedAt = new Date();
    const scheduledFor = this.getNextActiveTime();
    const queueId = `Q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const queuedAction = {
      id: queueId,
      action,
      queuedAt,
      scheduledFor,
      status: 'pending'
    };

    this.queue.push(queuedAction);
    return queuedAction;
  }

  /**
   * Get all queued actions
   */
  getQueue() {
    return this.queue.filter(a => a.status === 'pending');
  }

  /**
   * Get queued actions ready for execution
   */
  getReadyActions() {
    const now = new Date();
    return this.queue.filter(a =>
      a.status === 'pending' && a.scheduledFor <= now
    );
  }

  /**
   * Mark action as executed
   */
  markExecuted(queueId) {
    const action = this.queue.find(a => a.id === queueId);
    if (action) {
      action.status = 'executed';
      action.executedAt = new Date();
    }
  }

  /**
   * Get current quiet hours status
   */
  getStatus() {
    const isQuiet = this.isQuietHours();
    const localTime = this._getLocalTime(new Date());

    return {
      enabled: this.config.enabled,
      isQuietHours: isQuiet,
      currentTime: `${String(localTime.hours).padStart(2, '0')}:${String(localTime.minutes).padStart(2, '0')}`,
      timezone: this.config.timezone,
      window: `${this.config.start} - ${this.config.end}`,
      nextActiveTime: isQuiet ? this._formatTime(this.getNextActiveTime()) : 'now',
      queuedActions: this.getQueue().length
    };
  }

  /**
   * Update quiet hours configuration
   */
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
  }

  // Private methods

  _getLocalTime(date) {
    // Simple timezone offset calculation for Australia/Melbourne
    // Note: In production, use a proper timezone library
    const options = {
      timeZone: this.config.timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    };

    try {
      const formatted = date.toLocaleString('en-AU', options);
      const [hours, minutes] = formatted.split(':').map(Number);
      return { hours, minutes };
    } catch (error) {
      // Fallback to UTC+11 (AEDT)
      const utcHours = date.getUTCHours();
      const utcMinutes = date.getUTCMinutes();
      const localHours = (utcHours + 11) % 24;
      return { hours: localHours, minutes: utcMinutes };
    }
  }

  _formatTime(date) {
    const options = {
      timeZone: this.config.timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };

    try {
      return date.toLocaleString('en-AU', options);
    } catch (error) {
      return date.toISOString();
    }
  }
}

/**
 * Shared quiet hours instance
 */
let sharedQuietHours = null;

export function getSharedQuietHours(config = {}) {
  if (!sharedQuietHours) {
    sharedQuietHours = new QuietHoursManager(config);
  }
  return sharedQuietHours;
}

export function resetSharedQuietHours() {
  sharedQuietHours = null;
}
