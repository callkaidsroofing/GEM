import { supabase } from '../lib/supabase.js';
import { notConfigured, success } from '../lib/responses.js';

/**
 * Media handlers
 *
 * Manages media assets (photos, videos, documents) in the media_assets table.
 * Some handlers require external services (AI vision, storage) and return not_configured.
 */

/**
 * media.register_asset - Register a media asset with storage reference
 *
 * Registry definition:
 *   input: { file_ref (required), asset_type (required), job_id, suburb, taken_at, notes }
 *   output: { asset_id }
 *   permissions: [write:db, read:files]
 *   idempotency: keyed (key_field: file_ref)
 */
export async function register_asset(input) {
  const {
    file_ref,
    asset_type,
    job_id,
    inspection_id,
    lead_id,
    quote_id,
    suburb,
    location_on_property,
    taken_at,
    notes,
    tags,
    metadata,
    mime_type,
    file_size_bytes
  } = input;

  // Check for existing asset with same file_ref (keyed idempotency)
  const { data: existing, error: lookupError } = await supabase
    .from('media_assets')
    .select('id')
    .eq('file_ref', file_ref)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to check existing asset: ${lookupError.message}`);
  }

  if (existing) {
    // Idempotency hit - return existing asset
    return success(
      { asset_id: existing.id, already_exists: true },
      { db_writes: [], idempotency_hit: true }
    );
  }

  // Insert new asset
  const { data, error } = await supabase
    .from('media_assets')
    .insert({
      file_ref,
      asset_type,
      job_id: job_id || null,
      inspection_id: inspection_id || null,
      lead_id: lead_id || null,
      quote_id: quote_id || null,
      suburb: suburb || null,
      location_on_property: location_on_property || null,
      taken_at: taken_at || null,
      tags: Array.isArray(tags) ? tags : [],
      metadata: metadata || {},
      mime_type: mime_type || null,
      file_size_bytes: file_size_bytes || null,
      processing_status: 'pending',
      created_by: input.created_by || 'system'
    })
    .select('id')
    .single();

  if (error) {
    // Handle race condition on unique constraint
    if (error.code === '23505') {
      const { data: raceHit } = await supabase
        .from('media_assets')
        .select('id')
        .eq('file_ref', file_ref)
        .single();

      if (raceHit) {
        return success(
          { asset_id: raceHit.id, already_exists: true },
          { db_writes: [], idempotency_hit: true }
        );
      }
    }
    throw new Error(`Failed to register asset: ${error.message}`);
  }

  return success(
    { asset_id: data.id },
    { db_writes: [{ table: 'media_assets', action: 'insert', id: data.id }] }
  );
}

/**
 * media.tag_asset - Apply tags to an asset
 *
 * Registry definition:
 *   input: { asset_id (required), tags (required) }
 *   output: { asset_id }
 *   permissions: [write:db]
 *   idempotency: safe-retry
 */
export async function tag_asset(input) {
  const { asset_id, tags } = input;

  // Verify asset exists
  const { data: asset, error: fetchError } = await supabase
    .from('media_assets')
    .select('id, tags')
    .eq('id', asset_id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch asset: ${fetchError.message}`);
  }

  if (!asset) {
    throw new Error(`Asset ${asset_id} not found`);
  }

  // Merge tags (deduplicate)
  const existingTags = asset.tags || [];
  const newTags = Array.isArray(tags) ? tags : [tags];
  const mergedTags = [...new Set([...existingTags, ...newTags])];

  // Update tags
  const { error: updateError } = await supabase
    .from('media_assets')
    .update({
      tags: mergedTags,
      updated_at: new Date().toISOString()
    })
    .eq('id', asset_id);

  if (updateError) {
    throw new Error(`Failed to update asset tags: ${updateError.message}`);
  }

  return success(
    { asset_id, tags: mergedTags },
    { db_writes: [{ table: 'media_assets', action: 'update', id: asset_id }] }
  );
}

/**
 * media.get_asset - Get asset details by ID
 *
 * Not in registry but useful for internal use
 */
export async function get_asset(input) {
  const { asset_id } = input;

  const { data, error } = await supabase
    .from('media_assets')
    .select('*')
    .eq('id', asset_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch asset: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Asset ${asset_id} not found`);
  }

  return success(
    { asset: data },
    { db_reads: [{ table: 'media_assets', id: asset_id }] }
  );
}

/**
 * media.list_assets - List assets with optional filters
 *
 * Not in registry but useful for internal use
 */
export async function list_assets(input) {
  const {
    inspection_id,
    job_id,
    lead_id,
    asset_type,
    tags,
    limit = 50
  } = input || {};

  let query = supabase
    .from('media_assets')
    .select('id, file_ref, asset_type, tags, caption, alt_text, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (inspection_id) query = query.eq('inspection_id', inspection_id);
  if (job_id) query = query.eq('job_id', job_id);
  if (lead_id) query = query.eq('lead_id', lead_id);
  if (asset_type) query = query.eq('asset_type', asset_type);
  if (tags && Array.isArray(tags) && tags.length > 0) {
    query = query.contains('tags', tags);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list assets: ${error.message}`);
  }

  return success(
    { assets: data || [], count: data?.length || 0 },
    { db_reads: [{ table: 'media_assets', count: data?.length || 0 }] }
  );
}

/**
 * media.generate_alt_text - Generate factual alt text for an image asset
 *
 * Requires AI vision service configuration.
 */
export async function generate_alt_text(input) {
  return notConfigured('media.generate_alt_text', {
    reason: 'AI vision service not configured',
    required_env: ['OPENAI_API_KEY'],
    next_steps: [
      'Set OPENAI_API_KEY environment variable',
      'Implement vision API integration'
    ]
  });
}

/**
 * media.generate_caption - Generate a brand-aligned caption for an asset
 *
 * Requires AI composition service configuration.
 */
export async function generate_caption(input) {
  return notConfigured('media.generate_caption', {
    reason: 'AI composition service not configured',
    required_env: ['OPENAI_API_KEY'],
    next_steps: [
      'Set OPENAI_API_KEY environment variable',
      'Define brand guidelines',
      'Implement caption generation'
    ]
  });
}

/**
 * media.propose_rename_map - Propose a safe rename/sort map for assets
 *
 * Requires naming policy configuration.
 */
export async function propose_rename_map(input) {
  return notConfigured('media.propose_rename_map', {
    reason: 'Media management system not configured',
    required_env: [],
    next_steps: [
      'Define naming policy schema in config',
      'Implement rename proposal logic'
    ]
  });
}

/**
 * media.export_website_pack - Export selected assets into a website-ready pack
 *
 * Requires storage and export configuration.
 */
export async function export_website_pack(input) {
  return notConfigured('media.export_website_pack', {
    reason: 'Media export system not configured',
    required_env: [],
    next_steps: [
      'Configure Supabase Storage',
      'Implement zip creation',
      'Configure export templates'
    ]
  });
}

/**
 * media.link_to_inspection - Link an existing asset to an inspection
 *
 * Helper for the inspection pipeline.
 */
export async function link_to_inspection(input) {
  const { asset_id, inspection_id } = input;

  // Verify asset exists
  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .select('id')
    .eq('id', asset_id)
    .maybeSingle();

  if (assetError) {
    throw new Error(`Failed to fetch asset: ${assetError.message}`);
  }

  if (!asset) {
    throw new Error(`Asset ${asset_id} not found`);
  }

  // Verify inspection exists
  const { data: inspection, error: inspError } = await supabase
    .from('inspections')
    .select('id')
    .eq('id', inspection_id)
    .maybeSingle();

  if (inspError) {
    throw new Error(`Failed to fetch inspection: ${inspError.message}`);
  }

  if (!inspection) {
    throw new Error(`Inspection ${inspection_id} not found`);
  }

  // Update asset with inspection_id
  const { error: updateError } = await supabase
    .from('media_assets')
    .update({
      inspection_id,
      updated_at: new Date().toISOString()
    })
    .eq('id', asset_id);

  if (updateError) {
    throw new Error(`Failed to link asset: ${updateError.message}`);
  }

  return success(
    { asset_id, inspection_id, linked: true },
    { db_writes: [{ table: 'media_assets', action: 'update', id: asset_id }] }
  );
}
