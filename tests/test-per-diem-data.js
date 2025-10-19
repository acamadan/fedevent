#!/usr/bin/env node

// Test script for per diem data fetching and processing
import 'dotenv/config';

console.log('Testing Per Diem Data Fetching');
console.log('==============================');

// Test the per diem API endpoint
async function testPerDiemApi() {
  const baseUrl = 'http://localhost:7070/api/perdiem';
  
  // Test 1: Montana state data
  console.log('\n--- Test 1: Montana State Data ---');
  try {
    const url = `${baseUrl}?state=MT&year=2025`;
    console.log('Testing URL:', url);
    
    const response = await fetch(url);
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API endpoint working');
      console.log('Number of rows:', data.rows?.length || 0);
      console.log('Sample data:', JSON.stringify(data.rows?.slice(0, 3), null, 2));
    } else {
      console.log('❌ API endpoint failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ API endpoint error:', error.message);
  }
  
  // Test 2: Specific city data
  console.log('\n--- Test 2: Billings, MT Data ---');
  try {
    const url = `${baseUrl}?city=Billings&state=MT&year=2025`;
    console.log('Testing URL:', url);
    
    const response = await fetch(url);
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ City API endpoint working');
      console.log('Number of rows:', data.rows?.length || 0);
      console.log('Sample data:', JSON.stringify(data.rows?.slice(0, 3), null, 2));
    } else {
      console.log('❌ City API endpoint failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ City API endpoint error:', error.message);
  }
  
  // Test 3: Month-specific data
  console.log('\n--- Test 3: Montana Data with Specific Month ---');
  try {
    const url = `${baseUrl}?state=MT&year=2025&month=01`;
    console.log('Testing URL:', url);
    
    const response = await fetch(url);
    console.log('Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Month-specific API endpoint working');
      console.log('Number of rows:', data.rows?.length || 0);
      console.log('Sample data:', JSON.stringify(data.rows?.slice(0, 3), null, 2));
    } else {
      console.log('❌ Month-specific API endpoint failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ Month-specific API endpoint error:', error.message);
  }
}

// Run the tests
testPerDiemApi().catch(console.error);