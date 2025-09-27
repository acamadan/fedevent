#!/bin/bash

# FEDEVENT Auto-run Script
# This script will automatically start the server and restart it if it crashes

# Navigate to the project directory
cd "$(dirname "$0")"

# Create logs directory if it doesn't exist
mkdir -p logs

echo "FEDEVENT Auto-run Script"
echo "========================"
echo "Starting server with auto-restart capability..."
echo "Press Ctrl+C to stop"

# Function to start the server
start_server() {
    echo "$(date): Starting FEDEVENT server..."
    npm run dev
}

# Main loop
while true; do
    start_server
    echo "$(date): Server stopped. Restarting in 5 seconds..."
    sleep 5
done