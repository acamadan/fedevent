#!/usr/bin/env node
/**
 * Test script for the prelaunch landing page API
 * 
 * Usage: node test-prelaunch.js
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:7777';

async function testLeadsAPI() {
  console.log('🧪 Testing FEDEVENT Prelaunch API...\n');
  
  const testData = {
    hotelName: 'Test Grand Plaza Hotel',
    city: 'Washington',
    state: 'DC',
    contactName: 'John Test Smith',
    title: 'General Manager',
    email: 'test@testhotel.com',
    phone: '555-123-4567',
    interests: 'lodging, conference, bpa'
  };
  
  try {
    console.log('📤 Submitting test lead data...');
    console.log(JSON.stringify(testData, null, 2));
    
    const response = await fetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('\n✅ SUCCESS! Lead submitted');
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log(`\n📊 Lead ID: ${result.leadId}`);
      console.log('✉️  Emails should have been sent (check your SMTP configuration)');
      console.log('\n🎉 Test passed! The API is working correctly.');
    } else {
      console.log('\n❌ FAILED');
      console.log('Status:', response.status);
      console.log('Error:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\n⚠️  Make sure the server is running on port 7070');
    console.error('   Run: node server.js');
  }
}

// Test that server is accessible
async function testServer() {
  try {
    console.log('🔍 Checking if server is running...');
    const response = await fetch(`${BASE_URL}/`);
    if (response.ok) {
      console.log('✅ Server is running on port 7070\n');
      return true;
    }
  } catch (error) {
    console.error('❌ Server is not running on port 7070');
    console.error('   Start it with: node server.js\n');
    return false;
  }
}

// Run tests
(async () => {
  const serverRunning = await testServer();
  if (serverRunning) {
    await testLeadsAPI();
  }
})();

