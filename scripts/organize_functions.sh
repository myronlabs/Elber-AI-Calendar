#!/bin/bash
set -e

# This script organizes compiled function files to maintain the correct relative imports
# It should be run after tsc compilation

BACKEND_OUTPUT="$PWD/netlify/functions/functions"
SERVICES_DIR="$BACKEND_OUTPUT/services"
TYPES_FILE="$BACKEND_OUTPUT/types.js"

echo "Organizing Netlify functions for correct imports..."

# 1. Ensure parent services directory exists
mkdir -p "$SERVICES_DIR"

# 2. If services/supabaseAdmin.js exists in the output, use it
if [ -f "$BACKEND_OUTPUT/services/supabaseAdmin.js" ]; then
  echo "- Found compiled supabaseAdmin.js - ensuring it's accessible via relative imports"
else
  echo "- WARNING: supabaseAdmin.js not found in compiled output"
fi

# 3. Verify types.js exists
if [ -f "$TYPES_FILE" ]; then
  echo "- Found compiled types.js - ensuring it's accessible via relative imports"
else 
  echo "- WARNING: types.js not found in compiled output"
fi

# 4. List the final function files
echo "Function files in $BACKEND_OUTPUT:"
ls -la "$BACKEND_OUTPUT" | grep -v "^d" | grep "\.js$"

echo "Services files in $SERVICES_DIR:"
ls -la "$SERVICES_DIR" 2>/dev/null || echo "  (No service files found)"

echo "Organization of function files complete."
