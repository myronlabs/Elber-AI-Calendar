#!/bin/bash

# This script applies the migration to fix the RLS policy for rate limits

# Set the absolute path to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$PROJECT_ROOT"

# Check for required environment variables
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set."
  echo "Please set your Supabase access token first:"
  echo "export SUPABASE_ACCESS_TOKEN=your_token"
  exit 1
fi

# Get Supabase project ID from .env file if available
SUPABASE_PROJECT_ID=""
if [ -f "$PROJECT_ROOT/.env" ]; then
  SUPABASE_PROJECT_ID=$(grep SUPABASE_PROJECT_ID "$PROJECT_ROOT/.env" | cut -d '=' -f2)
fi

# If not found in .env, ask for it
if [ -z "$SUPABASE_PROJECT_ID" ]; then
  echo "Supabase project ID not found in .env file."
  # Default to "tzwipktdyvijxsdpkfco" if it's available
  SUPABASE_PROJECT_ID="tzwipktdyvijxsdpkfco"
  # Could add a step to ask for project ID here if needed
fi

echo "Applying migration to fix rate limit RLS policy for Supabase project: $SUPABASE_PROJECT_ID"

# Apply the migration
npx supabase migration up \
  --project-ref "$SUPABASE_PROJECT_ID" \
  --db-url "postgresql://postgres:postgres@localhost:54322/postgres" \
  --target-migration "20250521000000_add_service_role_rls_for_rate_limit.sql"

# Check if the migration succeeded
if [ $? -eq 0 ]; then
  echo "✅ Migration applied successfully!"
else
  echo "❌ Failed to apply migration. Please check the error messages above."
  echo "You may need to apply the migration manually through the Supabase dashboard."
  echo "The migration file is: supabase/migrations/20250521000000_add_service_role_rls_for_rate_limit.sql"
fi

echo ""
echo "Steps to apply manually if the automatic migration failed:"
echo "1. Go to your Supabase dashboard at https://app.supabase.com"
echo "2. Select your project: $SUPABASE_PROJECT_ID"
echo "3. Go to 'SQL Editor'"
echo "4. Copy the contents of supabase/migrations/20250521000000_add_service_role_rls_for_rate_limit.sql"
echo "5. Run the SQL in the editor"
echo ""

exit 0