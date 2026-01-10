/**
 * CKR-GEM Notification Classification Pipeline
 *
 * Classifies incoming notifications and determines appropriate actions.
 * Designed for Termux environment with Termux:API integration.
 *
 * Features:
 * - Notification classification by source and content
 * - Priority assignment based on keywords and patterns
 * - Action suggestion based on classification
 * - Integration with quiet hours system
 * - Termux-safe (no external dependencies)
 */

/**
 * Notification sources and their default priorities
 */
export const NOTIFICATION_SOURCES = {
  // High priority sources
  'com.google.android.dialer': { type: 'call', priority: 'high', label: 'Phone Call' },
  'com.samsung.android.incallui': { type: 'call', priority: 'high', label: 'Phone Call' },
  'com.google.android.apps.messaging': { type: 'sms', priority: 'high', label: 'SMS Message' },
  'com.samsung.android.messaging': { type: 'sms', priority: 'high', label: 'SMS Message' },

  // Medium priority sources
  'com.google.android.gm': { type: 'email', priority: 'medium', label: 'Gmail' },
  'com.microsoft.office.outlook': { type: 'email', priority: 'medium', label: 'Outlook' },
  'com.whatsapp': { type: 'chat', priority: 'medium', label: 'WhatsApp' },
  'com.facebook.orca': { type: 'chat', priority: 'medium', label: 'Messenger' },

  // Low priority sources
  'com.google.android.calendar': { type: 'calendar', priority: 'low', label: 'Calendar' },
  'com.google.android.apps.tasks': { type: 'reminder', priority: 'low', label: 'Tasks' },

  // System sources (usually ignored)
  'com.android.systemui': { type: 'system', priority: 'ignore', label: 'System UI' },
  'com.google.android.gms': { type: 'system', priority: 'ignore', label: 'Google Services' }
};

/**
 * Keywords that elevate notification priority
 */
export const PRIORITY_KEYWORDS = {
  urgent: ['urgent', 'emergency', 'asap', 'critical', 'important'],
  leak: ['leak', 'leaking', 'water', 'flooding', 'burst'],
  booking: ['book', 'booking', 'appointment', 'schedule', 'confirm'],
  quote: ['quote', 'estimate', 'price', 'cost'],
  callback: ['call back', 'callback', 'return call', 'ring back'],
  payment: ['payment', 'invoice', 'pay', 'paid', 'deposit']
};

/**
 * Notification classification result
 */
export class NotificationClassification {
  constructor(data) {
    this.source = data.source;
    this.type = data.type;
    this.priority = data.priority;
    this.label = data.label;
    this.keywords = data.keywords || [];
    this.suggestedAction = data.suggestedAction;
    this.context = data.context || {};
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      source: this.source,
      type: this.type,
      priority: this.priority,
      label: this.label,
      keywords: this.keywords,
      suggestedAction: this.suggestedAction,
      timestamp: this.timestamp
    };
  }
}

/**
 * Notification Classifier
 */
export class NotificationClassifier {
  constructor(config = {}) {
    this.config = config;
    this.sources = { ...NOTIFICATION_SOURCES, ...config.customSources };
    this.priorityKeywords = { ...PRIORITY_KEYWORDS, ...config.customKeywords };
    this.history = [];
    this.maxHistory = config.maxHistory || 100;
  }

  /**
   * Classify a notification
   *
   * @param {object} notification - Raw notification data
   * @param {string} notification.package - Source package name
   * @param {string} notification.title - Notification title
   * @param {string} notification.text - Notification text
   * @param {number} notification.timestamp - Unix timestamp
   * @returns {NotificationClassification}
   */
  classify(notification) {
    const { package: pkg, title = '', text = '', timestamp } = notification;

    // Get source info
    const sourceInfo = this.sources[pkg] || {
      type: 'unknown',
      priority: 'low',
      label: this._extractAppName(pkg)
    };

    // Extract keywords from content
    const content = `${title} ${text}`.toLowerCase();
    const foundKeywords = this._findKeywords(content);

    // Determine final priority
    const priority = this._calculatePriority(sourceInfo.priority, foundKeywords);

    // Generate suggested action
    const suggestedAction = this._suggestAction(sourceInfo.type, foundKeywords, priority);

    // Extract context (phone numbers, names, etc.)
    const context = this._extractContext(title, text);

    const classification = new NotificationClassification({
      source: pkg,
      type: sourceInfo.type,
      priority,
      label: sourceInfo.label,
      keywords: foundKeywords,
      suggestedAction,
      context
    });

    // Add to history
    this._addToHistory(classification, notification);

    return classification;
  }

  /**
   * Batch classify multiple notifications
   */
  classifyBatch(notifications) {
    return notifications.map(n => this.classify(n));
  }

  /**
   * Get high priority notifications from recent history
   */
  getHighPriority(limit = 10) {
    return this.history
      .filter(h => h.classification.priority === 'high' || h.classification.priority === 'urgent')
      .slice(-limit);
  }

  /**
   * Get notifications requiring action
   */
  getActionRequired() {
    return this.history
      .filter(h => h.classification.suggestedAction && h.classification.suggestedAction.type !== 'none')
      .slice(-20);
  }

  /**
   * Get notifications by type
   */
  getByType(type, limit = 20) {
    return this.history
      .filter(h => h.classification.type === type)
      .slice(-limit);
  }

  /**
   * Check if notification should bypass quiet hours
   */
  shouldBypassQuietHours(classification) {
    // Urgent priority always bypasses
    if (classification.priority === 'urgent') {
      return { bypass: true, reason: 'urgent_priority' };
    }

    // Leak-related keywords bypass
    if (classification.keywords.some(k => this.priorityKeywords.leak.includes(k))) {
      return { bypass: true, reason: 'leak_emergency' };
    }

    // Missed calls from recent leads might bypass
    if (classification.type === 'call' && classification.context.phone) {
      return { bypass: false, reason: 'call_during_quiet_hours', queueForCallback: true };
    }

    return { bypass: false, reason: 'quiet_hours_active' };
  }

  /**
   * Generate Termux notification response
   */
  generateTermuxResponse(classification) {
    const { priority, type, suggestedAction, label } = classification;

    // Build vibration pattern based on priority
    let vibrationPattern;
    switch (priority) {
      case 'urgent':
        vibrationPattern = '200,100,200,100,200';
        break;
      case 'high':
        vibrationPattern = '200,100,200';
        break;
      case 'medium':
        vibrationPattern = '200';
        break;
      default:
        vibrationPattern = null;
    }

    // Build LED color based on type
    let ledColor;
    switch (type) {
      case 'call':
        ledColor = 'green';
        break;
      case 'sms':
        ledColor = 'blue';
        break;
      case 'email':
        ledColor = 'yellow';
        break;
      default:
        ledColor = 'white';
    }

    return {
      title: `[${priority.toUpperCase()}] ${label}`,
      content: suggestedAction?.description || 'New notification',
      vibrate: vibrationPattern,
      led_color: ledColor,
      priority: priority === 'urgent' ? 'max' : priority === 'high' ? 'high' : 'default',
      action: suggestedAction?.type
    };
  }

  // Private methods

  _findKeywords(content) {
    const found = [];

    for (const [category, keywords] of Object.entries(this.priorityKeywords)) {
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          found.push(keyword);
        }
      }
    }

    return [...new Set(found)];
  }

  _calculatePriority(basePriority, keywords) {
    // Check for urgent keywords
    const hasUrgent = keywords.some(k => this.priorityKeywords.urgent.includes(k));
    if (hasUrgent) return 'urgent';

    // Check for leak/emergency keywords
    const hasLeak = keywords.some(k => this.priorityKeywords.leak.includes(k));
    if (hasLeak) return 'urgent';

    // Elevate by one level if business keywords found
    const hasBusinessKeyword = keywords.some(k =>
      this.priorityKeywords.booking.includes(k) ||
      this.priorityKeywords.quote.includes(k) ||
      this.priorityKeywords.callback.includes(k)
    );

    if (hasBusinessKeyword) {
      if (basePriority === 'low') return 'medium';
      if (basePriority === 'medium') return 'high';
    }

    return basePriority;
  }

  _suggestAction(type, keywords, priority) {
    // Urgent leak = immediate callback
    if (keywords.some(k => this.priorityKeywords.leak.includes(k))) {
      return {
        type: 'callback_urgent',
        description: 'Urgent: Potential leak - call back immediately',
        tool: 'comms.make_call',
        priority: 'urgent'
      };
    }

    // Callback request
    if (keywords.some(k => this.priorityKeywords.callback.includes(k))) {
      return {
        type: 'callback',
        description: 'Customer requested callback',
        tool: 'os.create_task',
        priority: 'high'
      };
    }

    // Quote request
    if (keywords.some(k => this.priorityKeywords.quote.includes(k))) {
      return {
        type: 'quote_request',
        description: 'Quote or pricing enquiry',
        tool: 'leads.create',
        priority: 'high'
      };
    }

    // Booking request
    if (keywords.some(k => this.priorityKeywords.booking.includes(k))) {
      return {
        type: 'booking_request',
        description: 'Booking or appointment request',
        tool: 'os.create_task',
        priority: 'medium'
      };
    }

    // Default actions by type
    const defaultActions = {
      call: { type: 'missed_call', description: 'Missed call - consider callback', tool: 'os.create_task' },
      sms: { type: 'sms_reply', description: 'SMS received - may need reply', tool: 'comms.send_sms' },
      email: { type: 'email_review', description: 'Email received - review needed', tool: null },
      chat: { type: 'chat_reply', description: 'Chat message - may need reply', tool: null }
    };

    return defaultActions[type] || { type: 'none', description: 'No action required', tool: null };
  }

  _extractContext(title, text) {
    const context = {};
    const combined = `${title} ${text}`;

    // Extract phone numbers
    const phoneMatch = combined.match(/0\d{9}|\+61\d{9}/);
    if (phoneMatch) {
      context.phone = phoneMatch[0];
    }

    // Extract potential names (capitalized words)
    const nameMatch = combined.match(/(?:from|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) {
      context.name = nameMatch[1];
    }

    // Extract time mentions
    const timeMatch = combined.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      context.time_mentioned = timeMatch[0];
    }

    // Extract suburb mentions (common SE Melbourne)
    const suburbs = ['clyde', 'cranbourne', 'berwick', 'dandenong', 'pakenham', 'officer'];
    for (const suburb of suburbs) {
      if (combined.toLowerCase().includes(suburb)) {
        context.suburb = suburb.charAt(0).toUpperCase() + suburb.slice(1);
        break;
      }
    }

    return context;
  }

  _extractAppName(packageName) {
    if (!packageName) return 'Unknown';

    // Extract app name from package
    const parts = packageName.split('.');
    const lastPart = parts[parts.length - 1];
    return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
  }

  _addToHistory(classification, raw) {
    this.history.push({
      classification,
      raw: {
        title: raw.title,
        text: raw.text?.slice(0, 200),
        timestamp: raw.timestamp
      },
      processedAt: new Date().toISOString()
    });

    // Trim history
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }
}

/**
 * Shared classifier instance
 */
let sharedClassifier = null;

export function getSharedClassifier(config = {}) {
  if (!sharedClassifier) {
    sharedClassifier = new NotificationClassifier(config);
  }
  return sharedClassifier;
}

export function resetSharedClassifier() {
  sharedClassifier = null;
}
