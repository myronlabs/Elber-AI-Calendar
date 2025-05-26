-- Migration: Add recurring events functionality to calendar_events table

-- First, create an ENUM type for recurrence patterns to ensure type safety
CREATE TYPE public.recurrence_pattern_type AS ENUM (
  'daily',
  'weekly',
  'monthly', 
  'yearly',
  'custom'
);

-- Add recurrence-related columns with proper types
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_pattern public.recurrence_pattern_type; -- Type-safe enum
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1; -- e.g., every X days/weeks/months/years
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_day_of_week INTEGER[]; -- Array of days for weekly recurrence [0-6]
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_day_of_month INTEGER; -- Day of month for monthly recurrence
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_month INTEGER; -- Month for yearly recurrence
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMPTZ; -- When recurrence ends
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_count INTEGER; -- Number of occurrences
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT; -- iCalendar RRULE for complex patterns
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES public.calendar_events(event_id) ON DELETE CASCADE; -- For linking related events
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS is_exception BOOLEAN NOT NULL DEFAULT false; -- For exceptions to recurrence pattern
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS exception_date TIMESTAMPTZ; -- Original date this exception replaces
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS series_id UUID; -- For grouping events in the same series
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS recurrence_timezone TEXT; -- Store timezone for recurrence calculations

-- Add proper indexes for faster retrieval of recurring events
CREATE INDEX IF NOT EXISTS idx_calendar_events_recurring ON public.calendar_events(user_id, is_recurring);
CREATE INDEX IF NOT EXISTS idx_calendar_events_parent ON public.calendar_events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_series ON public.calendar_events(series_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range ON public.calendar_events(start_time, end_time);

-- Update RLS policies to ensure proper access
-- Note: We're recreating these policies completely to ensure they capture the new fields properly

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own calendar events" ON public.calendar_events;
CREATE POLICY "Users can create their own calendar events" 
  ON public.calendar_events 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own calendar events" ON public.calendar_events;
CREATE POLICY "Users can view their own calendar events" 
  ON public.calendar_events 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own calendar events" ON public.calendar_events;
CREATE POLICY "Users can update their own calendar events" 
  ON public.calendar_events 
  FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own calendar events" ON public.calendar_events;
CREATE POLICY "Users can delete their own calendar events" 
  ON public.calendar_events 
  FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);