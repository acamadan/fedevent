// OpenAI Integration Test Script for FEDEVENT
import 'dotenv/config';

console.log('🧪 Testing OpenAI Integration for FEDEVENT');
console.log('==========================================');

// Check environment variables
console.log('\n📋 Environment Check:');
console.log('✓ NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('✓ OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set ✅' : 'Not set ❌');

// Test OpenAI client initialization
try {
  const { default: OpenAI } = await import('openai');
  
  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    });
    
    console.log('✓ OpenAI client created successfully');
    
    // Test simple API call
    console.log('\n🤖 Testing OpenAI API Connection...');
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_TEST_MODEL || 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: 'Hello! This is a test. Please respond with just "OpenAI integration working!"'
      }],
      max_tokens: 20
    });
    
    const response = completion.choices[0]?.message?.content;
    console.log('✅ API Response:', response);
    console.log('✅ Tokens used:', completion.usage?.total_tokens || 0);
    
  } else {
    console.log('❌ OpenAI API key not found in environment');
    console.log('📝 To enable OpenAI features:');
    console.log('   1. Get an API key from https://platform.openai.com/api-keys');
    console.log('   2. Add OPENAI_API_KEY=your_key_here to your .env file');
  }
  
} catch (error) {
  console.error('❌ OpenAI Integration Error:', error.message);
  if (error.status) console.error('Status:', error.status);
  if (error.response) {
    try {
      console.error('Details:', JSON.stringify(error.response.data || error.response, null, 2));
    } catch (_) {}
  }
  if (error.message.includes('API key')) {
    console.log('💡 Tip: Make sure your OpenAI API key is valid and has credits');
  }
}

console.log('\n🏁 Test Complete');