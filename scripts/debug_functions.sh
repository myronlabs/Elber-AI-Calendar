#!/bin/bash

# Debug script for Netlify functions
echo "🔍 Starting Netlify Function Logs Debug"
echo "======================================"

# Set the correct functions directory
FUNCTIONS_DIR="$(pwd)/netlify/functions"

# Check if function name was provided
if [ "$1" != "" ]; then
  # Stream logs for specific function
  echo "📝 Streaming logs for function: $1"
  echo "📁 Using functions directory: $FUNCTIONS_DIR"
  npx netlify functions:logs $1
else
  # Stream all function logs
  echo "📝 Streaming logs for all functions"
  echo "📁 Using functions directory: $FUNCTIONS_DIR"
  npx netlify functions:logs
fi