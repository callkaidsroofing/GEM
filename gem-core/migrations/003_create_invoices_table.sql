-- Migration: Create invoices table
-- Purpose: Store invoice records created from completed jobs
-- Required by: invoice.create_from_job, invoice.add_payment, invoice.mark_overdue

CREATE TABLE IF NOT EXISTS invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NULL,
    status text NOT NULL DEFAULT 'draft',
    total_cents int NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Index for job_id lookup
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id);

-- Index for created_at ordering
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

COMMENT ON TABLE invoices IS 'CKR-CORE invoice records for billing';
COMMENT ON COLUMN invoices.status IS 'Invoice status: draft, sent, paid, partial, overdue, cancelled';
COMMENT ON COLUMN invoices.total_cents IS 'Total invoice amount in cents (AUD)';
