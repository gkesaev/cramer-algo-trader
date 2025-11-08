#!/usr/bin/env node

// Standalone bot script for running on Raspberry Pi or any server
// This does the same thing as the Firebase function but runs independently

require('dotenv').config();
const OpenAI = require('openai');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const puppeteer = require('puppeteer');

console.log('🚀 Starting Cramer Algo Trader Bot...\n');
console.log(`📅 Current time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

//// SDK Config ////
const openai = new OpenAI({
  organization: process.env.OPENAI_ORG_ID || undefined,
  apiKey: process.env.OPENAI_API_KEY,
});

const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY_ID,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: true, // Change to false for LIVE trading
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
  try {
    console.log('This will run M-F at 10:00 AM Eastern!');

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

    if (!stocksToBuy) {
      console.log('⏸️  Sitting this one out - no tickers found\n');
      return null;
    }

    //// ALPACA Make Trades ////
    console.log('💰 Executing trading strategy...');

    // Close all positions
    console.log('📤 Canceling all open orders...');
    const cancel = await alpaca.cancelAllOrders();

    console.log('💸 Closing all positions...');
    const liquidate = await alpaca.closeAllPositions();

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

    return order;

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run the bot
runBot().then(() => {
  console.log('🎉 Bot execution completed successfully!');
  process.exit(0);
});
