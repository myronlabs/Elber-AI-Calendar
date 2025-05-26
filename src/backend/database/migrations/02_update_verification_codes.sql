-- Drop the existing verification_codes table and recreate it with the correct schema
DROP TABLE IF EXISTS public.verification_codes CASCADE;

-- Recreate verification_codes table with the correct schema
CREATE TABLE IF NOT EXISTS public.verification_codes (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL, -- Added NOT NULL constraint
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'), -- Ensures codes expire
    PRIMARY KEY (user_id, code) -- Composite primary key
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_created_at ON public.verification_codes (created_at);

-- Setup Row Level Security
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- POLICY: Allow service_role to perform all operations on verification_codes
DROP POLICY IF EXISTS "Allow service_role full access to verification_codes" ON public.verification_codes;
CREATE POLICY "Allow service_role full access to verification_codes"
ON public.verification_codes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Make sure the anon role can also insert (for client-side signup operations)
DROP POLICY IF EXISTS "Allow anon insert access to verification_codes" ON public.verification_codes;
CREATE POLICY "Allow anon insert access to verification_codes"
ON public.verification_codes
FOR INSERT
TO anon
WITH CHECK (true);

-- Grant permissions explicitly
GRANT ALL ON public.verification_codes TO service_role;
GRANT INSERT ON public.verification_codes TO anon;
GRANT USAGE ON SCHEMA public TO service_role, anon;

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_verification_codes()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM verification_codes WHERE expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for cleanup
DROP TRIGGER IF EXISTS trigger_cleanup_expired_verification_codes ON verification_codes;
CREATE TRIGGER trigger_cleanup_expired_verification_codes
  AFTER INSERT ON verification_codes
  EXECUTE PROCEDURE cleanup_expired_verification_codes(); 