#!/usr/bin/env node

// Simple OpenAI API test
const OpenAI = require('openai');
const config = require('./.runtimeconfig.json');

console.log('🤖 Testing OpenAI API Connection...\n');

const openai = new OpenAI({
  organization: config.openai.id || undefined,
  apiKey: config.openai.key,
});

async function testOpenAI() {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: 'Say "Hello from GPT-4o-mini!" and nothing else.'
        }
      ],
      max_tokens: 20,
    });

    console.log('✅ SUCCESS! OpenAI API is working\n');
    console.log('Model:', completion.model);
    console.log('Response:', completion.choices[0].message.content);
    console.log('\n💰 Usage:');
    console.log('  Prompt tokens:', completion.usage.prompt_tokens);
    console.log('  Completion tokens:', completion.usage.completion_tokens);
    console.log('  Total tokens:', completion.usage.total_tokens);

  } catch (error) {
    console.log('❌ FAILED to connect to OpenAI\n');
    console.log('Error:', error.message);

    if (error.status === 401) {
      console.log('\n⚠️  401 Unauthorized - API key is invalid');
      console.log('💡 Get a new key at: https://platform.openai.com/api-keys');
    } else if (error.status === 429) {
      console.log('\n⚠️  429 Rate Limited - Too many requests or no credits');
      console.log('💡 Check your account at: https://platform.openai.com/account/usage');
    }
  }
}

testOpenAI();
