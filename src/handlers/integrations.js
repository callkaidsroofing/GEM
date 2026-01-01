import { supabase } from '../lib/supabase.js';

/**
 * Helper for not_configured responses
 */
function notConfigured(toolName, reason = 'provider_not_configured', requiredEnv = []) {
  return {
    result: {
      status: 'not_configured',
      reason,
      required_env: requiredEnv,
      message: `Handler for ${toolName} requires additional configuration`
    },
    effects: {}
  };
}

// ============================================
// Google Drive
// ============================================

/**
 * integrations.google_drive.search - Search Google Drive
 */
export async function google_drive_search(input) {
  return notConfigured('integrations.google_drive.search', 'provider_not_configured', ['GOOGLE_DRIVE_CREDENTIALS']);
}

// Alias for dot notation compatibility
export { google_drive_search as google_drive };

// ============================================
// Google Photos
// ============================================

/**
 * integrations.google_photos.import_links - Register Google Photos album links
 */
export async function google_photos_import_links(input) {
  return notConfigured('integrations.google_photos.import_links', 'provider_not_configured', ['GOOGLE_PHOTOS_CREDENTIALS']);
}

// Alias
export { google_photos_import_links as google_photos };

// ============================================
// Analytics
// ============================================

/**
 * integrations.analytics.pull_summary - Pull analytics summary
 */
export async function analytics_pull_summary(input) {
  return notConfigured('integrations.analytics.pull_summary', 'provider_not_configured', ['GA4_CREDENTIALS']);
}

// Alias
export { analytics_pull_summary as analytics };

// ============================================
// Ads
// ============================================

/**
 * integrations.ads.pull_summary - Pull ads performance summary
 */
export async function ads_pull_summary(input) {
  return notConfigured('integrations.ads.pull_summary', 'provider_not_configured', ['GOOGLE_ADS_CREDENTIALS', 'META_ADS_CREDENTIALS']);
}

// Alias
export { ads_pull_summary as ads };

// ============================================
// SMS Provider
// ============================================

/**
 * integrations.sms_provider.health - Check SMS provider connectivity
 */
export async function sms_provider_health(input) {
  return notConfigured('integrations.sms_provider.health', 'provider_not_configured', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
}

// Alias
export { sms_provider_health as sms_provider };

// ============================================
// Email Provider
// ============================================

/**
 * integrations.email_provider.health - Check email provider connectivity
 */
export async function email_provider_health(input) {
  return notConfigured('integrations.email_provider.health', 'provider_not_configured', ['SENDGRID_API_KEY']);
}

// Alias
export { email_provider_health as email_provider };
