-- supabase/migrations/YYYYMMDDHHMMSS_create_user_oauth_tokens_table.sql

CREATE TABLE IF NOT EXISTS public.user_oauth_tokens (
    user_id UUID NOT NULL,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT, -- Refresh token is optional, but highly recommended
    expires_at TIMESTAMPTZ,
    scopes TEXT[],
    provider_user_id TEXT, -- Optional: The user's ID on the provider's system
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT user_oauth_tokens_pkey PRIMARY KEY (user_id, provider),
    CONSTRAINT user_oauth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
DECLARE
  _new RECORD;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on table update
CREATE TRIGGER handle_updated_at_user_oauth_tokens
BEFORE UPDATE ON public.user_oauth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Enable Row Level Security
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can select their own tokens
CREATE POLICY "Allow users to select their own OAuth tokens"
ON public.user_oauth_tokens
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own tokens (e.g., if frontend initiated part of it, though typically server-side)
CREATE POLICY "Allow users to insert their own OAuth tokens"
ON public.user_oauth_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own tokens (e.g., if client-side refresh happens, though server-side refresh is better)
CREATE POLICY "Allow users to update their own OAuth tokens"
ON public.user_oauth_tokens
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own tokens (for explicit disconnect)
CREATE POLICY "Allow users to delete their own OAuth tokens"
ON public.user_oauth_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- Optional: Add comments to table and columns
COMMENT ON TABLE public.user_oauth_tokens IS 'Stores OAuth tokens for users connecting to third-party providers like Google.';
COMMENT ON COLUMN public.user_oauth_tokens.user_id IS 'References the user in auth.users.';
COMMENT ON COLUMN public.user_oauth_tokens.provider IS 'The OAuth provider, e.g., 'google', 'microsoft'.';
COMMENT ON COLUMN public.user_oauth_tokens.access_token IS 'The access token provided by the OAuth provider.';
COMMENT ON COLUMN public.user_oauth_tokens.refresh_token IS 'The refresh token, used to obtain new access tokens.';
COMMENT ON COLUMN public.user_oauth_tokens.expires_at IS 'Timestamp when the access token expires.';
COMMENT ON COLUMN public.user_oauth_tokens.scopes IS 'Array of scopes granted by the user.';
COMMENT ON COLUMN public.user_oauth_tokens.provider_user_id IS 'The unique identifier for the user on the OAuth provider''s system.'; 