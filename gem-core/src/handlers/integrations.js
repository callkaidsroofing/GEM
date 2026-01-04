import { notConfigured } from '../lib/responses.js';

/**
 * Integrations handlers
 * These handlers return 'not_configured' status as they require
 * external service integrations (Google, analytics, ads, etc.)
 *
 * Note: Tool names follow pattern integrations.<provider>.<action>
 * These are mapped to function names using underscore: google_drive_search
 */

/**
 * integrations.google_drive.search - Search Google Drive for files
 */
export async function google_drive_search(input) {
  return notConfigured('integrations.google_drive.search', {
    reason: 'Google Drive API not configured',
    required_env: ['GOOGLE_DRIVE_CREDENTIALS'],
    next_steps: ['Set up Google Cloud project', 'Configure Drive API credentials']
  });
}

/**
 * integrations.google_photos.import_links - Register Google Photos album links
 */
export async function google_photos_import_links(input) {
  return notConfigured('integrations.google_photos.import_links', {
    reason: 'Google Photos integration not configured',
    required_env: [],
    next_steps: ['Create photo_sources table', 'Implement link registration']
  });
}

/**
 * integrations.analytics.pull_summary - Pull analytics summary
 */
export async function analytics_pull_summary(input) {
  return notConfigured('integrations.analytics.pull_summary', {
    reason: 'Google Analytics API not configured',
    required_env: ['GA4_CREDENTIALS', 'GA4_PROPERTY_ID'],
    next_steps: ['Set up Google Cloud project', 'Configure Analytics API credentials']
  });
}

/**
 * integrations.ads.pull_summary - Pull ads performance summary
 */
export async function ads_pull_summary(input) {
  return notConfigured('integrations.ads.pull_summary', {
    reason: 'Ads API not configured',
    required_env: ['GOOGLE_ADS_CREDENTIALS', 'META_ADS_TOKEN'],
    next_steps: ['Configure Google Ads API', 'Configure Meta Ads API']
  });
}

/**
 * integrations.sms_provider.health - Check SMS provider connectivity
 */
export async function sms_provider_health(input) {
  return notConfigured('integrations.sms_provider.health', {
    reason: 'SMS provider not configured',
    required_env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    next_steps: ['Configure Twilio credentials']
  });
}

/**
 * integrations.email_provider.health - Check email provider connectivity
 */
export async function email_provider_health(input) {
  return notConfigured('integrations.email_provider.health', {
    reason: 'Email provider not configured',
    required_env: ['SENDGRID_API_KEY'],
    next_steps: ['Configure SendGrid credentials']
  });
}
