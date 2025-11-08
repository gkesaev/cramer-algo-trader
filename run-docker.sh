#!/bin/bash
# Start the Cramer Algo Trader service

set -e

echo "🚀 Starting Cramer Algo Trader Service..."
echo ""

# Start the service in detached mode
docker-compose up -d

echo "✅ Service started!"
echo ""
echo "📋 Useful commands:"
echo "  View logs:        docker-compose logs -f"
echo "  Stop service:     docker-compose stop"
echo "  Restart service:  docker-compose restart"
echo "  View status:      docker-compose ps"
echo ""
