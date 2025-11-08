#!/bin/bash
# Stop the Cramer Algo Trader service

set -e

echo "🛑 Stopping Cramer Algo Trader Service..."
echo ""

docker-compose down

echo "✅ Service stopped!"
