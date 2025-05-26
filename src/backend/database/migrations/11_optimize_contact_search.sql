-- Migration: Optimize Contact Search
-- Description: Add Full-Text Search (FTS) with GIN indexes for faster contact searches

-- Add FTS document column if it doesn't exist
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS fts_document tsvector;

-- Create function to update FTS document
CREATE OR REPLACE FUNCTION update_contact_fts_document() 
RETURNS trigger AS $$
BEGIN
  NEW.fts_document := to_tsvector('english',
    coalesce(NEW.first_name, '') || ' ' ||
    coalesce(NEW.middle_name, '') || ' ' ||
    coalesce(NEW.last_name, '') || ' ' ||
    coalesce(NEW.nickname, '') || ' ' ||
    coalesce(NEW.email, '') || ' ' ||
    coalesce(NEW.phone, '') || ' ' ||
    coalesce(NEW.company, '') || ' ' ||
    coalesce(NEW.job_title, '') || ' ' ||
    coalesce(NEW.address, '') || ' ' ||
    coalesce(NEW.notes, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for FTS document updates
CREATE TRIGGER update_contacts_fts_document
BEFORE INSERT OR UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION update_contact_fts_document();

-- Populate FTS document for existing contacts
UPDATE contacts 
SET fts_document = to_tsvector('english',
  coalesce(first_name, '') || ' ' ||
  coalesce(middle_name, '') || ' ' ||
  coalesce(last_name, '') || ' ' ||
  coalesce(nickname, '') || ' ' ||
  coalesce(email, '') || ' ' ||
  coalesce(phone, '') || ' ' ||
  coalesce(company, '') || ' ' ||
  coalesce(job_title, '') || ' ' ||
  coalesce(address, '') || ' ' ||
  coalesce(notes, '')
);

-- Create GIN index on FTS document
CREATE INDEX IF NOT EXISTS idx_contacts_fts ON contacts USING GIN(fts_document);

-- Create compound index for user_id and updated_at
CREATE INDEX IF NOT EXISTS idx_contacts_user_updated ON contacts(user_id, updated_at DESC);

-- Create trigram indexes for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_contacts_first_name_trgm ON contacts USING gin(first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_last_name_trgm ON contacts USING gin(last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON contacts USING gin(email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_company_trgm ON contacts USING gin(company gin_trgm_ops);

-- Create optimized search function
CREATE OR REPLACE FUNCTION search_contacts_optimized(
  p_user_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  contact_id UUID,
  user_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  nickname TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  address TEXT,
  website TEXT,
  birthday DATE,
  notes TEXT,
  google_contact_id TEXT,
  import_source TEXT,
  import_batch_id UUID,
  imported_at TIMESTAMPTZ,
  fts_document tsvector,
  normalized_phone TEXT,
  match_score REAL
) AS $$
BEGIN
  RETURN QUERY
  WITH search_results AS (
    SELECT 
      c.*,
      CASE 
        WHEN p_query = '' OR p_query IS NULL THEN 1.0
        ELSE ts_rank(c.fts_document, plainto_tsquery('english', p_query))
      END AS rank_score
    FROM contacts c
    WHERE 
      c.user_id = p_user_id
      AND (
        p_query = '' 
        OR p_query IS NULL 
        OR c.fts_document @@ plainto_tsquery('english', p_query)
        OR c.first_name ILIKE '%' || p_query || '%'
        OR c.last_name ILIKE '%' || p_query || '%'
        OR c.email ILIKE '%' || p_query || '%'
        OR c.phone ILIKE '%' || p_query || '%'
        OR c.company ILIKE '%' || p_query || '%'
      )
  )
  SELECT 
    sr.contact_id,
    sr.user_id,
    sr.created_at,
    sr.updated_at,
    sr.first_name,
    sr.middle_name,
    sr.last_name,
    sr.nickname,
    sr.email,
    sr.phone,
    sr.company,
    sr.job_title,
    sr.address,
    sr.website,
    sr.birthday,
    sr.notes,
    sr.google_contact_id,
    sr.import_source,
    sr.import_batch_id,
    sr.imported_at,
    sr.fts_document,
    sr.normalized_phone,
    sr.rank_score::REAL
  FROM search_results sr
  ORDER BY sr.rank_score DESC, sr.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Add comment to the function
COMMENT ON FUNCTION search_contacts_optimized IS 'Optimized contact search with FTS and fuzzy matching';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_contacts_optimized TO authenticated;