-- Enable Row Level Security on the table if not already enabled
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- Drop the policy if it already exists to ensure this script is idempotent
DROP POLICY IF EXISTS "Allow service_role full access to rate_limit_attempts" ON public.rate_limit_attempts;

-- Create a permissive policy for the service_role
CREATE POLICY "Allow service_role full access to rate_limit_attempts"
ON public.rate_limit_attempts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- CRITICAL: Grant all permissions to service_role
GRANT ALL ON public.rate_limit_attempts TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- Set additional parameter for service role
-- This is needed to fix the "new row violates row-level security policy" error
ALTER TABLE public.rate_limit_attempts FORCE ROW LEVEL SECURITY;

-- Set a session parameter to identify service role connections
ALTER FUNCTION public.cleanup_old_rate_limits() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.cleanup_old_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits() TO service_role;

COMMENT ON POLICY "Allow service_role full access to rate_limit_attempts" ON public.rate_limit_attempts 
IS 'Grants unrestricted access to the rate_limit_attempts table for the service_role, ensuring administrative functions like rate limiting can operate correctly.'; 