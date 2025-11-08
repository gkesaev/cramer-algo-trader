#!/bin/bash
# Run the bot once for testing (not as a service)

set -e

echo "🧪 Testing Cramer Algo Trader (one-time execution)..."
echo ""

# Run once and exit
docker-compose run --rm -e RUN_ON_STARTUP=true cramer-bot node run-bot.js

echo ""
echo "✅ Test completed!"
