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

//// PUPPETEER Scrape Data from Twitter ////
async function scrape() {
  console.log('🐦 Launching browser to scrape Twitter...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto('https://twitter.com/jimcramer', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const tweets = await page.evaluate(() => {
      return document.body.innerText;
    });

    await browser.close();
    console.log('✅ Successfully scraped Twitter\n');
    return tweets;
  } catch (error) {
    console.error('❌ Error scraping Twitter:', error.message);
    await browser.close();
    throw error;
  }
}

async function runBot() {
  const runStartTime = new Date();
  console.log('\n' + '='.repeat(60));
  console.log(`🤖 BOT EXECUTION STARTED`);
  console.log(`📅 Time: ${runStartTime.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('='.repeat(60) + '\n');

  try {
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

    const stocksToBuy = gptCompletion.choices[0].message.content.match(/\b[A-Z]+\b/g);
    console.log(`✅ Thanks for the tips Jim! ${stocksToBuy}\n`);

    if (!stocksToBuy || stocksToBuy.length === 0) {
      console.log('⏸️  Sitting this one out - no tickers found\n');
      return { success: true, action: 'no_trades', reason: 'No tickers found' };
    }

    //// ALPACA Make Trades ////
    console.log('💰 Executing trading strategy...');

    // Close all positions
    console.log('📤 Canceling all open orders...');
    await alpaca.cancelAllOrders();

    console.log('💸 Closing all positions...');
    await alpaca.closeAllPositions();

    // Get account
    const account = await alpaca.getAccount();
    console.log(`💵 Dry powder: $${parseFloat(account.buying_power).toFixed(2)}`);

    // Place order
    const orderAmount = parseFloat(account.buying_power) * 0.9;
    console.log(`🎯 Placing order for ${stocksToBuy[0]} with $${orderAmount.toFixed(2)}...`);

    const order = await alpaca.createOrder({
      symbol: stocksToBuy[0],
      notional: orderAmount, // will buy fractional shares
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
    });

    console.log(`\n✅ Look mom I bought stonks!`);
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Symbol: ${order.symbol}`);
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
