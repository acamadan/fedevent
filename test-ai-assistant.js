#!/usr/bin/env node

/**
 * Test script for FEDEVENT AI Assistant
 * Tests the /api/chat/assistant endpoint
 */

import 'dotenv/config';

const API_URL = 'http://localhost:7070/api/chat/assistant';

console.log('🤖 Testing FEDEVENT AI Assistant\n');
console.log('================================\n');

// Test questions
const testQuestions = [
  {
    message: "How do I register my hotel?",
    description: "Basic registration question"
  },
  {
    message: "What are the NET30 payment terms?",
    description: "Payment terms question"
  },
  {
    message: "Do I need SAM.gov registration?",
    description: "SAM.gov compliance question"
  },
  {
    message: "Can I contact the government directly?",
    description: "Critical policy question"
  },
  {
    message: "What's the difference between prime contractor and subcontractor?",
    description: "Contract structure question"
  }
];

async function testAssistant() {
  console.log('🔧 Configuration Check:');
  console.log(`   OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   API URL: ${API_URL}\n`);

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY not set in .env file');
    console.log('\n💡 To fix this:');
    console.log('   1. Copy your OpenAI API key');
    console.log('   2. Add to .env file: OPENAI_API_KEY=sk-your-key-here');
    console.log('   3. Restart the server and run this test again\n');
    process.exit(1);
  }

  console.log('🧪 Starting Tests...\n');
  console.log('Note: Make sure the server is running on port 7070\n');

  let passedTests = 0;
  let failedTests = 0;

  for (let i = 0; i < testQuestions.length; i++) {
    const test = testQuestions[i];
    console.log(`📝 Test ${i + 1}/${testQuestions.length}: ${test.description}`);
    console.log(`   Question: "${test.message}"`);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: test.message,
          conversationHistory: [],
          currentPage: 'test',
          formContext: {}
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.response && data.response.length > 0) {
        console.log(`   ✅ SUCCESS`);
        console.log(`   Response preview: ${data.response.substring(0, 100)}...`);
        console.log(`   Tokens used: ${data.tokensUsed || 'N/A'}`);
        console.log(`   AI Response: ${data.isAiResponse ? 'Yes' : 'No (fallback)'}\n`);
        passedTests++;
      } else {
        throw new Error('Empty response from AI');
      }

    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('================================\n');
  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passedTests}/${testQuestions.length}`);
  console.log(`   ❌ Failed: ${failedTests}/${testQuestions.length}`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All tests passed! The AI Assistant is working correctly.\n');
    console.log('💡 Next Steps:');
    console.log('   1. Open http://localhost:7070/hotel-registration.html');
    console.log('   2. Look for the chat bubble in the bottom-right corner');
    console.log('   3. Click it and try asking questions');
    console.log('   4. Test form field detection by clicking on input fields\n');
  } else {
    console.log('\n⚠️  Some tests failed. Check the error messages above.\n');
    console.log('💡 Common Issues:');
    console.log('   - Server not running: Start with `npm start`');
    console.log('   - Wrong port: Server should be on port 7070');
    console.log('   - OpenAI API key: Check it\'s valid and has credits');
    console.log('   - Network issues: Check your internet connection\n');
    process.exit(1);
  }
}

// Run tests
testAssistant().catch(error => {
  console.error('\n❌ Test execution failed:', error.message);
  console.log('\n💡 Make sure:');
  console.log('   1. Server is running: npm start');
  console.log('   2. OpenAI API key is set in .env');
  console.log('   3. You have internet connection\n');
  process.exit(1);
});

