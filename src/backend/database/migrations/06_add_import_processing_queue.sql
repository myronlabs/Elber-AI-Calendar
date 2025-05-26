-- Migration: 06_add_import_processing_queue.sql
-- Purpose: Create a table to store background contact import jobs

-- Add a new table for batch import processing queue
CREATE TABLE IF NOT EXISTS import_processing_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google', 'csv', etc.
  contacts_to_import JSONB NOT NULL, -- Array of contact identifiers to import
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_details JSONB,
  import_batch_id UUID,
  current_batch INTEGER DEFAULT 0,
  total_batches INTEGER,
  processed_count INTEGER DEFAULT 0,
  batch_size INTEGER DEFAULT 10
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS import_queue_user_id_idx ON import_processing_queue(user_id);
CREATE INDEX IF NOT EXISTS import_queue_status_idx ON import_processing_queue(status);
CREATE INDEX IF NOT EXISTS import_queue_created_at_idx ON import_processing_queue(created_at DESC);

-- Add RLS policy to ensure users can only see their own import jobs
ALTER TABLE import_processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see only their own import jobs" 
  ON import_processing_queue
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Only service role can insert, update or delete import jobs" 
  ON import_processing_queue
  USING (true)
  WITH CHECK (true);

-- Add a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_import_queue_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_import_queue_modified
BEFORE UPDATE ON import_processing_queue
FOR EACH ROW EXECUTE FUNCTION update_import_queue_modified_column();