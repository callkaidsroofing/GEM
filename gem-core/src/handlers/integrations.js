import { notConfigured, success } from '../lib/responses.js';
import { supabase } from '../lib/supabase.js';
import * as highlevelProvider from '../providers/highlevel.js';

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

// ============================================
// HIGHLEVEL / LEADCONNECTOR INTEGRATION
// ============================================

/**
 * integrations.highlevel.health_check - Check HighLevel API connectivity
 *
 * Returns: { status: "ok|degraded|down", location_id, checks: { api: boolean } }
 */
export async function highlevel_health_check(input) {
  // Check configuration
  const config = highlevelProvider.checkConfiguration();
  if (!config.configured) {
    return notConfigured('integrations.highlevel.health_check', {
      reason: 'HighLevel integration not configured',
      required_env: config.required,
      next_steps: [
        'Set HIGHLEVEL_PRIVATE_API_KEY environment variable',
        'Set HIGHLEVEL_LOCATION_ID environment variable',
        'Optionally set HIGHLEVEL_BASE_URL (defaults to https://services.leadconnectorhq.com)'
      ]
    });
  }

  const locationId = process.env.HIGHLEVEL_LOCATION_ID;

  try {
    const healthResult = await highlevelProvider.healthCheck();

    if (healthResult.success) {
      return success({
        status: 'ok',
        location_id: locationId,
        checks: {
          api: true
        }
      });
    }

    // API call failed but we have config
    return success({
      status: 'degraded',
      location_id: locationId,
      checks: {
        api: false
      }
    });
  } catch (error) {
    // Unexpected error - return degraded status
    return success({
      status: 'down',
      location_id: locationId,
      checks: {
        api: false
      }
    });
  }
}

/**
 * integrations.highlevel.sync_contacts - Sync contacts from HighLevel to local DB
 *
 * Input:
 *   - location_id (optional, defaults to env)
 *   - cursor (optional, for pagination)
 *   - since (optional, ISO timestamp for incremental sync)
 *   - limit (optional, default 100, max 200)
 *   - dry_run (optional, default false)
 *
 * Returns:
 *   - status: "ok|partial|failed"
 *   - location_id
 *   - counts: { fetched, upserted, unchanged, errors }
 *   - cursor (input cursor)
 *   - next_cursor (for pagination)
 *   - last_sync_at
 */
export async function highlevel_sync_contacts(input, context = {}) {
  // Check configuration
  const config = highlevelProvider.checkConfiguration();
  if (!config.configured) {
    return notConfigured('integrations.highlevel.sync_contacts', {
      reason: 'HighLevel integration not configured',
      required_env: config.required,
      next_steps: [
        'Set HIGHLEVEL_PRIVATE_API_KEY environment variable',
        'Set HIGHLEVEL_LOCATION_ID environment variable'
      ]
    });
  }

  const locationId = input.location_id || process.env.HIGHLEVEL_LOCATION_ID;
  const cursor = input.cursor || null;
  const since = input.since || null;
  const limit = Math.min(input.limit || 100, 200);
  const dryRun = input.dry_run === true;

  const syncStartedAt = new Date().toISOString();
  const counts = {
    fetched: 0,
    upserted: 0,
    unchanged: 0,
    errors: 0
  };

  let nextCursor = null;
  let syncRunId = null;

  try {
    // Create sync run record (for auditing)
    if (!dryRun) {
      const { data: runData, error: runError } = await supabase
        .from('integrations_highlevel_sync_runs')
        .insert({
          location_id: locationId,
          run_type: 'manual',
          started_at: syncStartedAt,
          status: 'running',
          cursor_start: cursor,
          since_filter: since,
          dry_run: dryRun,
          call_id: context.job?.id || null
        })
        .select('id')
        .single();

      if (!runError && runData) {
        syncRunId = runData.id;
      }
    }

    // Fetch contacts from HighLevel
    const fetchResult = await highlevelProvider.fetchContacts({
      locationId,
      cursor,
      since,
      limit
    });

    if (!fetchResult.success) {
      // Update sync run as failed
      if (syncRunId) {
        await supabase
          .from('integrations_highlevel_sync_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_message: fetchResult.error
          })
          .eq('id', syncRunId);
      }

      return success({
        status: 'failed',
        location_id: locationId,
        counts,
        cursor,
        next_cursor: null,
        last_sync_at: syncStartedAt
      }, {
        db_writes: 0
      });
    }

    const contacts = fetchResult.data.contacts;
    counts.fetched = contacts.length;
    nextCursor = fetchResult.data.meta.nextCursor;

    // Process each contact
    for (const contact of contacts) {
      try {
        const highlevelContactId = contact.id;
        const payload = contact;
        const payloadHash = highlevelProvider.computePayloadHash(payload);

        if (dryRun) {
          // In dry run, check if contact exists and if payload changed
          const { data: existing } = await supabase
            .from('integrations_highlevel_contacts')
            .select('payload_hash')
            .eq('highlevel_contact_id', highlevelContactId)
            .single();

          if (existing && existing.payload_hash === payloadHash) {
            counts.unchanged++;
          } else {
            counts.upserted++;
          }
        } else {
          // Check if contact exists
          const { data: existing } = await supabase
            .from('integrations_highlevel_contacts')
            .select('id, payload_hash')
            .eq('highlevel_contact_id', highlevelContactId)
            .single();

          if (existing) {
            // Check if payload changed
            if (existing.payload_hash === payloadHash) {
              counts.unchanged++;
            } else {
              // Update existing contact
              const { error: updateError } = await supabase
                .from('integrations_highlevel_contacts')
                .update({
                  payload,
                  payload_hash: payloadHash,
                  location_id: locationId,
                  sync_status: 'active'
                })
                .eq('id', existing.id);

              if (updateError) {
                counts.errors++;
              } else {
                counts.upserted++;
              }
            }
          } else {
            // Insert new contact
            const { error: insertError } = await supabase
              .from('integrations_highlevel_contacts')
              .insert({
                location_id: locationId,
                highlevel_contact_id: highlevelContactId,
                payload,
                payload_hash: payloadHash,
                sync_status: 'active',
                first_synced_at: new Date().toISOString()
              });

            if (insertError) {
              counts.errors++;
            } else {
              counts.upserted++;
            }
          }
        }
      } catch (contactError) {
        counts.errors++;
      }
    }

    // Update connection state
    if (!dryRun) {
      await supabase
        .from('integrations_highlevel_connections')
        .upsert({
          location_id: locationId,
          enabled: true,
          last_sync_at: syncStartedAt,
          last_cursor: nextCursor ? { cursor: nextCursor } : null,
          sync_status: counts.errors > 0 ? 'partial' : 'completed'
        }, {
          onConflict: 'location_id'
        });

      // Update sync run as completed
      if (syncRunId) {
        await supabase
          .from('integrations_highlevel_sync_runs')
          .update({
            status: counts.errors > 0 ? 'partial' : 'completed',
            finished_at: new Date().toISOString(),
            counts,
            cursor_end: nextCursor
          })
          .eq('id', syncRunId);
      }
    }

    // Determine status
    let status = 'ok';
    if (counts.errors > 0 && counts.upserted > 0) {
      status = 'partial';
    } else if (counts.errors > 0 && counts.upserted === 0) {
      status = 'failed';
    }

    return success({
      status,
      location_id: locationId,
      counts,
      cursor,
      next_cursor: nextCursor,
      last_sync_at: syncStartedAt
    }, {
      db_writes: dryRun ? 0 : counts.upserted
    });

  } catch (error) {
    // Update sync run as failed
    if (syncRunId) {
      await supabase
        .from('integrations_highlevel_sync_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_message: 'Unexpected error during sync'
        })
        .eq('id', syncRunId);
    }

    // Return failed status without exposing error details
    return success({
      status: 'failed',
      location_id: locationId,
      counts,
      cursor,
      next_cursor: null,
      last_sync_at: syncStartedAt
    }, {
      db_writes: 0
    });
  }
}
