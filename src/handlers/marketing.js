import { supabase } from '../lib/supabase.js';

/**
 * Helper for not_configured responses
 */
function notConfigured(toolName, reason = 'feature_pending') {
  return {
    result: {
      status: 'not_configured',
      reason,
      message: `Handler for ${toolName} requires additional configuration`,
      next_steps: 'Marketing content generation requires LLM provider'
    },
    effects: {}
  };
}

/**
 * marketing.generate_meta_ad_pack - Generate a Meta ad pack draft
 */
export async function generate_meta_ad_pack(input) {
  return notConfigured('marketing.generate_meta_ad_pack', 'requires_llm_provider');
}

/**
 * marketing.generate_google_ads_pack - Generate a Google Ads pack draft
 */
export async function generate_google_ads_pack(input) {
  return notConfigured('marketing.generate_google_ads_pack', 'requires_llm_provider');
}

/**
 * marketing.generate_case_study_from_job - Generate a case study draft
 */
export async function generate_case_study_from_job(input) {
  return notConfigured('marketing.generate_case_study_from_job', 'requires_llm_provider');
}

/**
 * marketing.generate_gmb_post - Generate a Google Business Profile post draft
 */
export async function generate_gmb_post(input) {
  return notConfigured('marketing.generate_gmb_post', 'requires_llm_provider');
}

/**
 * marketing.schedule_content - Schedule content as tasks/events
 * Real DB-backed implementation
 */
export async function schedule_content(input) {
  const { items } = input;
  const created_task_ids = [];

  for (const item of items || []) {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: item.title || 'Scheduled content',
        domain: 'business',
        status: 'open',
        due_at: item.scheduled_at,
        context_ref: { type: 'marketing', content: item }
      })
      .select('id')
      .single();

    if (!error && data) {
      created_task_ids.push(data.id);
    }
  }

  return {
    result: { created_task_ids },
    effects: {
      db_writes: created_task_ids.map(id => ({ table: 'tasks', action: 'insert', id }))
    }
  };
}

/**
 * marketing.log_campaign_result - Log campaign results manually
 * Real DB-backed implementation
 */
export async function log_campaign_result(input) {
  const { channel, metrics, notes } = input;

  const { data, error } = await supabase
    .from('notes')
    .insert({
      domain: 'business',
      title: `Campaign Result: ${channel}`,
      content: notes || JSON.stringify(metrics),
      entity_refs: [{ type: 'campaign', channel, metrics }]
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to log campaign result: ${error.message}`);
  }

  return {
    result: { log_id: data.id },
    effects: {
      db_writes: [{ table: 'notes', action: 'insert', id: data.id }]
    }
  };
}
