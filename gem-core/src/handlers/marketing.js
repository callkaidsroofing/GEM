import { notConfigured } from '../lib/responses.js';

/**
 * Marketing handlers
 * These handlers return 'not_configured' status as they require
 * AI composition services and marketing platform integrations.
 */

/**
 * marketing.generate_meta_ad_pack - Generate a Meta ad pack draft (copy only)
 */
export async function generate_meta_ad_pack(input) {
  return notConfigured('marketing.generate_meta_ad_pack', {
    reason: 'AI composition service not configured',
    required_env: [],
    next_steps: ['Integrate AI composition service', 'Define Meta ad templates']
  });
}

/**
 * marketing.generate_google_ads_pack - Generate a Google Ads pack draft
 */
export async function generate_google_ads_pack(input) {
  return notConfigured('marketing.generate_google_ads_pack', {
    reason: 'AI composition service not configured',
    required_env: [],
    next_steps: ['Integrate AI composition service', 'Define Google Ads templates']
  });
}

/**
 * marketing.generate_case_study_from_job - Generate a case study draft from a completed job
 */
export async function generate_case_study_from_job(input) {
  return notConfigured('marketing.generate_case_study_from_job', {
    reason: 'AI composition service not configured',
    required_env: [],
    next_steps: ['Integrate AI composition service', 'Define case study templates']
  });
}

/**
 * marketing.generate_gmb_post - Generate a Google Business Profile post draft
 */
export async function generate_gmb_post(input) {
  return notConfigured('marketing.generate_gmb_post', {
    reason: 'AI composition service not configured',
    required_env: [],
    next_steps: ['Integrate AI composition service', 'Define GMB post templates']
  });
}

/**
 * marketing.schedule_content - Schedule content as tasks/events
 */
export async function schedule_content(input) {
  return notConfigured('marketing.schedule_content', {
    reason: 'Content scheduling system not configured',
    required_env: [],
    next_steps: ['Create content_schedule table', 'Integrate with calendar']
  });
}

/**
 * marketing.log_campaign_result - Log campaign results manually
 */
export async function log_campaign_result(input) {
  return notConfigured('marketing.log_campaign_result', {
    reason: 'Campaign tracking table not configured',
    required_env: [],
    next_steps: ['Create campaign_results table', 'Define metrics schema']
  });
}
