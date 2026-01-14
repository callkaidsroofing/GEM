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

// ============================================
// OUTBOUND SYNC HANDLERS
// ============================================

/**
 * integrations.highlevel.sync_inspection - Sync completed inspection to GoHighLevel
 * Creates a note with inspection summary and moves opportunity to Quoting stage
 */
export async function highlevel_sync_inspection(input, context) {
  const config = highlevelProvider.checkConfiguration();
  if (!config.configured) {
    return notConfigured('integrations.highlevel.sync_inspection', {
      reason: 'HighLevel integration not configured',
      missing: config.missing
    });
  }

  const { inspection_id, lead_id, highlevel_contact_id } = input;

  if (!inspection_id || !highlevel_contact_id) {
    return success({
      status: 'error',
      error: 'Missing required fields: inspection_id and highlevel_contact_id'
    });
  }

  try {
    // Fetch inspection data
    const { data: inspection, error: inspError } = await supabase
      .from('inspections')
      .select('*, leads(*)')
      .eq('id', inspection_id)
      .single();

    if (inspError || !inspection) {
      return success({
        status: 'error',
        error: 'Inspection not found'
      });
    }

    // Build inspection summary note
    const defectCount = inspection.defects?.length || 0;
    const photoCount = inspection.photos?.length || 0;
    const noteBody = `🏠 **Roof Health Check Completed**

📅 Date: ${new Date(inspection.completed_at || inspection.created_at).toLocaleDateString('en-AU')}
📍 Address: ${inspection.leads?.address || 'N/A'}

**Summary:**
- Roof Condition: ${inspection.overall_condition || 'Assessed'}
- Defects Found: ${defectCount}
- Photos Taken: ${photoCount}

**Recommendations:**
${inspection.recommendations || 'See full report for details.'}

---
_Synced from CKR-Inspections App_`;

    // Create note in GHL
    const noteResult = await highlevelProvider.createNote(highlevel_contact_id, noteBody);

    if (!noteResult.success) {
      // Queue for retry
      await queueSyncRetry('create_note', 'inspection', inspection_id, highlevel_contact_id, {
        body: noteBody
      });

      return success({
        status: 'queued_retry',
        error: noteResult.error
      });
    }

    // Move opportunity to Quoting stage
    const quotingStageId = 'bbc51746-485d-4703-a78f-c1b5631a241a';

    // Get opportunity for this contact
    const oppResult = await highlevelProvider.getContactOpportunities(highlevel_contact_id);

    if (oppResult.success && oppResult.data?.opportunities?.length > 0) {
      const opportunity = oppResult.data.opportunities[0];
      await highlevelProvider.updateOpportunity(opportunity.id, {
        pipelineStageId: quotingStageId
      });

      // Track opportunity sync
      await supabase
        .from('highlevel_opportunity_sync')
        .upsert({
          highlevel_opportunity_id: opportunity.id,
          highlevel_contact_id: highlevel_contact_id,
          ckr_lead_id: lead_id,
          highlevel_stage_id: quotingStageId,
          highlevel_stage_name: 'Quoting',
          sync_status: 'synced',
          last_sync_at: new Date().toISOString()
        }, { onConflict: 'highlevel_opportunity_id' });
    }

    // Track document mapping
    await supabase
      .from('highlevel_document_mapping')
      .upsert({
        ckr_entity_type: 'inspection',
        ckr_entity_id: inspection_id,
        highlevel_contact_id: highlevel_contact_id,
        highlevel_note_id: noteResult.data?.id,
        sync_status: 'uploaded',
        uploaded_at: new Date().toISOString()
      }, { onConflict: 'ckr_entity_type,ckr_entity_id' });

    return success({
      status: 'synced',
      inspection_id,
      highlevel_contact_id,
      note_id: noteResult.data?.id,
      stage_updated: true
    }, { api_calls: 3 });

  } catch (error) {
    console.error('highlevel_sync_inspection error:', error);
    return success({
      status: 'error',
      error: 'Sync failed'
    });
  }
}

/**
 * integrations.highlevel.sync_quote - Sync quote to GoHighLevel
 * Creates a note with quote details and updates opportunity value
 */
export async function highlevel_sync_quote(input, context) {
  const config = highlevelProvider.checkConfiguration();
  if (!config.configured) {
    return notConfigured('integrations.highlevel.sync_quote', {
      reason: 'HighLevel integration not configured',
      missing: config.missing
    });
  }

  const { quote_id, lead_id, highlevel_contact_id, quote_amount, quote_url } = input;

  if (!quote_id || !highlevel_contact_id) {
    return success({
      status: 'error',
      error: 'Missing required fields: quote_id and highlevel_contact_id'
    });
  }

  try {
    // Build quote note
    const noteBody = `💰 **Quote Sent**

📅 Date: ${new Date().toLocaleDateString('en-AU')}
💵 Amount: $${(quote_amount || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}

${quote_url ? `📄 View Quote: ${quote_url}` : ''}

---
_Synced from CKR-Inspections App_`;

    // Create note in GHL
    const noteResult = await highlevelProvider.createNote(highlevel_contact_id, noteBody);

    // Update opportunity value and move to Follow Up stage
    const followUpStageId = '17b86090-5bed-4af5-81de-2c88472a3046';

    const oppResult = await highlevelProvider.getContactOpportunities(highlevel_contact_id);

    if (oppResult.success && oppResult.data?.opportunities?.length > 0) {
      const opportunity = oppResult.data.opportunities[0];
      await highlevelProvider.updateOpportunity(opportunity.id, {
        pipelineStageId: followUpStageId,
        monetaryValue: quote_amount || 0
      });

      // Create follow-up task (3 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);

      await highlevelProvider.createTask(highlevel_contact_id, {
        title: 'Follow up on quote',
        body: `Quote for $${(quote_amount || 0).toLocaleString('en-AU')} was sent. Follow up with customer.`,
        dueDate: dueDate.toISOString()
      });

      // Track opportunity sync
      await supabase
        .from('highlevel_opportunity_sync')
        .upsert({
          highlevel_opportunity_id: opportunity.id,
          highlevel_contact_id: highlevel_contact_id,
          ckr_lead_id: lead_id,
          highlevel_stage_id: followUpStageId,
          highlevel_stage_name: 'Follow Up',
          highlevel_monetary_value: quote_amount || 0,
          sync_status: 'synced',
          last_sync_at: new Date().toISOString()
        }, { onConflict: 'highlevel_opportunity_id' });
    }

    // Track document mapping
    await supabase
      .from('highlevel_document_mapping')
      .upsert({
        ckr_entity_type: 'quote',
        ckr_entity_id: quote_id,
        highlevel_contact_id: highlevel_contact_id,
        highlevel_note_id: noteResult.data?.id,
        sync_status: 'uploaded',
        uploaded_at: new Date().toISOString()
      }, { onConflict: 'ckr_entity_type,ckr_entity_id' });

    return success({
      status: 'synced',
      quote_id,
      highlevel_contact_id,
      note_id: noteResult.data?.id,
      task_created: true,
      stage_updated: true
    }, { api_calls: 4 });

  } catch (error) {
    console.error('highlevel_sync_quote error:', error);
    return success({
      status: 'error',
      error: 'Sync failed'
    });
  }
}

/**
 * integrations.highlevel.update_lead_stage - Update lead stage in GoHighLevel
 */
export async function highlevel_update_lead_stage(input, context) {
  const config = highlevelProvider.checkConfiguration();
  if (!config.configured) {
    return notConfigured('integrations.highlevel.update_lead_stage', {
      reason: 'HighLevel integration not configured',
      missing: config.missing
    });
  }

  const { lead_id, highlevel_contact_id, stage, notes } = input;

  if (!highlevel_contact_id || !stage) {
    return success({
      status: 'error',
      error: 'Missing required fields: highlevel_contact_id and stage'
    });
  }

  try {
    // Look up stage ID from mapping table
    const { data: stageMapping } = await supabase
      .from('highlevel_stage_mapping')
      .select('highlevel_stage_id, highlevel_stage_name')
      .eq('ckr_lead_status', stage)
      .eq('auto_sync_outbound', true)
      .limit(1)
      .single();

    if (!stageMapping) {
      return success({
        status: 'error',
        error: `No stage mapping found for CKR status: ${stage}`
      });
    }

    // Get opportunity for this contact
    const oppResult = await highlevelProvider.getContactOpportunities(highlevel_contact_id);

    if (!oppResult.success || !oppResult.data?.opportunities?.length) {
      return success({
        status: 'error',
        error: 'No opportunity found for contact'
      });
    }

    const opportunity = oppResult.data.opportunities[0];

    // Update opportunity stage
    const updateResult = await highlevelProvider.updateOpportunity(opportunity.id, {
      pipelineStageId: stageMapping.highlevel_stage_id
    });

    if (!updateResult.success) {
      return success({
        status: 'error',
        error: updateResult.error
      });
    }

    // Add note if provided
    if (notes) {
      await highlevelProvider.createNote(highlevel_contact_id, notes);
    }

    // Track sync
    await supabase
      .from('highlevel_opportunity_sync')
      .upsert({
        highlevel_opportunity_id: opportunity.id,
        highlevel_contact_id: highlevel_contact_id,
        ckr_lead_id: lead_id,
        ckr_lead_status: stage,
        highlevel_stage_id: stageMapping.highlevel_stage_id,
        highlevel_stage_name: stageMapping.highlevel_stage_name,
        sync_status: 'synced',
        last_sync_at: new Date().toISOString()
      }, { onConflict: 'highlevel_opportunity_id' });

    return success({
      status: 'synced',
      highlevel_contact_id,
      opportunity_id: opportunity.id,
      new_stage: stageMapping.highlevel_stage_name
    }, { api_calls: notes ? 3 : 2 });

  } catch (error) {
    console.error('highlevel_update_lead_stage error:', error);
    return success({
      status: 'error',
      error: 'Stage update failed'
    });
  }
}

/**
 * Queue a sync operation for retry
 */
async function queueSyncRetry(operation, entityType, entityId, contactId, payload) {
  const nextAttempt = new Date();
  nextAttempt.setMinutes(nextAttempt.getMinutes() + 5); // Retry in 5 minutes

  await supabase
    .from('highlevel_sync_queue')
    .insert({
      operation,
      entity_type: entityType,
      entity_id: entityId,
      highlevel_contact_id: contactId,
      payload,
      status: 'queued',
      priority: 5,
      next_attempt_at: nextAttempt.toISOString()
    });
}

/**
 * integrations.highlevel.process_sync_queue - Process pending sync queue items
 */
export async function highlevel_process_sync_queue(input, context) {
  const config = highlevelProvider.checkConfiguration();
  if (!config.configured) {
    return notConfigured('integrations.highlevel.process_sync_queue', {
      reason: 'HighLevel integration not configured',
      missing: config.missing
    });
  }

  const limit = input.limit || 10;

  try {
    // Get pending items
    const { data: items, error } = await supabase
      .from('highlevel_sync_queue')
      .select('*')
      .in('status', ['queued', 'failed'])
      .lt('attempts', 5)
      .lte('next_attempt_at', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error || !items?.length) {
      return success({
        status: 'ok',
        processed: 0,
        message: 'No pending items'
      });
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      processed++;

      // Mark as processing
      await supabase
        .from('highlevel_sync_queue')
        .update({
          status: 'processing',
          last_attempt_at: new Date().toISOString(),
          attempts: item.attempts + 1
        })
        .eq('id', item.id);

      let result;

      try {
        switch (item.operation) {
          case 'create_note':
            result = await highlevelProvider.createNote(item.highlevel_contact_id, item.payload.body);
            break;
          case 'update_opportunity':
            result = await highlevelProvider.updateOpportunity(item.payload.opportunity_id, item.payload.updates);
            break;
          case 'create_task':
            result = await highlevelProvider.createTask(item.highlevel_contact_id, item.payload);
            break;
          default:
            result = { success: false, error: `Unknown operation: ${item.operation}` };
        }
      } catch (err) {
        result = { success: false, error: err.message };
      }

      if (result.success) {
        succeeded++;
        await supabase
          .from('highlevel_sync_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', item.id);
      } else {
        failed++;
        const nextAttempt = new Date();
        nextAttempt.setMinutes(nextAttempt.getMinutes() + Math.pow(2, item.attempts) * 5); // Exponential backoff

        await supabase
          .from('highlevel_sync_queue')
          .update({
            status: item.attempts + 1 >= 5 ? 'failed' : 'queued',
            error_message: result.error,
            next_attempt_at: nextAttempt.toISOString()
          })
          .eq('id', item.id);
      }
    }

    return success({
      status: 'ok',
      processed,
      succeeded,
      failed
    }, { api_calls: processed });

  } catch (error) {
    console.error('highlevel_process_sync_queue error:', error);
    return success({
      status: 'error',
      error: 'Queue processing failed'
    });
  }
}
