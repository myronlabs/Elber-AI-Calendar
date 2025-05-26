-- Add is_custom_verified column to the profiles table
-- This column is used to track whether users have completed the custom email verification process

-- Add the column if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_custom_verified BOOLEAN NOT NULL DEFAULT false;

-- Update the handle_new_user() function to include the is_custom_verified field
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, is_custom_verified)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url',
    false -- Set is_custom_verified to false by default for all new users
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure all existing users have the is_custom_verified field set to false
-- This is important to ensure all users must verify their email
UPDATE public.profiles 
SET is_custom_verified = false 
WHERE is_custom_verified IS NULL;

-- Create an index for faster lookups when checking verification status during login
CREATE INDEX IF NOT EXISTS idx_profiles_verification ON public.profiles(id, is_custom_verified); 