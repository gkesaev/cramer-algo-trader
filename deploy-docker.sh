#!/bin/bash
# Docker deployment script for Raspberry Pi

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🐳 Cramer Algo Trader - Docker Deployment${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed!${NC}"
    echo "Install Docker with:"
    echo "  curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "  sudo sh get-docker.sh"
    echo "  sudo usermod -aG docker \$USER"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠️  docker-compose not found, installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y docker-compose
fi

# Check for .env file
if [ ! -f "functions/.env" ]; then
    echo -e "${RED}❌ functions/.env file not found!${NC}"
    echo "Creating template..."
    cat > functions/.env << 'EOF'
# OpenAI API Configuration
OPENAI_ORG_ID=
OPENAI_API_KEY=your_openai_api_key_here

# Alpaca Trading API Configuration
ALPACA_API_KEY_ID=your_alpaca_key_id_here
ALPACA_SECRET_KEY=your_alpaca_secret_key_here
EOF
    echo ""
    echo "Please edit functions/.env with your actual API credentials"
    exit 1
fi

# Create logs directory
mkdir -p logs

# Build the Docker image
echo -e "${GREEN}📦 Building Docker image...${NC}"
docker-compose build

echo ""
echo -e "${GREEN}✅ Docker image built successfully!${NC}"
echo ""
echo "📋 Next steps:"
echo "  1. Test manually: ./run-docker.sh"
echo "  2. Setup scheduler: ./setup-cron.sh"
echo "  3. View logs: docker-compose logs -f"
echo ""
