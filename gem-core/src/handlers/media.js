import { notConfigured } from '../lib/responses.js';

/**
 * Media handlers
 * These handlers return 'not_configured' status as they require
 * file storage integration and media processing capabilities.
 */

/**
 * media.register_asset - Register a media asset with storage reference
 */
export async function register_asset(input) {
  return notConfigured('media.register_asset', {
    reason: 'Media storage system not configured',
    required_env: [],
    next_steps: ['Create media_assets table', 'Configure Supabase Storage or external storage']
  });
}

/**
 * media.tag_asset - Apply tags to an asset
 */
export async function tag_asset(input) {
  return notConfigured('media.tag_asset', {
    reason: 'Media storage system not configured',
    required_env: [],
    next_steps: ['Create media_assets table', 'Implement tagging system']
  });
}

/**
 * media.generate_alt_text - Generate factual alt text for an image asset
 */
export async function generate_alt_text(input) {
  return notConfigured('media.generate_alt_text', {
    reason: 'AI vision service not configured',
    required_env: [],
    next_steps: ['Integrate AI vision API', 'Implement alt text generation']
  });
}

/**
 * media.generate_caption - Generate a brand-aligned caption for an asset
 */
export async function generate_caption(input) {
  return notConfigured('media.generate_caption', {
    reason: 'AI composition service not configured',
    required_env: [],
    next_steps: ['Integrate AI composition service', 'Define brand guidelines']
  });
}

/**
 * media.propose_rename_map - Propose a safe rename/sort map for assets
 */
export async function propose_rename_map(input) {
  return notConfigured('media.propose_rename_map', {
    reason: 'Media management system not configured',
    required_env: [],
    next_steps: ['Define naming policy schema', 'Implement rename logic']
  });
}

/**
 * media.export_website_pack - Export selected assets into a website-ready pack
 */
export async function export_website_pack(input) {
  return notConfigured('media.export_website_pack', {
    reason: 'Media export system not configured',
    required_env: [],
    next_steps: ['Implement zip creation', 'Configure export templates']
  });
}
