-- 007_create_media_assets_table.sql
-- Purpose: Enable media.* tools to function
-- Creates the media_assets table for storing photo/video/document references

-- Create media_assets table
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Asset identification
  file_ref TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('photo', 'video', 'document', 'other')),

  -- Relationships (all optional, asset can be standalone)
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,

  -- Location metadata
  suburb TEXT,
  location_on_property TEXT,

  -- Temporal metadata
  taken_at TIMESTAMPTZ,

  -- Generated content
  alt_text TEXT,
  caption TEXT,

  -- Classification
  tags TEXT[] DEFAULT '{}',

  -- Technical metadata
  metadata JSONB DEFAULT '{}',
  storage_path TEXT,
  storage_bucket TEXT DEFAULT 'media',
  mime_type TEXT,
  file_size_bytes INTEGER,
  width_px INTEGER,
  height_px INTEGER,

  -- Processing status
  processing_status TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system',

  -- Constraints
  CONSTRAINT unique_file_ref UNIQUE (file_ref)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_media_assets_file_ref ON media_assets(file_ref);
CREATE INDEX IF NOT EXISTS idx_media_assets_inspection ON media_assets(inspection_id) WHERE inspection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_job ON media_assets(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_lead ON media_assets(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON media_assets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_media_assets_processing ON media_assets(processing_status) WHERE processing_status != 'completed';
CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC);

-- Enable realtime for media_assets
ALTER PUBLICATION supabase_realtime ADD TABLE media_assets;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_media_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_media_assets_updated_at
  BEFORE UPDATE ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_media_assets_updated_at();

-- Comments
COMMENT ON TABLE media_assets IS 'Media asset registry for photos, videos, and documents. Enables media.* tools.';
COMMENT ON COLUMN media_assets.file_ref IS 'Unique reference to the file (storage path, URL, or external ID)';
COMMENT ON COLUMN media_assets.asset_type IS 'Type of asset: photo, video, document, or other';
COMMENT ON COLUMN media_assets.tags IS 'Classification tags: before, after, defect, exterior, interior, etc.';
COMMENT ON COLUMN media_assets.processing_status IS 'Status of background processing (alt text generation, etc.)';
