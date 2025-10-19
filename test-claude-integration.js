// Claude Integration Test Script for FEDEVENT
import 'dotenv/config';

console.log('🧪 Testing Claude Integration for FEDEVENT');
console.log('==========================================');

// Check environment variables
console.log('\n📋 Environment Check:');
console.log('✓ NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('✓ ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set ✅' : 'Not set ❌');

// Test Claude client initialization
try {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  
  if (process.env.ANTHROPIC_API_KEY) {
    const claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    console.log('✓ Claude client created successfully');
    
    // Test simple API call
    console.log('\n🤖 Testing Claude API Connection...');
    const completion = await claude.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: 'Hello! This is a test. Please respond with just "Claude integration working!"'
      }]
    });
    
    const response = completion.content[0].text;
    console.log('✅ API Response:', response);
    console.log('✅ Tokens used:', completion.usage?.input_tokens || 0, 'input +', completion.usage?.output_tokens || 0, 'output');
    
  } else {
    console.log('❌ Claude API key not found in environment');
    console.log('📝 To enable Claude features:');
    console.log('   1. Get an API key from https://console.anthropic.com');
    console.log('   2. Add ANTHROPIC_API_KEY=your_key_here to your .env file');
  }
  
} catch (error) {
  console.error('❌ Claude Integration Error:', error.message);
  if (error.status) console.error('Status:', error.status);
  if (error.response) {
    try {
      console.error('Details:', JSON.stringify(error.response.data || error.response, null, 2));
    } catch (_) {}
  }
  if (error.message.includes('API key')) {
    console.log('💡 Tip: Make sure your Claude API key is valid and has credits');
  }
}

console.log('\n🏁 Test Complete');
