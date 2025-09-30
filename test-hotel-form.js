// Test script to simulate hotel registration form submission
import fs from 'fs';

async function testHotelRegistration() {
  console.log('=== Testing Hotel Registration Form Submission ===\n');
  
  // 1. Login as hotel user
  console.log('1. Logging in as hotel user...');
  const loginResponse = await fetch('http://localhost:5050/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'info@creataglobal.com',
      password: 'test123'
    })
  });
  
  const loginData = await loginResponse.json();
  console.log('Login result:', loginData.ok ? 'SUCCESS' : 'FAILED');
  
  if (!loginData.ok) {
    console.log('Login failed:', loginData.error);
    return;
  }
  
  const sessionId = loginData.sessionId;
  console.log('Session ID:', sessionId.substring(0, 20) + '...\n');
  
  // 2. Test session validation (like the form does)
  console.log('2. Validating session (like form does)...');
  const sessionCheck = await fetch('http://localhost:5050/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${sessionId}`
    }
  });
  
  console.log('Session check status:', sessionCheck.status);
  
  if (!sessionCheck.ok) {
    console.log('Session validation failed!');
    return;
  }
  
  const sessionData = await sessionCheck.json();
  console.log('Session user role:', sessionData.user.role);
  console.log('Session user hotel_id:', sessionData.user.hotel_id);
  
  // 3. Test accessing hotel contracts (another check the form might do)
  console.log('\n3. Testing hotel contracts access...');
  try {
    const contractsResponse = await fetch('http://localhost:5050/api/hotel/contracts', {
      headers: {
        'Authorization': `Bearer ${sessionId}`
      }
    });
    
    console.log('Contracts access status:', contractsResponse.status);
    if (contractsResponse.ok) {
      console.log('Hotel contracts access: SUCCESS');
    } else {
      console.log('Hotel contracts access: FAILED');
      const errorData = await contractsResponse.json();
      console.log('Error:', errorData.error);
    }
  } catch (error) {
    console.log('Contracts access error:', error.message);
  }
  
  console.log('\n=== Test Complete ===');
}

testHotelRegistration().catch(console.error);