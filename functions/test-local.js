#!/usr/bin/env node

// Standalone test script to test the trading logic locally
// without needing Firebase emulator

const OpenAI = require('openai');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const puppeteer = require('puppeteer');

// Load config from .runtimeconfig.json
const config = require('./.runtimeconfig.json');

console.log('🚀 Starting Cramer Algo Trader Test...\n');

//// SDK Config ////
const openai = new OpenAI({
  organization: config.openai.id || undefined,
  apiKey: config.openai.key,
});

const alpaca = new Alpaca({
  keyId: config.alpaca.id,
  secretKey: config.alpaca.key,
  paper: true, // Using paper trading for testing
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
    console.log('📝 First 500 characters of scraped content:');
    console.log(tweets.substring(0, 500) + '...\n');
    return tweets;
  } catch (error) {
    console.error('❌ Error scraping Twitter:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

async function testAlpacaConnection() {
  console.log('💰 Testing Alpaca connection...');
  try {
    const account = await alpaca.getAccount();
    console.log('✅ Alpaca connected successfully!');
    console.log(`   Account Status: ${account.status}`);
    console.log(`   Buying Power: $${parseFloat(account.buying_power).toFixed(2)}`);
    console.log(`   Cash: $${parseFloat(account.cash).toFixed(2)}`);
    console.log(`   Portfolio Value: $${parseFloat(account.portfolio_value).toFixed(2)}\n`);
    return account;
  } catch (error) {
    console.error('❌ Error connecting to Alpaca:', error.message);
    throw error;
  }
}

async function testOpenAI(tweets) {
  console.log('🤖 Testing OpenAI GPT-4o-mini...');
  try {
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

    const response = gptCompletion.choices[0].message.content;
    console.log('✅ OpenAI response:', response);

    const rawTickers = response.match(/\b[A-Z]+\b/g) || [];
    const validTickers = rawTickers.filter(isValidTicker);

    console.log('📊 Raw extracted:', rawTickers.length > 0 ? rawTickers.join(', ') : 'None');
    console.log('📊 Valid tickers:', validTickers.length > 0 ? validTickers.join(', ') : 'None\n');

    return validTickers;
  } catch (error) {
    console.error('❌ Error calling OpenAI:', error.message);
    throw error;
  }
}

async function runFullTest() {
  try {
    console.log('='.repeat(60));
    console.log('TEST 1: Alpaca Connection');
    console.log('='.repeat(60));
    const account = await testAlpacaConnection();

    console.log('='.repeat(60));
    console.log('TEST 2: Twitter Scraping');
    console.log('='.repeat(60));
    const tweets = await scrape();

    console.log('='.repeat(60));
    console.log('TEST 3: OpenAI Analysis');
    console.log('='.repeat(60));
    const cramerSellRecommendations = await testOpenAI(tweets);

    console.log('='.repeat(60));
    console.log('TEST 4: Trading Logic (DRY RUN)');
    console.log('='.repeat(60));

    if (cramerSellRecommendations.length === 0) {
      console.log('⏸️  No valid stock tickers found - sitting this one out\n');
      return;
    }

    console.log(`\n✅ Cramer says to SELL: ${cramerSellRecommendations.join(', ')}`);
    console.log(`🔄 Inverse Cramer strategy: We will BUY what he says to SELL\n`);

    const targetSymbol = cramerSellRecommendations[0];
    const buyingPower = parseFloat(account.buying_power);
    const orderAmount = buyingPower * 0.9;

    console.log(`🎯 Target symbol: ${targetSymbol}`);
    console.log(`💵 Buying power: $${buyingPower.toFixed(2)}`);
    console.log(`💰 Order amount: $${orderAmount.toFixed(2)} (90% of buying power)`);
    console.log(`\n⚠️  This is a DRY RUN - no actual trades executed`);
    console.log(`   To execute real trades, uncomment the trading code in test-local.js\n`);

    console.log('='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('\n💡 Your bot is ready to deploy to Firebase!\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the test
runFullTest();
