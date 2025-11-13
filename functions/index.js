const functions = require('firebase-functions');

//// SDK Config ////

const OpenAI = require('openai');
const openai = new OpenAI({
  organization: functions.config().openai.id, // REPLACE with your API credentials
  apiKey: functions.config().openai.key, // REPLACE with your API credentials
});

const Alpaca = require('@alpacahq/alpaca-trade-api');

// Check if paper trading is explicitly disabled (default: true for safety)
const PAPER_TRADING = functions.config().alpaca?.paper !== 'false';

const alpaca = new Alpaca({
  keyId: functions.config().alpaca.id, // REPLACE with your API credentials
  secretKey: functions.config().alpaca.key, // REPLACE with your API credentials
  paper: PAPER_TRADING,
});

//// HELPER FUNCTIONS ////

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

// Check if market is currently open (simplified check)
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

  // Market hours: 9:30 AM - 4:00 PM ET (570 minutes - 960 minutes)
  const marketOpen = 9 * 60 + 30;  // 9:30 AM
  const marketClose = 16 * 60;      // 4:00 PM

  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

//// PUPPETEER Scrape Data from Twitter for better AI context ////

const puppeteer = require('puppeteer');

async function scrape() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for Cloud Functions
  });

  try {
    const page = await browser.newPage();

    // Set a realistic user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Twitter is now X.com, but twitter.com still redirects
    await page.goto('https://twitter.com/jimcramer', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for content to load using a more reliable method
    await new Promise(resolve => setTimeout(resolve, 3000));

    const tweets = await page.evaluate(() => {
      return document.body.innerText;
    });

    return tweets;
  } catch (error) {
    console.error('Error scraping Twitter:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

exports.helloWorld = functions.https.onRequest(async (request, response) => {
  // test logic here

  response.send('test');
});

exports.getRichQuick = functions
  .runWith({ memory: '4GB' })
  .pubsub.schedule('0 10 * * 1-5')
  .timeZone('America/New_York')
  .onRun(async (ctx) => {
    console.log('🤖 Cramer Algo Trader - Firebase Cloud Function');
    console.log(`📅 Execution time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
    console.log(`💼 Trading mode: ${PAPER_TRADING ? 'PAPER TRADING' : '⚠️  LIVE TRADING'}\n`);

    try {
      // Check market hours
      if (!isMarketHours()) {
        console.log('⏸️  Market is currently closed - skipping execution');
        console.log('💡 Market hours: Monday-Friday, 9:30 AM - 4:00 PM ET');
        return null;
      }

      console.log('✅ Market is open - proceeding with execution\n');

      const tweets = await scrape();

      const gptCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using GPT-4o-mini for cost efficiency
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
        console.log('⏸️  Sitting this one out - no valid tickers found');
        return null;
      }

      //// ALPACA Make Trades ////
      console.log('💰 Executing trading strategy...');

      // close all positions
      console.log('📤 Canceling all open orders...');
      await alpaca.cancelAllOrders();

      console.log('💸 Closing all positions...');
      await alpaca.closeAllPositions();

      // Wait for positions to fully close (avoid race condition)
      console.log('⏳ Waiting for positions to settle...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // get account and validate buying power
      const account = await alpaca.getAccount();
      const buyingPower = parseFloat(account.buying_power);

      if (isNaN(buyingPower) || buyingPower <= 0) {
        console.log(`❌ Invalid buying power: $${account.buying_power}`);
        throw new Error('Invalid buying power');
      }

      console.log(`💵 Buying power: $${buyingPower.toFixed(2)}`);

      // Calculate order amount (90% of buying power)
      const orderAmount = buyingPower * 0.9;

      // Validate minimum order amount ($1)
      if (orderAmount < 1) {
        console.log(`❌ Insufficient funds: $${orderAmount.toFixed(2)} (minimum $1 required)`);
        throw new Error('Insufficient funds');
      }

      const targetSymbol = cramerSellRecommendations[0];
      console.log(`🎯 Placing order for ${targetSymbol} with $${orderAmount.toFixed(2)} (90% of buying power)...`);

      // place order
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

      return null;
    } catch (error) {
      console.error('❌ ERROR:', error.message);
      console.error('Full error:', error);
      throw error; // Re-throw to mark function as failed
    }
  });
