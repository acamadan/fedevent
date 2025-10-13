#!/usr/bin/env node

// Test script for GSA Per Diem API integration
import 'dotenv/config';
import fs from 'fs';

console.log('Testing GSA Per Diem API Integration');
console.log('=====================================');

// Check if GSA API key is configured
const gsaApiKey = process.env.GSA_API_KEY;
console.log('GSA API Key configured:', !!gsaApiKey);

if (gsaApiKey && gsaApiKey !== 'YOUR_GSA_API_KEY_HERE') {
  console.log('GSA API Key (first 10 chars):', gsaApiKey.substring(0, 10) + '...');
} else {
  console.log('⚠️  WARNING: GSA API Key not configured or using placeholder value');
  console.log('   Please obtain a real API key from https://api.gsa.gov/ and update your .env file');
}

// Test GSA API endpoints
async function testGsaApi() {
  if (!gsaApiKey || gsaApiKey === 'YOUR_GSA_API_KEY_HERE') {
    console.log('\nSkipping API tests - no valid API key configured');
    return;
  }

  const baseUrl = 'https://api.gsa.gov/travel/perdiem/v2/rates';
  const testYear = new Date().getFullYear();
  
  // Test 1: State rates
  console.log('\n--- Test 1: State Rates ---');
  try {
    const stateUrl = `${baseUrl}/state/MT/year/${testYear}`;
    console.log('Testing URL:', stateUrl);
    
    const response = await fetch(stateUrl, {
      headers: {
        'X-API-KEY': gsaApiKey,
        'Accept': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ State rates API working');
      console.log('Sample data:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    } else {
      console.log('❌ State rates API failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ State rates API error:', error.message);
  }
  
  // Test 2: City rates
  console.log('\n--- Test 2: City Rates ---');
  try {
    const cityUrl = `${baseUrl}/city/Billings/state/MT/year/${testYear}`;
    console.log('Testing URL:', cityUrl);
    
    const response = await fetch(cityUrl, {
      headers: {
        'X-API-KEY': gsaApiKey,
        'Accept': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ City rates API working');
      console.log('Sample data:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    } else {
      console.log('❌ City rates API failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ City rates API error:', error.message);
  }
  
  // Test 3: ZIP code rates
  console.log('\n--- Test 3: ZIP Code Rates ---');
  try {
    const zipUrl = `${baseUrl}/zip/59101/year/${testYear}`;
    console.log('Testing URL:', zipUrl);
    
    const response = await fetch(zipUrl, {
      headers: {
        'X-API-KEY': gsaApiKey,
        'Accept': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ ZIP code rates API working');
      console.log('Sample data:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    } else {
      console.log('❌ ZIP code rates API failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ ZIP code rates API error:', error.message);
  }
}

// Run the tests
testGsaApi().catch(console.error);