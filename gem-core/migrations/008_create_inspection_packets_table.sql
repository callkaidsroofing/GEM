-- 008_create_inspection_packets_table.sql
-- Purpose: Store normalized inspection packets for pipeline processing

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.inspection_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  schema_version text NOT NULL DEFAULT 'inspection_packet_v1',

  packet jsonb NOT NULL,

  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,

  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processed_at timestamptz,
  processing_error text,

  source text NOT NULL DEFAULT 'manual',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_label text NOT NULL DEFAULT 'system',

  CONSTRAINT inspection_packets_unique UNIQUE (inspection_id, schema_version)
);

CREATE INDEX IF NOT EXISTS idx_inspection_packets_inspection ON public.inspection_packets(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_packets_validation ON public.inspection_packets(validation_status);
CREATE INDEX IF NOT EXISTS idx_inspection_packets_processing ON public.inspection_packets(processing_status)
  WHERE processing_status <> 'completed';
CREATE INDEX IF NOT EXISTS idx_inspection_packets_schema ON public.inspection_packets(schema_version);

CREATE INDEX IF NOT EXISTS idx_inspection_packets_lead ON public.inspection_packets((packet->>'lead_id'));
CREATE INDEX IF NOT EXISTS idx_inspection_packets_defects ON public.inspection_packets USING gin((packet->'defects'));

CREATE OR REPLACE FUNCTION public.update_inspection_packets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_inspection_packets_updated_at ON public.inspection_packets;
CREATE TRIGGER trigger_inspection_packets_updated_at
BEFORE UPDATE ON public.inspection_packets
FOR EACH ROW
EXECUTE FUNCTION public.update_inspection_packets_updated_at();

-- Helper: packet stats (safe if keys exist but are not arrays)
CREATE OR REPLACE FUNCTION public.get_inspection_packet_stats(p_inspection_id uuid)
RETURNS TABLE (
  photo_count integer,
  measurement_count integer,
  defect_count integer,
  checklist_count integer,
  high_severity_defects integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN jsonb_typeof(packet->'photos') = 'array' THEN jsonb_array_length(packet->'photos') ELSE 0 END::integer,
    CASE WHEN jsonb_typeof(packet->'measurements') = 'array' THEN jsonb_array_length(packet->'measurements') ELSE 0 END::integer,
    CASE WHEN jsonb_typeof(packet->'defects') = 'array' THEN jsonb_array_length(packet->'defects') ELSE 0 END::integer,
    CASE WHEN jsonb_typeof(packet->'checklist') = 'array' THEN jsonb_array_length(packet->'checklist') ELSE 0 END::integer,
    COALESCE(
      (
        SELECT count(*)::integer
        FROM jsonb_array_elements(packet->'defects') AS d
        WHERE jsonb_typeof(packet->'defects') = 'array'
          AND d->>'severity' = 'high'
      ),
      0
    )
  FROM public.inspection_packets
  WHERE inspection_id = p_inspection_id
    AND schema_version = 'inspection_packet_v1'
  LIMIT 1;
END;
$$;

COMMENT ON TABLE public.inspection_packets IS 'Normalized inspection data packets for pipeline processing. Implements inspection_packet_v1 schema.';
