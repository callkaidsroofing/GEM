-- 008_create_inspection_packets_table.sql
-- Purpose: Store normalized inspection packets for pipeline processing
-- Enables the inspection_packet_v1 schema workflow

-- Create inspection_packets table
CREATE TABLE IF NOT EXISTS inspection_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to inspection
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,

  -- Schema versioning
  schema_version TEXT NOT NULL DEFAULT 'inspection_packet_v1',

  -- The normalized packet data
  packet JSONB NOT NULL,

  -- Validation tracking
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validation_errors JSONB DEFAULT '[]',

  -- Processing tracking
  processing_status TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,

  -- Source tracking
  source TEXT DEFAULT 'manual',
  source_metadata JSONB DEFAULT '{}',

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system',

  -- One packet per schema version per inspection
  CONSTRAINT unique_inspection_schema UNIQUE (inspection_id, schema_version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inspection_packets_inspection ON inspection_packets(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_packets_validation ON inspection_packets(validation_status);
CREATE INDEX IF NOT EXISTS idx_inspection_packets_processing ON inspection_packets(processing_status)
  WHERE processing_status != 'completed';
CREATE INDEX IF NOT EXISTS idx_inspection_packets_schema ON inspection_packets(schema_version);

-- JSONB indexes for packet queries
CREATE INDEX IF NOT EXISTS idx_inspection_packets_lead ON inspection_packets((packet->>'lead_id'));
CREATE INDEX IF NOT EXISTS idx_inspection_packets_defects ON inspection_packets USING GIN ((packet->'defects'));

-- Update trigger
CREATE OR REPLACE FUNCTION update_inspection_packets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inspection_packets_updated_at
  BEFORE UPDATE ON inspection_packets
  FOR EACH ROW
  EXECUTE FUNCTION update_inspection_packets_updated_at();

-- Helper function to get packet stats
CREATE OR REPLACE FUNCTION get_inspection_packet_stats(p_inspection_id UUID)
RETURNS TABLE (
  photo_count INTEGER,
  measurement_count INTEGER,
  defect_count INTEGER,
  checklist_count INTEGER,
  high_severity_defects INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(jsonb_array_length(packet->'photos'), 0)::INTEGER AS photo_count,
    COALESCE(jsonb_array_length(packet->'measurements'), 0)::INTEGER AS measurement_count,
    COALESCE(jsonb_array_length(packet->'defects'), 0)::INTEGER AS defect_count,
    COALESCE(jsonb_array_length(packet->'checklist'), 0)::INTEGER AS checklist_count,
    COALESCE(
      (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(packet->'defects') AS d
       WHERE d->>'severity' = 'high'),
      0
    ) AS high_severity_defects
  FROM inspection_packets
  WHERE inspection_id = p_inspection_id
    AND schema_version = 'inspection_packet_v1'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE inspection_packets IS 'Normalized inspection data packets for pipeline processing. Implements inspection_packet_v1 schema.';
COMMENT ON COLUMN inspection_packets.packet IS 'JSONB containing the normalized inspection data following the schema_version schema';
COMMENT ON COLUMN inspection_packets.validation_status IS 'Whether the packet passed schema validation';
COMMENT ON COLUMN inspection_packets.processing_status IS 'Status of downstream processing (quote generation, etc.)';
