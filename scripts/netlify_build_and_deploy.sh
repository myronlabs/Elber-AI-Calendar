#!/usr/bin/env bash

# Elber - Production Build and Deploy Script
# This script builds the frontend and backend/functions.
# If 'deploy' is passed as the first argument, it also deploys to Netlify.
# When run by Netlify's build system (without 'deploy' arg), it only performs builds.

# Create a temporary flag file to prevent recursive execution
FLAG_FILE="/tmp/netlify_build_running.flag"

# Check if we're being called recursively
if [ -f "$FLAG_FILE" ]; then
  echo "⚠️ Build script detected recursive execution. Skipping duplicate run."
  echo "    If this is unexpected, manually remove $FLAG_FILE and try again."
  exit 0
fi

# Create flag file to prevent recursive execution
touch "$FLAG_FILE"

# Ensure flag file is removed on exit
trap 'rm -f "$FLAG_FILE"' EXIT

# Strict mode
set -eo pipefail

echo "🚀 ELBER PRODUCTION BUILD AND DEPLOY"
echo "======================================"

# Determine Project Root Directory (assuming script is in ${PROJECT_ROOT}/scripts/)
PROJECT_ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)
cd "${PROJECT_ROOT_DIR}" || exit 1
echo "Project root: ${PROJECT_ROOT_DIR}"

# Load environment variables from .env file if it exists
ENV_FILE="${PROJECT_ROOT_DIR}/.env"
if [ -f "${ENV_FILE}" ]; then
  echo "ℹ️ Loading environment variables from ${ENV_FILE}..."
  set -o allexport
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
  set +o allexport
else
  echo "⚠️ Warning: ${ENV_FILE} not found. Some operations might fail or use defaults."
fi

# Configuration (can be overridden by .env variables)
export NODE_ENV=${NODE_ENV:-production}
# Disable punycode deprecation warning (DEP0040) - temporary fix until dependencies update
# This must also be set in Netlify's environment variables for runtime functions
export NODE_OPTIONS="${NODE_OPTIONS:-"--disable-warning=DEP0040"}"
NETLIFY_SITE_ID=${NETLIFY_SITE_ID:-}
NETLIFY_AUTH_TOKEN=${NETLIFY_AUTH_TOKEN:-}
PRODUCTION_MODE=${PRODUCTION_MODE:-true} # Set to true for --prod deploy, false for draft

# Define directories
FRONTEND_DIR="${PROJECT_ROOT_DIR}/src/frontend"
FUNCTIONS_DIR_RELATIVE_TO_ROOT="src/backend/functions" # Relative to project root for Netlify
NETLIFY_PUBLISH_DIR_RELATIVE_TO_ROOT="src/frontend/dist" # Output of Vite build from project root

# --- Ensure Netlify Function Directories Exist (as per original script) ---
echo "🔧 Ensuring Netlify function directories exist..."
mkdir -p "${PROJECT_ROOT_DIR}/${FUNCTIONS_DIR_RELATIVE_TO_ROOT}"
echo "✅ Netlify function directories ensured."

# --- Install Root Dependencies ---
echo "Installing root dependencies..."
if npm install --prefer-offline --no-audit --progress=false; then
  echo "✅ Root npm install successful."
else
  echo "🚨 Error: Root npm install failed. Exiting."
  exit 1
fi

# --- Sanity Checks ---
echo "🔎 Performing sanity checks..."
# Check for critical directories
if [ ! -d "${FRONTEND_DIR}" ]; then
  echo "🚨 Error: Frontend directory '${FRONTEND_DIR}' not found." >&2
  exit 1
fi

# --- Frontend Build ---
echo "⚙️ Preparing and building frontend application in ${FRONTEND_DIR}..."
cd "${FRONTEND_DIR}" # Change to frontend directory

echo "   Cleaning up previous build artifacts and Vite cache in ${FRONTEND_DIR}..."
rm -rf "./dist" # It's ${FRONTEND_DIR}/dist but we are already in FRONTEND_DIR
rm -rf "./node_modules/.vite"
# rm -rf "./.turbo" # Uncomment if you use turbo
echo "   ✅ Cleanup complete."

echo "   Checking Node.js and npm versions..."
node -v
npm -v

# Check if Vite is already installed (check in root node_modules for workspace setup)
VITE_LOCAL_PATH="./node_modules/vite/bin/vite.js"
VITE_ROOT_PATH="${PROJECT_ROOT_DIR}/node_modules/vite/bin/vite.js"

# First check if we can run vite build directly
if npm run build --dry-run >/dev/null 2>&1; then
  echo "   ✅ Vite is available via npm scripts. Skipping dependency check."
  INSTALL_SUCCESS=true
elif [ -f "${VITE_LOCAL_PATH}" ] || [ -f "${VITE_ROOT_PATH}" ]; then
  echo "   ✅ Vite found in node_modules. Skipping npm install to conserve resources."
  INSTALL_SUCCESS=true
else
  echo "   Vite not found. Running 'npm install --include=dev --prefer-offline --no-audit --progress=false' in ${FRONTEND_DIR}..."
  INSTALL_SUCCESS=false
  if npm install --include=dev --prefer-offline --no-audit --progress=false; then
    echo "   ✅ npm install successful in ${FRONTEND_DIR}."
    INSTALL_SUCCESS=true
  fi

  if [ "${INSTALL_SUCCESS}" = false ]; then
    echo "🚨 Error: npm install failed in ${FRONTEND_DIR}."
    cd "${PROJECT_ROOT_DIR}" # Go back to root before exiting
    exit 1
  fi
fi

# Verification step - check if npm run build will work
echo "   Verifying Vite availability..."
if npm run build --dry-run >/dev/null 2>&1; then
  echo "   ✅ Vite is available through npm scripts (workspace setup detected)."
elif [ -f "${VITE_LOCAL_PATH}" ]; then
  echo "   ✅ vite.js found in local node_modules."
elif [ -f "${VITE_ROOT_PATH}" ]; then
  echo "   ✅ vite.js found in root node_modules (workspace setup)."
else
  echo "   🚨 CRITICAL ERROR: Vite not found after npm install."
  echo "   Checking possible locations:"
  echo "   Local: ${VITE_LOCAL_PATH}"
  ls -la "${VITE_LOCAL_PATH}" 2>/dev/null || echo "   Not found at local path"
  echo "   Root: ${VITE_ROOT_PATH}"
  ls -la "${VITE_ROOT_PATH}" 2>/dev/null || echo "   Not found at root path"
  echo "   Checking if npm scripts work:"
  npm run build --dry-run || echo "   npm run build not available"
  cd "${PROJECT_ROOT_DIR}" # Go back to root before exiting
  exit 1
fi

echo "   Running 'npm run build' (using Vite) in ${FRONTEND_DIR}..."
if npm run build; then
  echo "✅ Frontend build successful. Output expected in ${FRONTEND_DIR}/dist."
else
  echo "🚨 Error: Frontend build (npm run build) failed in ${FRONTEND_DIR}."
  cd "${PROJECT_ROOT_DIR}" # Go back to root before exiting
  exit 1
fi
cd "${PROJECT_ROOT_DIR}" # Always change back to project root after frontend operations

# --- Backend/Functions Build (if any) ---
echo "⚙️ Building backend/functions..."
BACKEND_DIR="${PROJECT_ROOT_DIR}/src/backend"

if [ ! -d "${BACKEND_DIR}" ]; then
  echo "⚠️ Warning: Backend directory '${BACKEND_DIR}' not found. Skipping backend build." >&2
elif [ ! -f "${BACKEND_DIR}/tsconfig.json" ]; then
  echo "⚠️ Warning: Backend tsconfig.json ('${BACKEND_DIR}/tsconfig.json') not found. Skipping backend build." >&2
else
  echo "   Changing to backend directory: ${BACKEND_DIR}"
  cd "${BACKEND_DIR}" || exit 1

  if [ -f "package.json" ]; then
    # Check if node_modules exists and .bin is populated
    BIN_DIR_EXISTS_AND_POPULATED=false
    if [ -d "node_modules/.bin" ] && [ "$(ls -A node_modules/.bin 2>/dev/null)" ]; then
      BIN_DIR_EXISTS_AND_POPULATED=true
    fi

    if [ "${BIN_DIR_EXISTS_AND_POPULATED}" = true ]; then
      echo "   ✅ Backend dependencies and .bin directory appear to be correctly installed, skipping npm install to conserve resources."
    else
      if [ -d "node_modules" ] && [ ! "${BIN_DIR_EXISTS_AND_POPULATED}" = true ]; then
        echo "   ⚠️ Warning: 'node_modules' exists but 'node_modules/.bin' is missing or empty in ${BACKEND_DIR}."
        echo "   Running 'npm install' to ensure all dependencies and executables are correctly set up."
      else
        echo "   Running 'npm install' in ${BACKEND_DIR} for backend dependencies (first-time setup or missing .bin)..."
      fi
      
      if npm install --include=dev --prefer-offline --no-audit --progress=false; then
        echo "   ✅ npm install successful in ${BACKEND_DIR}."
      else
        echo "🚨 Error: npm install failed in ${BACKEND_DIR}."
        cd "${PROJECT_ROOT_DIR}" # Go back to root before exiting
        exit 1
      fi
    fi
  else
    echo "   ℹ️ No package.json found in ${BACKEND_DIR}, skipping backend npm install."
  fi

  echo "   DEBUG: Current working directory before tsc compilation:"
  pwd
  echo "   DEBUG: Checking TypeScript compiler availability:"
  if [ -d "./node_modules/.bin" ]; then
    echo "   Local bin directory contents:"
    ls -la ./node_modules/.bin/
  else
    echo "   ℹ️ ./node_modules/.bin/ directory does not exist in ${BACKEND_DIR}."
  fi
  echo "   Checking for TypeScript in root node_modules:"
  if [ -f "${PROJECT_ROOT_DIR}/node_modules/.bin/tsc" ]; then
    echo "   ✅ TypeScript compiler found in root node_modules."
    ls -la "${PROJECT_ROOT_DIR}/node_modules/.bin/tsc"
  else
    echo "   ⚠️ TypeScript compiler not found in root node_modules."
  fi

  echo "   Compiling backend TypeScript functions..."
  
  # Try npm run build first (normal approach)
  if npm run build; then
    echo "   ✅ Backend functions compiled successfully through npm script."
  else
    echo "   ⚠️ npm run build failed, trying direct npx tsc compilation..."
    # Fallback to npx which will use the TypeScript from root workspace
    if npx tsc; then
      echo "   ✅ Backend functions compiled successfully with npx tsc."
      # Run the postbuild script manually since we bypassed npm script
      if [ -f "./scripts/fix-import-paths.js" ]; then
        echo "   Running post-build import path fixes..."
        node ./scripts/fix-import-paths.js
        
        # Create services directory in netlify/functions if needed
        echo "   Copying services files to netlify/functions..."
        mkdir -p "${PROJECT_ROOT_DIR}/netlify/functions/services"
        cp -f ./services/*.js "${PROJECT_ROOT_DIR}/netlify/functions/services/" 2>/dev/null || echo "   ⚠️ No service files to copy"
      else
        echo "   ⚠️ Post-build path fix script not found at ./scripts/fix-import-paths.js"
      fi
    else
      echo "🚨 Error: Backend functions compilation failed with both npm run build and npx tsc."
      cd "${PROJECT_ROOT_DIR}" # Go back to root before exiting
      exit 1
    fi
  fi
  echo "   Changing back to project root directory: ${PROJECT_ROOT_DIR}"
  cd "${PROJECT_ROOT_DIR}" || exit 1
fi

# --- Supabase Edge Functions Deployment ---
echo "⚙️ Deploying Supabase Edge Functions..."

# Make sure Supabase CLI is available
if ! command -v supabase &> /dev/null; then
  echo "🚨 Error: Supabase CLI not found in your PATH."
  echo "   Please install it manually using one of the methods from https://supabase.com/docs/guides/cli/getting-started#installation"
  echo "   (e.g., for Linux: Homebrew 'brew install supabase/tap/supabase' or download the binary)."
  echo "   After installation, ensure the 'supabase' command is accessible in your PATH and re-run this script."
  exit 1
fi

# Check for Supabase Access Token for non-interactive authentication
if [ -z "${SUPABASE_ACCESS_TOKEN}" ]; then
  echo "🚨 Error: SUPABASE_ACCESS_TOKEN environment variable is not set."
  echo "   Please generate an access token from your Supabase dashboard (Account > Access Tokens)"
  echo "   and set it as SUPABASE_ACCESS_TOKEN in your environment (e.g., in your .env file or CI/CD settings)."
  echo "   The script cannot proceed with Supabase Edge Function deployment without it."
  exit 1
else
  echo "   ✅ SUPABASE_ACCESS_TOKEN environment variable found."
fi

# Deploy the custom-auth-mailer function
# The Supabase CLI will use the SUPABASE_ACCESS_TOKEN for authentication
echo "   Deploying custom-auth-mailer Edge Function to Supabase project tzwipktdyvijxsdpkfco..."
# Ensure we are in the project root where supabase/ directory typically resides for `functions deploy`
cd "${PROJECT_ROOT_DIR}" || exit 1
if supabase functions deploy custom-auth-mailer --project-ref tzwipktdyvijxsdpkfco; then
  echo "   ✅ custom-auth-mailer Edge Function deployed successfully."
else
  echo "🚨 Error: Supabase Edge Function 'custom-auth-mailer' deployment failed."
  # exit 1 # Decide if this should be a fatal error for the whole script
  echo "   Continuing build, but the mailer function might not be updated."
fi

# --- Deployment Decision ---

if [ "$1" = "deploy" ]; then
  echo "✅ 'deploy' argument received. Proceeding with Netlify deployment after builds."
  
  echo "🚀 Starting Netlify Deployment (local execution with 'deploy' arg)..."

  # Set environment variable to prevent recursive execution
  export NETLIFY_MANUAL_DEPLOY=true
  
  # Check if NETLIFY_SITE_ID is set - required for multi-site repository
  if [ -z "${NETLIFY_SITE_ID}" ]; then
    echo "🚨 Error: NETLIFY_SITE_ID is required for deployment in multi-site repository."
    echo "   Please set NETLIFY_SITE_ID in your .env file or environment variables."
    echo "   You can find your site ID in the Netlify dashboard under Site settings > General > Site details."
    exit 1
  fi

  # Use env command to ensure the environment variable is passed through
  DEPLOY_COMMAND="env NETLIFY_MANUAL_DEPLOY=true netlify deploy"

  if [ "${PRODUCTION_MODE}" = true ]; then
    DEPLOY_COMMAND+=" --prod"
  else
    echo "   ℹ️  PRODUCTION_MODE is not true, will create a draft deployment (or as per branch config)."
  fi

  DEPLOY_COMMAND+=" --dir='${NETLIFY_PUBLISH_DIR_RELATIVE_TO_ROOT}'"
  DEPLOY_COMMAND+=" --site='${NETLIFY_SITE_ID}'"

  if [ -n "${NETLIFY_AUTH_TOKEN}" ]; then
    DEPLOY_COMMAND+=" --auth='${NETLIFY_AUTH_TOKEN}'"
    echo "   Using NETLIFY_AUTH_TOKEN for deployment."
  else
    echo "   ⚠️ NETLIFY_AUTH_TOKEN not set. Deployment might rely on prior Netlify CLI login or linking."
  fi

  echo "   Executing: ${DEPLOY_COMMAND}"

  if eval "${DEPLOY_COMMAND}"; then
    echo "✅ Netlify deployment command executed successfully."
  else
    echo "🚨 Error: Netlify deployment command failed."
    exit 1
  fi
else
  echo "✅ Build steps completed. No 'deploy' argument passed, so skipping Netlify deployment step."
  echo "   This is expected when run by Netlify's CI/CD build process."
  echo "   To deploy manually after a local build, run: ./scripts/netlify_build_and_deploy.sh deploy"
fi

echo "------------------------------------------------------------"
echo "✅ Elber Production Build and Deploy Script Finished."