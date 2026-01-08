/**
 * GEM Realtime Event System
 *
 * Provides real-time subscriptions to tool execution events
 * using Supabase Realtime channels.
 */

import { supabase } from './supabase.js';

/**
 * Event handler registry
 */
const eventHandlers = {
  receipt_created: [],
  status_changed: [],
  all: [],
};

/**
 * Subscribe to receipt creation events
 * @param {Function} handler - Callback function (receipt) => void
 * @returns {Function} Unsubscribe function
 */
export function onReceiptCreated(handler) {
  eventHandlers.receipt_created.push(handler);
  return () => {
    const idx = eventHandlers.receipt_created.indexOf(handler);
    if (idx > -1) eventHandlers.receipt_created.splice(idx, 1);
  };
}

/**
 * Subscribe to tool call status changes
 * @param {Function} handler - Callback function (statusChange) => void
 * @returns {Function} Unsubscribe function
 */
export function onStatusChanged(handler) {
  eventHandlers.status_changed.push(handler);
  return () => {
    const idx = eventHandlers.status_changed.indexOf(handler);
    if (idx > -1) eventHandlers.status_changed.splice(idx, 1);
  };
}

/**
 * Subscribe to all events
 * @param {Function} handler - Callback function (event) => void
 * @returns {Function} Unsubscribe function
 */
export function onAnyEvent(handler) {
  eventHandlers.all.push(handler);
  return () => {
    const idx = eventHandlers.all.indexOf(handler);
    if (idx > -1) eventHandlers.all.splice(idx, 1);
  };
}

/**
 * Active subscription channels
 */
let receiptsChannel = null;
let callsChannel = null;

/**
 * Initialize Realtime subscriptions
 * Call this once at application startup
 */
export async function initializeRealtime() {
  // Subscribe to receipt inserts
  receiptsChannel = supabase
    .channel('tool-receipts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'core_tool_receipts',
      },
      (payload) => {
        const receipt = payload.new;

        // Notify receipt handlers
        eventHandlers.receipt_created.forEach((handler) => {
          try {
            handler(receipt);
          } catch (error) {
            console.error('Receipt handler error:', error);
          }
        });

        // Notify all-event handlers
        eventHandlers.all.forEach((handler) => {
          try {
            handler({ type: 'receipt_created', data: receipt });
          } catch (error) {
            console.error('Event handler error:', error);
          }
        });
      }
    )
    .subscribe((status) => {
      console.info(`Receipts channel: ${status}`);
    });

  // Subscribe to call status changes
  callsChannel = supabase
    .channel('tool-calls')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'core_tool_calls',
      },
      (payload) => {
        const oldRecord = payload.old;
        const newRecord = payload.new;

        // Only trigger if status actually changed
        if (oldRecord.status !== newRecord.status) {
          const statusChange = {
            call_id: newRecord.id,
            tool_name: newRecord.tool_name,
            old_status: oldRecord.status,
            new_status: newRecord.status,
            worker_id: newRecord.worker_id,
          };

          // Notify status change handlers
          eventHandlers.status_changed.forEach((handler) => {
            try {
              handler(statusChange);
            } catch (error) {
              console.error('Status change handler error:', error);
            }
          });

          // Notify all-event handlers
          eventHandlers.all.forEach((handler) => {
            try {
              handler({ type: 'status_changed', data: statusChange });
            } catch (error) {
              console.error('Event handler error:', error);
            }
          });
        }
      }
    )
    .subscribe((status) => {
      console.info(`Calls channel: ${status}`);
    });

  console.info('GEM Realtime initialized');
}

/**
 * Cleanup subscriptions
 * Call this on application shutdown
 */
export async function cleanupRealtime() {
  if (receiptsChannel) {
    await supabase.removeChannel(receiptsChannel);
    receiptsChannel = null;
  }
  if (callsChannel) {
    await supabase.removeChannel(callsChannel);
    callsChannel = null;
  }
  console.info('GEM Realtime cleaned up');
}

/**
 * Wait for a specific receipt
 * Useful for enqueue_and_wait pattern
 *
 * @param {string} callId - The call ID to wait for
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} The receipt
 */
export function waitForReceipt(callId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timeout waiting for receipt for call ${callId}`));
    }, timeoutMs);

    const unsubscribe = onReceiptCreated((receipt) => {
      if (receipt.call_id === callId) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(receipt);
      }
    });
  });
}

/**
 * Wait for a call to reach a specific status
 *
 * @param {string} callId - The call ID to wait for
 * @param {string} targetStatus - Status to wait for (succeeded, failed, etc.)
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} The status change event
 */
export function waitForStatus(callId, targetStatus, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timeout waiting for status ${targetStatus} on call ${callId}`));
    }, timeoutMs);

    const unsubscribe = onStatusChanged((change) => {
      if (change.call_id === callId && change.new_status === targetStatus) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(change);
      }
    });
  });
}

/**
 * Log an event to the gem_events table
 *
 * @param {string} eventType - Type of event (e.g., 'LeadCreated')
 * @param {string} aggregateType - Type of aggregate (e.g., 'lead')
 * @param {string} aggregateId - ID of the aggregate
 * @param {Object} payload - Event payload
 * @param {Object} metadata - Additional metadata
 */
export async function logEvent(eventType, aggregateType, aggregateId, payload, metadata = {}) {
  const { data, error } = await supabase.rpc('log_gem_event', {
    p_event_type: eventType,
    p_aggregate_type: aggregateType,
    p_aggregate_id: aggregateId,
    p_payload: payload,
    p_metadata: metadata,
  });

  if (error) {
    console.error('Failed to log event:', error);
    throw error;
  }

  return data;
}

/**
 * Query events for an aggregate
 *
 * @param {string} aggregateType - Type of aggregate
 * @param {string} aggregateId - ID of the aggregate
 * @returns {Promise<Array>} Array of events
 */
export async function getEventsForAggregate(aggregateType, aggregateId) {
  const { data, error } = await supabase
    .from('gem_events')
    .select('*')
    .eq('aggregate_type', aggregateType)
    .eq('aggregate_id', aggregateId)
    .order('sequence_number', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Query events by type
 *
 * @param {string} eventType - Type of event
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of events
 */
export async function getEventsByType(eventType, options = {}) {
  const { limit = 100, since = null } = options;

  let query = supabase
    .from('gem_events')
    .select('*')
    .eq('event_type', eventType)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte('created_at', since);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
