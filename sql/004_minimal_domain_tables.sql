-- Minimal domain tables for acceptance tests
-- Tables: notes, tasks, leads, quotes, quote_line_items

-- ============================================
-- NOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL CHECK (domain IN ('business', 'personal', 'both')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    entity_refs JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_domain ON public.notes (domain);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes (created_at DESC);

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    domain TEXT NOT NULL CHECK (domain IN ('business', 'personal', 'both')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    due_at TIMESTAMPTZ,
    context_ref JSONB,
    completed_at TIMESTAMPTZ,
    completion_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_domain ON public.tasks (domain);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON public.tasks (due_at) WHERE due_at IS NOT NULL;

-- ============================================
-- LEADS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    suburb TEXT NOT NULL,
    service TEXT DEFAULT 'unknown',
    source TEXT CHECK (source IN ('gmb', 'google_ads', 'meta', 'referral', 'repeat', 'other')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'inspection_scheduled', 'quoted', 'won', 'lost')),
    notes TEXT,
    lost_reason TEXT,
    photo_links JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on phone for keyed idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_unique ON public.leads (phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_suburb ON public.leads (suburb);

-- ============================================
-- QUOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    inspection_id UUID,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    tax_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    labour_cents INTEGER NOT NULL DEFAULT 0,
    materials_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    accepted_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,
    declined_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_lead_id ON public.quotes (lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes (status);

-- ============================================
-- QUOTE LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.quote_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price_cents INTEGER NOT NULL,
    line_total_cents INTEGER NOT NULL,
    item_type TEXT DEFAULT 'labour' CHECK (item_type IN ('labour', 'materials', 'other')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote_id ON public.quote_line_items (quote_id);
