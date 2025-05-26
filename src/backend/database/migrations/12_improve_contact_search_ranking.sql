-- Migration: Improve Contact Search Ranking
-- Description: Enhance the full-text search with better ranking for exact matches

-- Update the function for creating FTS documents to use weighted vectors
CREATE OR REPLACE FUNCTION update_contact_fts_document() 
RETURNS trigger AS $$
BEGIN
  NEW.fts_document := 
    -- Highest priority: Name fields (Weight A)
    setweight(to_tsvector('english', coalesce(NEW.first_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.last_name, '')), 'A') ||
    -- Medium-high priority: Contact info (Weight B)
    setweight(to_tsvector('english', coalesce(NEW.email, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.phone, '')), 'B') ||
    -- Medium priority: Company info (Weight C)
    setweight(to_tsvector('english', coalesce(NEW.company, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.job_title, '')), 'C') ||
    -- Lower priority: General info (Weight D)
    setweight(to_tsvector('english', coalesce(NEW.address, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(NEW.notes, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing contacts with the new weighted FTS documents
UPDATE contacts 
SET fts_document = 
  setweight(to_tsvector('english', coalesce(first_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(last_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(email, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(phone, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(company, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(job_title, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(address, '')), 'D') ||
  setweight(to_tsvector('english', coalesce(notes, '')), 'D');

-- Improved search function with better exact match handling
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
  -- Prepare a clean query string for exact matching
  DECLARE
    v_clean_query TEXT := trim(p_query);
  BEGIN
    RETURN QUERY
    WITH search_results AS (
      SELECT 
        c.*,
        CASE 
          -- Empty query case
          WHEN v_clean_query = '' OR v_clean_query IS NULL THEN 1.0
          
          -- Exact full name match (highest priority)
          WHEN LOWER(TRIM(c.first_name || ' ' || COALESCE(c.last_name, ''))) = LOWER(v_clean_query) THEN 10.0
          
          -- Exact first or last name match
          WHEN LOWER(c.first_name) = LOWER(v_clean_query) THEN 8.0
          WHEN LOWER(c.last_name) = LOWER(v_clean_query) THEN 7.0
          
          -- Exact email match
          WHEN LOWER(c.email) = LOWER(v_clean_query) THEN 6.0
          
          -- Name starts with query
          WHEN LOWER(c.first_name) LIKE LOWER(v_clean_query || '%') THEN 5.0
          WHEN LOWER(c.last_name) LIKE LOWER(v_clean_query || '%') THEN 4.0
          
          -- Name contains query
          WHEN LOWER(c.first_name) LIKE LOWER('%' || v_clean_query || '%') THEN 3.0
          WHEN LOWER(c.last_name) LIKE LOWER('%' || v_clean_query || '%') THEN 2.5
          
          -- Other fields contain query
          WHEN LOWER(c.email) LIKE LOWER('%' || v_clean_query || '%') THEN 2.0
          WHEN LOWER(c.phone) LIKE LOWER('%' || v_clean_query || '%') THEN 1.9
          WHEN LOWER(c.company) LIKE LOWER('%' || v_clean_query || '%') THEN 1.8
          
          -- Weighted FTS match with detailed ranking
          ELSE ts_rank_cd(c.fts_document, plainto_tsquery('english', v_clean_query), 32) * 1.5
        END AS rank_score
      FROM contacts c
      WHERE 
        c.user_id = p_user_id
        AND (
          v_clean_query = '' 
          OR v_clean_query IS NULL 
          -- FTS match
          OR c.fts_document @@ plainto_tsquery('english', v_clean_query)
          -- Exact full name match
          OR LOWER(TRIM(c.first_name || ' ' || COALESCE(c.last_name, ''))) = LOWER(v_clean_query)
          -- Partial name match
          OR LOWER(c.first_name) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.last_name) LIKE LOWER('%' || v_clean_query || '%')
          -- Other field matches
          OR LOWER(c.email) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.phone) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.company) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.job_title) LIKE LOWER('%' || v_clean_query || '%')
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
END;
$$ LANGUAGE plpgsql;

-- Add comment to the function
COMMENT ON FUNCTION search_contacts_optimized IS 'Optimized contact search with improved exact match ranking';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_contacts_optimized TO authenticated;