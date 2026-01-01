-- ============================================
-- PHASE 1B: Additional domain tables for registry coverage
-- Tables: entities, jobs, invoices, comms_log
-- ============================================

-- ============================================
-- ENTITIES TABLE
-- Stores clients, suppliers, partners, friends, leads, other
-- ============================================
CREATE TABLE IF NOT EXISTS public.entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'supplier', 'partner', 'friend', 'lead', 'other')),
    name TEXT NOT NULL,
    contact JSONB DEFAULT '{}',
    site_details JSONB DEFAULT '{}',
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON public.entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON public.entities USING gin (to_tsvector('english', name));

-- ============================================
-- JOBS TABLE
-- Stores jobs created from accepted quotes
-- ============================================
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled')),
    start_date DATE,
    end_date DATE,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    site_notes TEXT,
    notes TEXT,
    before_refs JSONB DEFAULT '[]',
    after_refs JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_quote_id ON public.jobs (quote_id);
CREATE INDEX IF NOT EXISTS idx_jobs_lead_id ON public.jobs (lead_id);

-- ============================================
-- INVOICES TABLE
-- Stores invoices created from completed jobs
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    total_cents INTEGER NOT NULL DEFAULT 0,
    paid_cents INTEGER NOT NULL DEFAULT 0,
    due_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON public.invoices (job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_at ON public.invoices (due_at) WHERE due_at IS NOT NULL;

-- ============================================
-- COMMS_LOG TABLE
-- Stores all communication records (sms, email, call)
-- ============================================
CREATE TABLE IF NOT EXISTS public.comms_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'call')),
    direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
    to_address TEXT,
    from_address TEXT,
    subject TEXT,
    body TEXT,
    outcome TEXT,
    related_entity_id UUID,
    related_entity_type TEXT,
    context_ref JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comms_log_channel ON public.comms_log (channel);
CREATE INDEX IF NOT EXISTS idx_comms_log_related_entity ON public.comms_log (related_entity_id) WHERE related_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comms_log_created_at ON public.comms_log (created_at DESC);

-- ============================================
-- INTERACTIONS TABLE (for entity.add_interaction)
-- Stores interactions with entities
-- ============================================
CREATE TABLE IF NOT EXISTS public.interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call', 'sms', 'email', 'meeting', 'site_visit', 'other')),
    summary TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_entity_id ON public.interactions (entity_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON public.interactions (interaction_type);

-- ============================================
-- JOB_UPDATES TABLE (for job.add_progress_update)
-- Stores progress updates for jobs
-- ============================================
CREATE TABLE IF NOT EXISTS public.job_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    photo_refs JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_updates_job_id ON public.job_updates (job_id);

-- ============================================
-- PAYMENTS TABLE (for invoice.add_payment)
-- Stores payments against invoices
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    method TEXT CHECK (method IN ('cash', 'bank_transfer', 'card', 'other')),
    reference TEXT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments (invoice_id);
