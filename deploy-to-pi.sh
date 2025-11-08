#!/bin/bash
# Deploy to Raspberry Pi via SSH

set -e

# Configuration
PI_USER="${PI_USER:-pi}"
PI_HOST="${PI_HOST:-pi}"
PI_DIR="/home/$PI_USER/cramer-algo-trader"

echo "🚀 Deploying Cramer Algo Trader to Raspberry Pi..."
echo "   User: $PI_USER"
echo "   Host: $PI_HOST"
echo "   Directory: $PI_DIR"
echo ""

# Check if we can connect
echo "📡 Testing SSH connection..."
if ! ssh -o ConnectTimeout=5 "$PI_USER@$PI_HOST" "echo 'Connection successful!'" 2>/dev/null; then
    echo "❌ Cannot connect to $PI_USER@$PI_HOST"
    echo ""
    echo "Usage:"
    echo "  Default:         ./deploy-to-pi.sh"
    echo "  Custom user/host: PI_USER=myuser PI_HOST=192.168.1.100 ./deploy-to-pi.sh"
    exit 1
fi

echo "✅ Connected to Raspberry Pi"
echo ""

# Create directory on Pi
echo "📁 Creating directory on Pi..."
ssh "$PI_USER@$PI_HOST" "mkdir -p $PI_DIR"

# Copy files (excluding node_modules, .git, etc)
echo "📦 Copying project files..."
rsync -av --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'logs' \
  --exclude '.env' \
  --exclude '.runtimeconfig.json' \
  --exclude 'deployment' \
  . "$PI_USER@$PI_HOST:$PI_DIR/"

echo ""
echo "📝 Copying environment files..."
scp functions/.env "$PI_USER@$PI_HOST:$PI_DIR/functions/.env"

echo ""
echo "🔧 Setting up on Raspberry Pi..."

# Run setup on Pi
ssh "$PI_USER@$PI_HOST" "bash -s" << 'ENDSSH'
cd ~/cramer-algo-trader

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker not found. Installing..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker installed"
    echo ""
    echo "⚠️  Please log out and back in, then run this script again"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "⚠️  docker-compose not found. Installing..."
    sudo apt-get update
    sudo apt-get install -y docker-compose
    echo "✅ docker-compose installed"
fi

# Build the Docker image
echo "🐳 Building Docker image..."
docker-compose build

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the service, run on your Pi:"
echo "  cd ~/cramer-algo-trader"
echo "  ./run-docker.sh"
echo ""
echo "Or run from your computer:"
echo "  ssh $USER@$(hostname) 'cd ~/cramer-algo-trader && ./run-docker.sh'"
ENDSSH

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. SSH to Pi:  ssh $PI_USER@$PI_HOST"
echo "  2. Navigate:   cd $PI_DIR"
echo "  3. Start bot:  ./run-docker.sh"
echo "  4. View logs:  docker-compose logs -f"
echo ""
