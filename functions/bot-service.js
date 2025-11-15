#!/usr/bin/env node

// Continuous service version of the Cramer Algo Trader Bot
// Runs as a service and executes trades on a schedule

require('dotenv').config();
const cron = require('node-cron');
const OpenAI = require('openai');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const puppeteer = require('puppeteer');

console.log('🚀 Cramer Algo Trader Service Starting...\n');
console.log(`📅 Started at: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
console.log(`🕐 Timezone: ${process.env.TZ || 'System default'}`);

// Configuration from environment
const SCHEDULE = process.env.CRON_SCHEDULE || '0 10 * * 1-5'; // Default: M-F at 10 AM
const PAPER_TRADING = process.env.PAPER_TRADING !== 'false'; // Default: true (safe)

console.log(`📋 Schedule: ${SCHEDULE} (${PAPER_TRADING ? 'PAPER TRADING' : '⚠️  LIVE TRADING'})`);
console.log(`💡 To change schedule, set CRON_SCHEDULE environment variable`);
console.log(`💡 Cron format: minute hour day month weekday`);
console.log(`💡 Examples:`);
console.log(`   - "0 10 * * 1-5" = M-F at 10:00 AM`);
console.log(`   - "30 9 * * 1-5" = M-F at 9:30 AM (market open)`);
console.log(`   - "0 15 * * 1,3,5" = Mon,Wed,Fri at 3:00 PM`);
console.log(`   - "0 */2 * * 1-5" = M-F every 2 hours`);
console.log(`   - "*/30 9-16 * * 1-5" = M-F every 30 min from 9 AM-4 PM`);
console.log('');

//// SDK Config ////
const openai = new OpenAI({
  organization: process.env.OPENAI_ORG_ID || undefined,
  apiKey: process.env.OPENAI_API_KEY,
});

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY_ID,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: PAPER_TRADING,
});

//// ENVIRONMENT VALIDATION ////
function validateEnvironment() {
  const required = [
    'OPENAI_API_KEY',
    'ALPACA_API_KEY_ID',
    'ALPACA_SECRET_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('\n❌ MISSING REQUIRED ENVIRONMENT VARIABLES:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n💡 Please set these in your .env file or environment\n');
    process.exit(1);
  }

  console.log('✅ Environment variables validated\n');
}

// Validate environment on startup
validateEnvironment();

//// HELPER FUNCTIONS ////

// US Market Holidays 2025 (update yearly)
const MARKET_HOLIDAYS_2025 = [
  '2025-01-01', // New Year's Day
  '2025-01-20', // Martin Luther King Jr. Day
  '2025-02-17', // Presidents' Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
];

// Check if today is a market holiday
function isMarketHoliday() {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  const year = etTime.getFullYear();
  const month = String(etTime.getMonth() + 1).padStart(2, '0');
  const day = String(etTime.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  return MARKET_HOLIDAYS_2025.includes(dateString);
}

// Validate if a string is a likely stock ticker
function isValidTicker(ticker) {
  if (!ticker || typeof ticker !== 'string') return false;

  // Must be 1-5 uppercase letters (most tickers are 1-5 chars)
  if (!/^[A-Z]{1,5}$/.test(ticker)) return false;

  // Filter out common words that match ticker pattern
  const blacklist = ['SELL', 'BUY', 'HOLD', 'NOT', 'DONT', 'NO', 'YES', 'ALL', 'ANY',
                     'POSTS', 'POST', 'TWEET', 'TWEETS', 'FOLLOW', 'LIKE', 'REPLY',
                     'NONE', 'SOME', 'MORE', 'LESS', 'MOST', 'BEST', 'WORST',
                     'THE', 'AND', 'BUT', 'FOR', 'ARE', 'WAS', 'HAS', 'HAD'];

  return !blacklist.includes(ticker);
}

// Check if market is currently open
function isMarketHours() {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  const day = etTime.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // Market closed on weekends
  if (day === 0 || day === 6) {
    return false;
  }

  // Market closed on holidays
  if (isMarketHoliday()) {
    return false;
  }

  // Market hours: 9:30 AM - 4:00 PM ET (570 minutes - 960 minutes)
  const marketOpen = 9 * 60 + 30;  // 9:30 AM
  const marketClose = 16 * 60;      // 4:00 PM

  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

// Validate ticker is tradable via Alpaca API
async function isTickerTradable(ticker) {
  try {
    const asset = await alpaca.getAsset(ticker);

    // Check if asset is tradable
    if (!asset.tradable) {
      console.log(`   ⚠️  ${ticker} exists but is not tradable`);
      return false;
    }

    // Check if asset is active
    if (asset.status !== 'active') {
      console.log(`   ⚠️  ${ticker} status: ${asset.status} (not active)`);
      return false;
    }

    // Check if asset is fractionable (we use notional orders)
    if (!asset.fractionable) {
      console.log(`   ⚠️  ${ticker} is not fractionable`);
      return false;
    }

    return true;
  } catch (error) {
    // Asset not found or API error
    console.log(`   ❌ ${ticker} validation failed: ${error.message}`);
    return false;
  }
}

//// PUPPETEER Scrape Data from Twitter ////
async function scrape() {
  console.log('🐦 Launching browser to scrape Twitter...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto('https://twitter.com/jimcramer', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const tweets = await page.evaluate(() => {
      return document.body.innerText;
    });

    console.log('✅ Successfully scraped Twitter\n');
    return tweets;
  } catch (error) {
    console.error('❌ Error scraping Twitter:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

async function runBot() {
  const runStartTime = new Date();
  console.log('\n' + '='.repeat(60));
  console.log(`🤖 BOT EXECUTION STARTED`);
  console.log(`📅 Time: ${runStartTime.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('='.repeat(60) + '\n');

  try {
    // Check market hours
    if (!isMarketHours()) {
      console.log('⏸️  Market is currently closed - skipping execution\n');
      console.log('💡 Market hours: Monday-Friday, 9:30 AM - 4:00 PM ET\n');
      return { success: true, action: 'no_trades', reason: 'Market closed' };
    }

    console.log('✅ Market is open - proceeding with execution\n');

    // Scrape tweets
    const tweets = await scrape();

    // Analyze with GPT-4o-mini
    console.log('🤖 Analyzing tweets with GPT-4o-mini...');
    const gptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a financial analyst that extracts stock ticker symbols from text. Return only the ticker symbols in a comma-separated format.'
        },
        {
          role: 'user',
          content: `Based on these tweets from Jim Cramer, what stock tickers is he recommending to SELL? Return only the ticker symbols:\n\n${tweets}`
        }
      ],
      temperature: 0.7,
      max_tokens: 32,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    // Extract and validate tickers
    const gptResponse = gptCompletion.choices[0].message.content;
    console.log(`📝 GPT Response: "${gptResponse}"`);

    const rawTickers = gptResponse.match(/\b[A-Z]+\b/g) || [];
    const cramerSellRecommendations = rawTickers.filter(isValidTicker);

    console.log(`✅ Cramer says to SELL: ${cramerSellRecommendations.length > 0 ? cramerSellRecommendations.join(', ') : 'nothing specific'}`);
    console.log(`🔄 Inverse Cramer strategy: We will BUY what he says to SELL\n`);

    if (cramerSellRecommendations.length === 0) {
      console.log('⏸️  Sitting this one out - no valid tickers found\n');
      return { success: true, action: 'no_trades', reason: 'No valid tickers found' };
    }

    // Validate tickers are tradable via Alpaca
    console.log('🔍 Validating tickers with Alpaca...');
    const tradableChecks = await Promise.all(
      cramerSellRecommendations.map(async (ticker) => ({
        ticker,
        tradable: await isTickerTradable(ticker)
      }))
    );

    const tradableTickers = tradableChecks
      .filter(check => check.tradable)
      .map(check => check.ticker);

    if (tradableTickers.length === 0) {
      console.log('⏸️  No tradable tickers found after validation\n');
      return { success: true, action: 'no_trades', reason: 'No tradable tickers' };
    }

    console.log(`✅ Tradable tickers: ${tradableTickers.join(', ')}\n`);

    //// ALPACA Make Trades ////
    console.log('💰 Executing trading strategy...');

    // Close all positions
    console.log('📤 Canceling all open orders...');
    await alpaca.cancelAllOrders();

    console.log('💸 Closing all positions...');
    await alpaca.closeAllPositions();

    // Wait for positions to fully close (avoid race condition)
    console.log('⏳ Waiting for positions to settle...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get account and validate buying power
    const account = await alpaca.getAccount();
    const buyingPower = parseFloat(account.buying_power);

    if (isNaN(buyingPower) || buyingPower <= 0) {
      console.log(`❌ Invalid buying power: $${account.buying_power}\n`);
      return { success: false, error: 'Invalid buying power' };
    }

    console.log(`💵 Buying power: $${buyingPower.toFixed(2)}`);

    // Calculate order amount (90% of buying power)
    const orderAmount = buyingPower * 0.9;

    // Validate minimum order amount ($1)
    if (orderAmount < 1) {
      console.log(`❌ Insufficient funds: $${orderAmount.toFixed(2)} (minimum $1 required)\n`);
      return { success: false, error: 'Insufficient funds' };
    }

    const targetSymbol = tradableTickers[0];
    console.log(`🎯 Placing order for ${targetSymbol} with $${orderAmount.toFixed(2)} (90% of buying power)...`);

    const order = await alpaca.createOrder({
      symbol: targetSymbol,
      notional: orderAmount, // will buy fractional shares
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
    });

    console.log(`\n✅ Order placed successfully!`);
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Symbol: ${order.symbol}`);
    console.log(`   Side: ${order.side}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Submitted at: ${new Date(order.submitted_at).toLocaleString()}\n`);

    const runEndTime = new Date();
    const duration = ((runEndTime - runStartTime) / 1000).toFixed(2);

    console.log('='.repeat(60));
    console.log(`✅ BOT EXECUTION COMPLETED (${duration}s)`);
    console.log('='.repeat(60) + '\n');

    return { success: true, action: 'trade_executed', order: order.id, symbol: order.symbol };

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);

    const runEndTime = new Date();
    const duration = ((runEndTime - runStartTime) / 1000).toFixed(2);

    console.log('='.repeat(60));
    console.log(`❌ BOT EXECUTION FAILED (${duration}s)`);
    console.log('='.repeat(60) + '\n');

    return { success: false, error: error.message };
  }
}

// Validate cron schedule
if (!cron.validate(SCHEDULE)) {
  console.error(`❌ Invalid cron schedule: ${SCHEDULE}`);
  console.error('Please use valid cron format: "minute hour day month weekday"');
  process.exit(1);
}

// Schedule the bot
console.log(`⏰ Bot scheduled with cron: ${SCHEDULE}`);
console.log('🔄 Service is running... Press Ctrl+C to stop\n');

// Schedule the task
const task = cron.schedule(SCHEDULE, async () => {
  await runBot();
}, {
  scheduled: true,
  timezone: "America/New_York"
});

// Optional: Run immediately on startup for testing
if (process.env.RUN_ON_STARTUP === 'true') {
  console.log('🚀 Running bot immediately (RUN_ON_STARTUP=true)...\n');
  runBot().then(() => {
    console.log('⏰ Next scheduled run will be according to cron schedule\n');
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
  task.stop();
  console.log('✅ Service stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
  task.stop();
  console.log('✅ Service stopped');
  process.exit(0);
});

// Keep the process alive
console.log('💚 Service is healthy and running');
console.log(`📊 Next scheduled execution will be based on cron: ${SCHEDULE}\n`);
