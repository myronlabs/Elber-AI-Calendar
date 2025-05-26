#!/bin/bash

# Deploy all Supabase Edge Functions
# Make sure you have Supabase CLI installed: npm install -g supabase

echo "Deploying Supabase Edge Functions..."

# Navigate to the root directory of your project
cd "$(dirname "$0")/.."

# Make sure Supabase CLI is available
if ! command -v supabase &> /dev/null; then
  echo "Supabase CLI not found. Please install it first: npm install -g supabase"
  exit 1
fi

# Make sure user is logged in
echo "Checking Supabase login status..."
supabase login

# Deploy the custom-auth-mailer function
echo "Deploying custom-auth-mailer Edge Function..."
supabase functions deploy custom-auth-mailer --project-ref tzwipktdyvijxsdpkfco

echo "Deployment completed!" 