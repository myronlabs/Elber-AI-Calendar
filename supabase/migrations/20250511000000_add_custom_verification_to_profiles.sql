-- Add is_custom_verified column to the profiles table with comprehensive security
-- This column tracks whether users have completed our custom email verification process

-- 1. Add the column with a NOT NULL constraint and a default value of false
-- This ensures all new users will require email verification by default
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_custom_verified BOOLEAN NOT NULL DEFAULT false;

-- 2. Update the handle_new_user() function to explicitly set is_custom_verified to false
-- for all new user registrations to ensure consistency
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, is_custom_verified)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url',
    false -- Explicitly set false to require email verification
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Set is_custom_verified to false for all existing users to enforce verification
UPDATE public.profiles 
SET is_custom_verified = false 
WHERE is_custom_verified IS NULL;

-- 4. Create an index for faster lookups when checking verification status during login
CREATE INDEX IF NOT EXISTS idx_profiles_verification ON public.profiles(id, is_custom_verified);

-- 5. Set up proper Row Level Security policies for the is_custom_verified field

-- Enable RLS on the profiles table if not already enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing conflicting policies if they exist
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON public.profiles;

-- Allow users to read their own profile (including verification status)
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Allow users to update their own profile EXCEPT the is_custom_verified field
CREATE POLICY "Users can update their own profile except verification status"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND is_custom_verified = OLD.is_custom_verified);

-- Allow service_role to manage all profiles including verification status
-- This is needed for our verification function to set is_custom_verified to true
CREATE POLICY "Service role can manage all profiles"
ON public.profiles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 6. Add a comment to the column for better documentation
COMMENT ON COLUMN public.profiles.is_custom_verified IS 
'Indicates whether the user has verified their email through our custom verification flow. 
This field should only be set to true by the verification function using the service role.'; 