#!/usr/bin/env bash

set -e

echo "==================================="
echo "Spike AI Builder - Deploy Script"
echo "==================================="

# Load .env if present (local testing only)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Check Node.js version
echo "Checking Node.js version..."
node --version

# Install dependencies (omit dev for faster, safer startup)
echo "Installing dependencies..."
npm install --omit=dev

# Check for credentials.json
if [ ! -f "credentials.json" ]; then
  echo "ERROR: credentials.json not found at project root!"
  exit 1
else
  echo "credentials.json found ✓"
fi

# Check for LiteLLM API key
if [ -z "$LITELLM_API_KEY" ]; then
  echo "WARNING: LITELLM_API_KEY environment variable not set!"
  echo "The server will start, but LLM-powered reasoning may fail."
fi

# Local Windows override 
export PORT=3000

echo "Starting server on port ${PORT}..."

# Start server exactly once
npx tsx server/index.ts &

SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

# Wait for server to initialize
echo "Waiting for server to initialize..."
sleep 5

# Health check
echo "Testing server health..."
if curl -s http://localhost:${PORT}/health > /dev/null 2>&1; then
  echo "✓ Server is healthy and responding on port ${PORT}"
else
  echo "✗ Server health check failed"
  kill $SERVER_PID
  exit 1
fi

echo "==================================="
echo "Deployment complete!"
echo "Server is running on port ${PORT}"
echo "API endpoint: POST http://localhost:${PORT}/query"
echo "==================================="

# Keep process alive
wait $SERVER_PID
