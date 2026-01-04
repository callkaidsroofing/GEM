-- Migration: Create entities table
-- Purpose: Store entity records (clients, suppliers, partners, friends, leads, other)
-- Required by: entity.create, entity.update, entity.search, entity.get

CREATE TABLE IF NOT EXISTS entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    name text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for searching by type
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

-- Index for name search
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

-- Index for created_at ordering
CREATE INDEX IF NOT EXISTS idx_entities_created_at ON entities(created_at DESC);

COMMENT ON TABLE entities IS 'CKR-CORE entity records for clients, suppliers, partners, and other contacts';
COMMENT ON COLUMN entities.type IS 'Entity type: client, supplier, partner, friend, lead, other';
COMMENT ON COLUMN entities.metadata IS 'Flexible metadata including contact info and notes';
