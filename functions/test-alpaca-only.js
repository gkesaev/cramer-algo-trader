#!/usr/bin/env node

// Simple Alpaca API test
const axios = require('axios');

const config = require('./.runtimeconfig.json');

const keyId = config.alpaca.id;
const secretKey = config.alpaca.key;

console.log('🔍 Testing Alpaca API Connection...\n');
console.log('Key ID:', keyId);
console.log('Secret Key:', secretKey.substring(0, 10) + '...' + secretKey.substring(secretKey.length - 4));
console.log('\n');

async function testConnection() {
  try {
    const response = await axios.get('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secretKey
      }
    });

    console.log('✅ SUCCESS! Connected to Alpaca\n');
    console.log('Account Info:');
    console.log('  Status:', response.data.status);
    console.log('  Buying Power: $' + parseFloat(response.data.buying_power).toFixed(2));
    console.log('  Cash: $' + parseFloat(response.data.cash).toFixed(2));

  } catch (error) {
    console.log('❌ FAILED to connect to Alpaca\n');
    console.log('Error:', error.response ? error.response.status : error.message);
    console.log('Message:', error.response ? error.response.data : 'Network error');

    if (error.response && error.response.status === 403) {
      console.log('\n⚠️  403 Forbidden - Possible causes:');
      console.log('   1. API keys are incorrect');
      console.log('   2. API keys are not activated yet');
      console.log('   3. Account needs email verification');
      console.log('   4. Keys are for live trading instead of paper trading');
      console.log('\n💡 To fix:');
      console.log('   1. Go to: https://app.alpaca.markets/paper/dashboard/overview');
      console.log('   2. Click "Generate API Keys" or "View"');
      console.log('   3. Make sure you\'re in PAPER TRADING mode');
      console.log('   4. Copy the new keys and update .runtimeconfig.json');
    }
  }
}

testConnection();
