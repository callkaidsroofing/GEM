-- Migration: Create jobs table
-- Purpose: Store job records created from accepted quotes
-- Required by: job.create_from_accepted_quote, job.assign_dates, job.complete, job.add_site_notes

CREATE TABLE IF NOT EXISTS jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NULL,
    status text NOT NULL DEFAULT 'draft',
    scheduled_at timestamptz NULL,
    notes text NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Index for lead_id lookup
CREATE INDEX IF NOT EXISTS idx_jobs_lead_id ON jobs(lead_id);

-- Index for scheduled_at ordering
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at);

-- Index for created_at ordering
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

COMMENT ON TABLE jobs IS 'CKR-CORE job records for scheduled roofing work';
COMMENT ON COLUMN jobs.status IS 'Job status: draft, scheduled, in_progress, completed, cancelled';
COMMENT ON COLUMN jobs.scheduled_at IS 'Planned start date/time for the job';
