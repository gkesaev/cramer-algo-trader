# AI-Driven Algo Trading with Alpaca and GPT-4

A containerized trading bot that uses OpenAI's GPT-4o-mini model to analyze Jim Cramer's tweets and execute the "inverse Cramer" trading strategy via Alpaca. Runs 24/7 on your Raspberry Pi or any Docker-enabled device.

## Features
- ✅ **Updated to latest dependencies** (2025)
  - Node.js 20+
  - OpenAI API v4 (GPT-4o-mini)
  - Puppeteer v24
  - Alpaca SDK v3
- 🐳 **Docker deployment** - Runs as a continuous service
- 🔒 **Zero security vulnerabilities**
- 🤖 **Automated trading** - Runs Monday-Friday at 10:00 AM ET
- 📊 **AI-powered analysis** - GPT-4o-mini extracts stock recommendations
- 💰 **"Inverse Cramer" strategy** - Buys what Cramer recommends selling
- 🍓 **Raspberry Pi ready** - Perfect for 24/7 operation

## Quick Start

```bash
# 1. Deploy to Raspberry Pi
PI_USER=pi PI_HOST=192.168.1.100 ./deploy-to-pi.sh

# 2. Or run locally
./deploy-docker.sh
./run-docker.sh

# 3. Monitor
docker-compose logs -f

# 4. Stop
./stop-docker.sh
```

**Configuration**: Edit `docker-compose.yml` to change schedule, enable live trading, etc.

## Trading Strategy

- **Schedule**: Monday-Friday at 10:00 AM ET (configurable)
- **Logic**:
  1. Scrape Jim Cramer's latest tweets
  2. Ask GPT-4o-mini: "What stocks is Cramer recommending to SELL?"
  3. Close all positions
  4. Buy the opposite (inverse Cramer strategy)
  5. Use 90% of buying power
- **Mode**: Paper trading by default (switch to live trading in `docker-compose.yml`)

## Original Tutorial

Watch the [AlgoTrading Tutorial](https://youtu.be/BrcugNqRwUs) on YouTube

**Note**: The code has been significantly updated and dockerized from the original Firebase tutorial. See commit history for changes.
