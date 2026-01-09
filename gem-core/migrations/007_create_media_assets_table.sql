-- 007_create_media_assets_table.sql
-- Purpose: Enable media.* tools to function

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Asset identification
  file_ref text NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('photo', 'video', 'document', 'other')),

  -- Optional relationships
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,

  -- Location metadata
  suburb text,
  location_on_property text,

  -- Temporal metadata
  taken_at timestamptz,

  -- Generated content
  alt_text text,
  caption text,

  -- Classification
  tags text[] NOT NULL DEFAULT '{}',

  -- Technical metadata
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  storage_bucket text NOT NULL DEFAULT 'media',
  mime_type text,
  file_size_bytes integer,
  width_px integer,
  height_px integer,

  -- Processing status
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error text,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_label text NOT NULL DEFAULT 'system',

  CONSTRAINT media_assets_unique_file_ref UNIQUE (file_ref)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_media_assets_file_ref ON public.media_assets(file_ref);
CREATE INDEX IF NOT EXISTS idx_media_assets_inspection ON public.media_assets(inspection_id) WHERE inspection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_job ON public.media_assets(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_lead ON public.media_assets(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_type ON public.media_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON public.media_assets USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_media_assets_processing ON public.media_assets(processing_status) WHERE processing_status <> 'completed';
CREATE INDEX IF NOT EXISTS idx_media_assets_created ON public.media_assets(created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_media_assets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER trigger_media_assets_updated_at
BEFORE UPDATE ON public.media_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_media_assets_updated_at();

-- Realtime (guarded; skip if already added)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication p
    WHERE p.pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'media_assets'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.media_assets';
    END IF;
  END IF;
END
$$;

COMMENT ON TABLE public.media_assets IS 'Media asset registry for photos, videos, and documents. Enables media.* tools.';
COMMENT ON COLUMN public.media_assets.file_ref IS 'Unique reference to the file (storage path, URL, or external ID)';
COMMENT ON COLUMN public.media_assets.tags IS 'Classification tags: before, after, defect, exterior, interior, etc.';
COMMENT ON COLUMN public.media_assets.processing_status IS 'Status of background processing (alt text generation, etc.)';
