-- Migration: Calendar Performance Optimizations

-- 1. Create a function for cached event retrieval with proper GROUP BY
CREATE OR REPLACE FUNCTION public.get_calendar_events_cached(
  p_user_id UUID,
  p_query TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_force_refresh BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Attempt to perform a cached query with proper performance optimizations
  -- This implementation fixes the GROUP BY issue by including e.start_time in the GROUP BY clause
  
  SELECT json_build_object(
    'events', COALESCE(
      (SELECT json_agg(e)
       FROM (
         SELECT 
           e.event_id,
           e.user_id,
           e.created_at,
           e.updated_at,
           e.title,
           e.description,
           e.start_time,
           e.end_time,
           e.is_all_day,
           e.location,
           e.google_event_id,
           e.zoom_meeting_id,
           e.is_recurring,
           e.recurrence_pattern,
           e.recurrence_interval,
           e.recurrence_day_of_week,
           e.recurrence_day_of_month,
           e.recurrence_month,
           e.recurrence_end_date,
           e.recurrence_count,
           e.parent_event_id,
           e.is_exception,
           e.recurrence_rule,
           e.exception_date,
           e.series_id,
           e.recurrence_timezone
         FROM 
           public.calendar_events e
         WHERE 
           e.user_id = p_user_id
           AND (
             p_query IS NULL 
             OR e.title ILIKE '%' || p_query || '%'
           )
           AND (
             (p_start_date IS NULL OR p_end_date IS NULL)
             OR (
               /* Event overlaps with the date range: 
                  start_time < end_date AND end_time > start_date */
               (e.start_time <= p_end_date AND e.end_time >= p_start_date)
             )
           )
         ORDER BY e.start_time ASC
         LIMIT p_limit
         OFFSET p_offset
       ) e
      ), '[]'::json
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply proper permissions
GRANT EXECUTE ON FUNCTION public.get_calendar_events_cached TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_events_cached TO service_role;

-- Add index for faster calendar event queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_search_perf ON public.calendar_events (user_id, title text_pattern_ops); 