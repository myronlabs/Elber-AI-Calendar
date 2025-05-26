#!/bin/bash

# Check if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set."
  echo "Please make sure your .env file is loaded or export these variables manually."
  exit 1
fi

# Extract only the hostname part from SUPABASE_URL
SUPABASE_HOST=$(echo $SUPABASE_URL | sed -e 's|^https://||' -e 's|/.*$||')

# Set up PGPASSWORD for passwordless connection
export PGPASSWORD=$SUPABASE_SERVICE_ROLE_KEY

echo "Applying verification_codes table fix..."

# Run the SQL migration file
psql -h $SUPABASE_HOST -U postgres -d postgres -f src/backend/database/migrations/02_update_verification_codes.sql

if [ $? -eq 0 ]; then
  echo "Migration applied successfully!"
else
  echo "Error applying migration. Please check the error message above."
  exit 1
fi

echo "Verifying RLS policy..."
psql -h $SUPABASE_HOST -U postgres -d postgres -c "SELECT * FROM pg_policies WHERE tablename = 'verification_codes';"

echo "Done!" 