# Cramer Algo Trader - Setup Guide

## Overview
This Firebase Cloud Function implements an automated trading strategy that:
1. Scrapes Jim Cramer's Twitter/X feed using Puppeteer
2. Uses OpenAI's GPT-4o-mini to analyze tweets and extract stock recommendations
3. Executes trades via Alpaca's API (buying what Cramer recommends selling - the "inverse Cramer" strategy)
4. Runs automatically Monday-Friday at 10:00 AM Eastern Time

## Prerequisites
- Node.js 20 or higher
- Firebase CLI installed (`npm install -g firebase-tools`)
- Active Firebase project
- OpenAI API account
- Alpaca trading account (paper or live)

## Required API Keys

### 1. OpenAI API
- Sign up at: https://platform.openai.com/
- Create an API key at: https://platform.openai.com/api-keys
- You'll need:
  - Organization ID (optional)
  - API Key

### 2. Alpaca Trading API
- Sign up at: https://alpaca.markets/
- For paper trading (recommended for testing): https://app.alpaca.markets/paper/dashboard/overview
- Generate API keys from the dashboard
- You'll need:
  - API Key ID
  - Secret Key
- **Note**: By default, the code is set to use LIVE trading. Uncomment line 16 in `functions/index.js` to use paper trading: `// paper: true,`

### 3. Firebase
- Create a project at: https://console.firebase.google.com/
- Enable Cloud Functions
- Upgrade to Blaze plan (required for external API calls and scheduled functions)

## Installation

1. **Install dependencies:**
   ```bash
   cd functions
   PUPPETEER_SKIP_DOWNLOAD=true npm install
   ```

2. **Login to Firebase:**
   ```bash
   firebase login
   ```

3. **Set Firebase project:**
   ```bash
   firebase use --add
   # Select your project and give it an alias
   ```

4. **Configure environment variables:**
   ```bash
   # OpenAI configuration
   firebase functions:config:set openai.id="YOUR_OPENAI_ORG_ID"
   firebase functions:config:set openai.key="YOUR_OPENAI_API_KEY"

   # Alpaca configuration
   firebase functions:config:set alpaca.id="YOUR_ALPACA_API_KEY_ID"
   firebase functions:config:set alpaca.key="YOUR_ALPACA_SECRET_KEY"
   ```

5. **Verify configuration:**
   ```bash
   firebase functions:config:get
   ```

## Local Testing

To test the function locally:

```bash
cd functions
firebase functions:config:get > .runtimeconfig.json
firebase emulators:start --only functions
```

Then visit the emulator URL for the `helloWorld` function to test.

## Deployment

```bash
firebase deploy --only functions
```

## Function Details

### `getRichQuick`
- **Trigger**: Scheduled (cron: `0 10 * * 1-5`)
- **Schedule**: Monday-Friday at 10:00 AM Eastern Time
- **Memory**: 4GB (required for Puppeteer)
- **Actions**:
  1. Scrapes @jimcramer's Twitter/X feed
  2. Sends tweets to GPT-4o-mini to extract "sell" recommendations
  3. Closes all existing positions
  4. Uses 90% of buying power to purchase the first extracted ticker

### `helloWorld`
- **Trigger**: HTTPS request
- **Purpose**: Testing endpoint

## Important Notes

### Trading Configuration
- **Default Mode**: LIVE TRADING (line 16 in index.js)
- **Paper Trading**: Uncomment `// paper: true,` in line 16 to enable paper trading
- **Risk**: The function uses 90% of available buying power per trade
- **Strategy**: "Inverse Cramer" - buys stocks Cramer recommends selling

### Twitter Scraping Limitations
- Twitter/X has implemented aggressive anti-scraping measures
- The current implementation may not work without proper authentication
- Consider alternative approaches:
  - Twitter API with Bearer token
  - RSS feeds or third-party services
  - Manual input system

### Costs
- **Firebase**: Cloud Functions (Blaze plan required)
- **OpenAI**: GPT-4o-mini API calls (~$0.00015 per call with current token limits)
- **Alpaca**: Free for paper trading, standard costs for live trading

## Security Recommendations

1. **Never commit API keys** to version control
2. Use **paper trading** for initial testing
3. Set **appropriate position size limits** in Alpaca dashboard
4. Monitor the function logs regularly: `firebase functions:log`
5. Set up **budget alerts** in Google Cloud Console
6. Consider adding **error notifications** (email/SMS)

## Troubleshooting

### Puppeteer Issues in Cloud Functions
- Cloud Functions provides Chrome automatically
- Ensure `--no-sandbox` and `--disable-setuid-sandbox` flags are set (already in code)
- May need to increase memory allocation beyond 4GB

### Twitter Scraping Fails
- Check if Twitter/X has updated their anti-bot measures
- Consider implementing Twitter API v2 instead
- Verify network connectivity from Cloud Functions

### Alpaca API Errors
- Verify API keys are correct
- Check if market is open (US stock market hours)
- Ensure account has sufficient buying power
- Check Alpaca dashboard for account restrictions

### OpenAI API Errors
- Verify API key is valid and has credits
- Check rate limits on your OpenAI account
- Monitor token usage to stay within limits

## Monitoring

View function logs:
```bash
firebase functions:log
```

Or in the Firebase Console:
https://console.firebase.google.com/project/YOUR_PROJECT/functions/logs

## Disclaimer

This is an educational project and should not be considered financial advice. Automated trading carries significant risk. Always:
- Start with paper trading
- Use proper risk management
- Never invest more than you can afford to lose
- Consult with a financial advisor before live trading
- Understand that past performance doesn't guarantee future results
- Be aware that the "inverse Cramer" strategy is a meme and not a proven trading strategy
