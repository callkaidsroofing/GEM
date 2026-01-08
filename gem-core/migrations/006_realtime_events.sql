-- Migration: 006_realtime_events.sql
-- Purpose: Enable Supabase Realtime for tool execution events
-- Created: 2026-01-09

-- ============================================
-- PHASE 1: SUPABASE REALTIME FOR RECEIPTS
-- ============================================

-- Enable Realtime for core_tool_receipts table
-- This allows clients to subscribe to receipt events
ALTER PUBLICATION supabase_realtime ADD TABLE core_tool_receipts;

-- Enable Realtime for core_tool_calls (for status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE core_tool_calls;

-- ============================================
-- EVENT BROADCASTING FUNCTION
-- ============================================

-- Function to broadcast receipt events via pg_notify
-- Used for server-side event handling and webhooks
CREATE OR REPLACE FUNCTION broadcast_receipt_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Broadcast to 'tool_receipt' channel
  PERFORM pg_notify(
    'tool_receipt',
    json_build_object(
      'event', 'receipt_created',
      'tool_name', NEW.tool_name,
      'status', NEW.status,
      'call_id', NEW.call_id,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to receipts table
DROP TRIGGER IF EXISTS receipt_broadcast ON core_tool_receipts;
CREATE TRIGGER receipt_broadcast
  AFTER INSERT ON core_tool_receipts
  FOR EACH ROW EXECUTE FUNCTION broadcast_receipt_event();

-- ============================================
-- TOOL CALL STATUS CHANGE BROADCASTING
-- ============================================

-- Function to broadcast status changes (queued -> running -> succeeded/failed)
CREATE OR REPLACE FUNCTION broadcast_call_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only broadcast on status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_notify(
      'tool_call_status',
      json_build_object(
        'event', 'status_changed',
        'call_id', NEW.id,
        'tool_name', NEW.tool_name,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'worker_id', NEW.worker_id,
        'changed_at', NOW()
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to calls table
DROP TRIGGER IF EXISTS call_status_broadcast ON core_tool_calls;
CREATE TRIGGER call_status_broadcast
  AFTER UPDATE ON core_tool_calls
  FOR EACH ROW EXECUTE FUNCTION broadcast_call_status_change();

-- ============================================
-- GEM EVENTS TABLE (Event Sourcing)
-- ============================================

-- Append-only event log for full audit trail
CREATE TABLE IF NOT EXISTS gem_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sequence_number BIGSERIAL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_gem_events_aggregate
  ON gem_events(aggregate_type, aggregate_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_gem_events_type
  ON gem_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_gem_events_created
  ON gem_events(created_at);

-- Enable Realtime for events table
ALTER PUBLICATION supabase_realtime ADD TABLE gem_events;

-- ============================================
-- EVENT LOGGING FUNCTION
-- ============================================

-- Helper function to log events
CREATE OR REPLACE FUNCTION log_gem_event(
  p_event_type TEXT,
  p_aggregate_type TEXT,
  p_aggregate_id UUID,
  p_payload JSONB,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO gem_events (event_type, aggregate_type, aggregate_id, payload, metadata)
  VALUES (p_event_type, p_aggregate_type, p_aggregate_id, p_payload, p_metadata)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AUTO-LOG RECEIPT EVENTS
-- ============================================

-- Automatically log all receipts to event store
CREATE OR REPLACE FUNCTION log_receipt_to_events()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_gem_event(
    'ToolCallCompleted',
    'tool_call',
    NEW.call_id,
    json_build_object(
      'tool_name', NEW.tool_name,
      'status', NEW.status,
      'result', NEW.result,
      'effects', NEW.effects
    )::jsonb,
    json_build_object(
      'receipt_id', NEW.id
    )::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS receipt_to_events ON core_tool_receipts;
CREATE TRIGGER receipt_to_events
  AFTER INSERT ON core_tool_receipts
  FOR EACH ROW EXECUTE FUNCTION log_receipt_to_events();

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify Realtime is enabled
DO $$
BEGIN
  RAISE NOTICE 'Migration 006_realtime_events.sql complete';
  RAISE NOTICE 'Realtime enabled for: core_tool_receipts, core_tool_calls, gem_events';
  RAISE NOTICE 'Event broadcasting triggers installed';
  RAISE NOTICE 'Event sourcing table gem_events created';
END $$;
