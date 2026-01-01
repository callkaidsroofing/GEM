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
      next_steps: 'Media asset management tables not yet implemented'
    },
    effects: {}
  };
}

/**
 * media.register_asset - Register a media asset
 */
export async function register_asset(input) {
  return notConfigured('media.register_asset');
}

/**
 * media.tag_asset - Apply tags to an asset
 */
export async function tag_asset(input) {
  return notConfigured('media.tag_asset');
}

/**
 * media.generate_alt_text - Generate factual alt text for an image
 */
export async function generate_alt_text(input) {
  return notConfigured('media.generate_alt_text', 'requires_llm_provider');
}

/**
 * media.generate_caption - Generate a brand-aligned caption
 */
export async function generate_caption(input) {
  return notConfigured('media.generate_caption', 'requires_llm_provider');
}

/**
 * media.propose_rename_map - Propose a safe rename/sort map
 */
export async function propose_rename_map(input) {
  return notConfigured('media.propose_rename_map');
}

/**
 * media.export_website_pack - Export selected assets into a website-ready pack
 */
export async function export_website_pack(input) {
  return notConfigured('media.export_website_pack', 'requires_file_generation');
}
