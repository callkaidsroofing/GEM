-- Migration: Create comms_log table
-- Purpose: Store communication log entries (calls, SMS, emails)
-- Required by: comms.log_call_outcome, comms.send_sms, comms.send_email

CREATE TABLE IF NOT EXISTS comms_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel text NOT NULL,
    recipient text NOT NULL,
    body text NOT NULL,
    related_entity jsonb NULL,
    created_at timestamptz DEFAULT now()
);

-- Index for channel filtering
CREATE INDEX IF NOT EXISTS idx_comms_log_channel ON comms_log(channel);

-- Index for recipient lookup
CREATE INDEX IF NOT EXISTS idx_comms_log_recipient ON comms_log(recipient);

-- Index for created_at ordering
CREATE INDEX IF NOT EXISTS idx_comms_log_created_at ON comms_log(created_at DESC);

COMMENT ON TABLE comms_log IS 'CKR-CORE communication log for calls, SMS, and emails';
COMMENT ON COLUMN comms_log.channel IS 'Communication channel: call, sms, email';
COMMENT ON COLUMN comms_log.related_entity IS 'JSON reference to related entity/context';
