-- Elber Platform Database Schema for Supabase (PostgreSQL)
-- Ensure RLS is enabled for all tables that store user-specific data.

-- Enable UUID-OSSP extension for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles Table
-- Stores additional user information, linked to Supabase auth.users table.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY, -- Matches auth.users.id, removed default uuid_generate_v4() as it comes from auth.users
    updated_at TIMESTAMPTZ DEFAULT now(),
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    is_custom_verified BOOLEAN NOT NULL DEFAULT false, -- Track custom email verification status
    -- Add any other profile-specific fields here

    CONSTRAINT fk_user FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add documentation comment
COMMENT ON COLUMN public.profiles.is_custom_verified IS 
'Indicates whether the user has verified their email through our custom verification flow. 
This field should only be set to true by the verification function using the service role.';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Profile Table
-- Allow users to read their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Allow users to update their own profile EXCEPT the is_custom_verified field
DROP POLICY IF EXISTS "Users can update their own profile except verification status" ON public.profiles;
CREATE POLICY "Users can update their own profile except verification status"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND is_custom_verified = OLD.is_custom_verified);

-- Allow service_role to manage all profiles including verification status
DROP POLICY IF EXISTS "Service role can manage all profiles" ON public.profiles;
CREATE POLICY "Service role can manage all profiles"
ON public.profiles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create index for faster verification status lookups
CREATE INDEX IF NOT EXISTS idx_profiles_verification ON public.profiles(id, is_custom_verified);

-- Calendar Events Table
CREATE TABLE IF NOT EXISTS public.calendar_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_all_day BOOLEAN NOT NULL DEFAULT false, -- Indicates if this is an all-day event
    location TEXT,
    google_event_id TEXT, -- For Google Calendar sync
    zoom_meeting_id TEXT -- For Zoom meeting sync
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
-- RLS Policy Example (Users can only manage their own calendar events):
DROP POLICY IF EXISTS "User can manage their own calendar events" ON public.calendar_events;
CREATE POLICY "User can manage their own calendar events" ON public.calendar_events
FOR ALL USING (auth.uid() = user_id);

-- Contacts Table
CREATE TABLE IF NOT EXISTS public.contacts (
    contact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    company TEXT,
    notes TEXT,
    google_contact_id TEXT -- For Google Contacts sync
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
-- RLS Policy Example (Users can only manage their own contacts):
-- CREATE POLICY "User can manage their own contacts" ON public.contacts
-- FOR ALL USING (auth.uid() = user_id);

-- Integrations Table
-- Stores OAuth tokens and integration-specific data.
CREATE TABLE IF NOT EXISTS public.integrations (
    integration_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- e.g., 'google', 'zoom'
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scopes TEXT[], -- Array of granted scopes
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, provider) -- Ensure only one integration per provider per user
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
-- RLS Policy Example (Users can only manage their own integrations):
-- CREATE POLICY "User can manage their own integrations" ON public.integrations
-- FOR ALL USING (auth.uid() = user_id);

-- Function to automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to tables that have an 'updated_at' column
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_integrations_updated_at ON public.integrations;
CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user entries and populate public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, is_custom_verified)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url', -- Assuming avatar_url might also come from metadata
    false -- Explicitly set false to require email verification for all new users
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call handle_new_user on new auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- Drop if exists to prevent errors on re-run
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Note: Supabase Auth handles the 'users' table automatically in the 'auth' schema.
-- This schema assumes you will link user-specific data via the 'user_id' (which is auth.uid()) in your tables.
-- Review and adjust RLS policies according to your application's specific security requirements.

-- Conversation History Table
-- Stores the history of messages for each user to maintain conversation context.
CREATE TABLE IF NOT EXISTS public.conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References an abstract user concept, not necessarily public.profiles.id directly unless desired.
                           -- If RLS is needed, ensure user_id matches auth.uid() or a link to it.
    message_object JSONB NOT NULL, -- Stores the complete OpenAI message object
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for efficient querying by user_id and creation time
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_id_created_at ON public.conversation_history (user_id, created_at);

-- Row Level Security (RLS)
-- Consider enabling RLS if this table will store sensitive conversation data.
-- Example: Users can only access their own conversation history.
-- ALTER TABLE public.conversation_history ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can manage their own conversation history"
--   ON public.conversation_history FOR ALL
--   USING (auth.uid() = user_id);
-- CREATE POLICY "Allow service_role to bypass RLS"
--   ON public.conversation_history FOR ALL
--   TO service_role
--   USING (true);

-- Trigger for updated_at (if you add an updated_at column, which is not currently in the spec)
-- If you add an 'updated_at' TIMESTAMPTZ DEFAULT now() column:
-- DROP TRIGGER IF EXISTS update_conversation_history_updated_at ON public.conversation_history;
-- CREATE TRIGGER update_conversation_history_updated_at
-- BEFORE UPDATE ON public.conversation_history
-- FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Verification Codes Table
-- Stores temporary codes for email verification.
CREATE TABLE IF NOT EXISTS public.verification_codes (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL, -- Added based on NOT NULL constraint error
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'), -- Ensures codes expire
    PRIMARY KEY (user_id, code) -- Assuming a user can't have the same code twice
);

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- POLICY: Allow service_role to perform all operations on verification_codes
-- This is crucial for the signup function to insert codes.
DROP POLICY IF EXISTS "Allow service_role full access to verification_codes" ON public.verification_codes;
CREATE POLICY "Allow service_role full access to verification_codes"
ON public.verification_codes
FOR ALL
TO service_role        -- Explicitly for service_role
USING (true)
WITH CHECK (true);

-- POLICY (Optional): Allow users to delete their own codes if needed by any flow
-- (e.g. if a user requests a new code, old one might be deleted by user's session)
-- However, the current verify-email function deletes codes using service_role.
-- CREATE POLICY "Users can delete their own verification codes"
-- ON public.verification_codes
-- FOR DELETE
-- USING (auth.uid() = user_id);

-- Consider an index on created_at if you plan to clear out old codes periodically
CREATE INDEX IF NOT EXISTS idx_verification_codes_created_at ON public.verification_codes (created_at);

-- Trigger for updated_at (if you add an updated_at column, which is not currently in the spec)
ALTER TABLE public.conversation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own conversation history" ON public.conversation_history;
CREATE POLICY "Users can manage their own conversation history"
  ON public.conversation_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow service_role to bypass RLS" ON public.conversation_history;
CREATE POLICY "Allow service_role to bypass RLS"
  ON public.conversation_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
