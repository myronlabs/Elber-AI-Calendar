-- Migration: Fix Search Contacts Phone Fields
-- Description: Add missing mobile_phone and work_phone fields to search_contacts_optimized function

-- Drop existing function
DROP FUNCTION IF EXISTS search_contacts_optimized(uuid, text, integer, integer, text[]);

-- Create improved search_contacts_optimized function with all phone fields
CREATE OR REPLACE FUNCTION search_contacts_optimized(
  p_user_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_job_title_keywords TEXT[] DEFAULT NULL
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
  mobile_phone TEXT,
  work_phone TEXT,
  company TEXT,
  job_title TEXT,
  department TEXT,
  street_address TEXT,
  street_address_2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT,
  formatted_address TEXT,
  social_linkedin TEXT,
  social_twitter TEXT,
  tags TEXT[],
  preferred_contact_method TEXT,
  timezone TEXT,
  language TEXT,
  address TEXT,
  website TEXT,
  birthday DATE,
  notes TEXT,
  google_contact_id TEXT,
  import_source VARCHAR(50),
  import_batch_id UUID,
  imported_at TIMESTAMPTZ,
  fts_document tsvector,
  normalized_phone TEXT,
  match_score REAL
) AS $$
DECLARE
  v_clean_query TEXT := trim(p_query);
  has_job_title_keywords BOOLEAN := p_job_title_keywords IS NOT NULL AND array_length(p_job_title_keywords, 1) > 0;
  exec_title_query BOOLEAN := FALSE;
BEGIN
  -- Performance optimization: Determine if the search query itself contains executive terms
  IF v_clean_query <> '' THEN
    exec_title_query := 
      LOWER(v_clean_query) LIKE '%executive%' OR 
      LOWER(v_clean_query) LIKE '%vp%' OR 
      LOWER(v_clean_query) LIKE '%vice president%' OR 
      LOWER(v_clean_query) LIKE '%chief%' OR 
      LOWER(v_clean_query) LIKE '%ceo%' OR 
      LOWER(v_clean_query) LIKE '%cfo%' OR 
      LOWER(v_clean_query) LIKE '%cto%' OR 
      LOWER(v_clean_query) LIKE '%c-level%' OR
      LOWER(v_clean_query) LIKE '%director%';
  END IF;

  RETURN QUERY
  WITH search_results AS (
    SELECT 
      c.*,
      -- Job title match calculation - moved to a separate field for efficiency
      CASE WHEN has_job_title_keywords THEN
        EXISTS (
          SELECT 1 
          FROM unnest(p_job_title_keywords) as kw 
          WHERE LOWER(c.job_title) LIKE LOWER('%' || kw || '%')
        )
      ELSE FALSE
      END AS is_job_title_match,
      
      -- Query match calculation - for better performance
      CASE WHEN v_clean_query <> '' THEN 
        LOWER(c.job_title) LIKE LOWER('%' || v_clean_query || '%')
      ELSE FALSE
      END AS query_matches_job_title,
      
      -- Calculate the base score for ranking
      CASE 
        -- Empty query case
        WHEN v_clean_query = '' OR v_clean_query IS NULL THEN 1.0
        
        -- Exact full name match (high priority)
        WHEN LOWER(TRIM(c.first_name || ' ' || COALESCE(c.last_name, ''))) = LOWER(v_clean_query) THEN 9.0
        
        -- Exact first or last name match
        WHEN LOWER(c.first_name) = LOWER(v_clean_query) THEN 8.0
        WHEN LOWER(c.last_name) = LOWER(v_clean_query) THEN 7.0
        
        -- Exact email match
        WHEN LOWER(c.email) = LOWER(v_clean_query) THEN 6.0
        
        -- Name starts with query
        WHEN LOWER(c.first_name) LIKE LOWER(v_clean_query || '%') THEN 5.0
        WHEN LOWER(c.last_name) LIKE LOWER(v_clean_query || '%') THEN 4.5
        
        -- Name contains query
        WHEN LOWER(c.first_name) LIKE LOWER('%' || v_clean_query || '%') THEN 4.0
        WHEN LOWER(c.last_name) LIKE LOWER('%' || v_clean_query || '%') THEN 3.5
        
        -- Other fields contain query (including mobile_phone and work_phone)
        WHEN LOWER(c.email) LIKE LOWER('%' || v_clean_query || '%') THEN 3.0
        WHEN LOWER(c.phone) LIKE LOWER('%' || v_clean_query || '%') THEN 2.5
        WHEN LOWER(c.mobile_phone) LIKE LOWER('%' || v_clean_query || '%') THEN 2.5
        WHEN LOWER(c.work_phone) LIKE LOWER('%' || v_clean_query || '%') THEN 2.5
        WHEN LOWER(c.company) LIKE LOWER('%' || v_clean_query || '%') THEN 2.0
        WHEN LOWER(c.job_title) LIKE LOWER('%' || v_clean_query || '%') THEN 1.8
        
        -- Weighted FTS match with detailed ranking
        ELSE ts_rank_cd(c.fts_document, plainto_tsquery('english', v_clean_query), 32) * 1.5
      END AS base_score
    FROM contacts c
    WHERE 
      c.user_id = p_user_id
      AND (
        -- If query is empty, include all contacts
        (v_clean_query = '' OR v_clean_query IS NULL)
        OR
        -- Otherwise, include contacts matching the query
        (
          -- FTS match  
          c.fts_document @@ plainto_tsquery('english', v_clean_query)
          -- Exact full name match
          OR LOWER(TRIM(c.first_name || ' ' || COALESCE(c.last_name, ''))) = LOWER(v_clean_query)
          -- Partial name match
          OR LOWER(c.first_name) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.last_name) LIKE LOWER('%' || v_clean_query || '%')
          -- Other field matches (including mobile_phone and work_phone)
          OR LOWER(c.email) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.phone) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.mobile_phone) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.work_phone) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.company) LIKE LOWER('%' || v_clean_query || '%')
          OR LOWER(c.job_title) LIKE LOWER('%' || v_clean_query || '%')
        )
      )
  ),
  final_results AS (
    SELECT 
      sr.*,
      -- Final score calculation with adjustments for job title priorities
      CASE
        -- Executive search optimization: highest score for job title matches
        WHEN sr.is_job_title_match THEN 
          CASE 
            -- Query also matches job title (double match)
            WHEN sr.query_matches_job_title THEN 20.0
            -- Job title match only
            ELSE 15.0
          END
        -- If query is related to executives but contact doesn't match job keywords
        WHEN exec_title_query AND NOT sr.is_job_title_match THEN
          -- Boost slightly but still below actual matches
          GREATEST(sr.base_score, 3.0)
        -- Standard search score
        ELSE sr.base_score
      END AS match_score
    FROM search_results sr
    WHERE 
      -- If job title keywords are provided, filter by them when requested
      (NOT has_job_title_keywords) OR 
      (has_job_title_keywords AND 
        -- If query is exec-related or empty, only show matching job titles
        ((exec_title_query OR v_clean_query = '') AND sr.is_job_title_match) OR
        -- For other queries, show all results but prioritize matches
        (NOT exec_title_query AND v_clean_query <> '')
      )
  )
  
  SELECT 
    fr.contact_id,
    fr.user_id,
    fr.created_at,
    fr.updated_at,
    fr.first_name,
    fr.middle_name,
    fr.last_name,
    fr.nickname,
    fr.email,
    fr.phone,
    fr.mobile_phone,
    fr.work_phone,
    fr.company,
    fr.job_title,
    fr.department,
    fr.street_address,
    fr.street_address_2,
    fr.city,
    fr.state_province,
    fr.postal_code,
    fr.country,
    fr.formatted_address,
    fr.social_linkedin,
    fr.social_twitter,
    fr.tags,
    fr.preferred_contact_method,
    fr.timezone,
    fr.language,
    fr.address,
    fr.website,
    fr.birthday,
    fr.notes,
    fr.google_contact_id,
    fr.import_source,
    fr.import_batch_id,
    fr.imported_at,
    fr.fts_document,
    fr.normalized_phone,
    fr.match_score::REAL
  FROM final_results fr
  ORDER BY fr.match_score DESC, fr.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Add comment to the function
COMMENT ON FUNCTION search_contacts_optimized IS 'Highly optimized contact search with all phone fields (phone, mobile_phone, work_phone) and intelligent job title filtering';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_contacts_optimized TO authenticated; 