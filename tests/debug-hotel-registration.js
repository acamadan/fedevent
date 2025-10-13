// Debug the hotel registration authentication issue
const fetch = require('node-fetch');

async function debugRegistrationFlow() {
  console.log('=== Debugging Hotel Registration Authentication ===\n');
  
  try {
    // Step 1: Login as hotel user
    console.log('1. Attempting login...');
    const loginResponse = await fetch('http://localhost:5050/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'info@creataglobal.com',
        password: 'test123'
      })
    });
    
    console.log('Login status:', loginResponse.status);
    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);
    
    if (!loginData.ok) {
      console.log('❌ Login failed, stopping test');
      return;
    }
    
    const sessionId = loginData.sessionId;
    console.log('✅ Session ID obtained:', sessionId.substring(0, 20) + '...\n');
    
    // Step 2: Test session validation (like /api/auth/me)
    console.log('2. Testing session validation with /api/auth/me...');
    const meResponse = await fetch('http://localhost:5050/api/auth/me', {
      headers: { 'Authorization': `Bearer ${sessionId}` }
    });
    
    console.log('Auth/me status:', meResponse.status);
    const meData = await meResponse.json();
    console.log('Auth/me response:', meData);
    
    if (!meResponse.ok) {
      console.log('❌ Session validation failed, stopping test');
      return;
    }
    
    // Step 3: Test hotel profile access (the failing endpoint)
    console.log('\n3. Testing hotel profile access...');
    const profileResponse = await fetch('http://localhost:5050/api/hotel/profile', {
      headers: { 'Authorization': `Bearer ${sessionId}` }
    });
    
    console.log('Profile status:', profileResponse.status);
    const profileData = await profileResponse.json();
    console.log('Profile response:', profileData);
    
    if (profileResponse.status === 403) {
      console.log('❌ Hotel access required error - this is the issue!');
      console.log('User data from auth/me:', {
        role: meData.user?.role,
        hotel_id: meData.user?.hotel_id
      });
    } else if (profileResponse.ok) {
      console.log('✅ Hotel profile access successful');
    }
    
    // Step 4: Test form submission endpoint
    console.log('\n4. Testing form submission endpoint...');
    const submitResponse = await fetch('http://localhost:5050/api/submit', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${sessionId}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        form_type: 'hotel_profile_v2',
        hotel_name: 'Test Hotel',
        city: 'Test City',
        state: 'FL',
        country: 'US'
      })
    });
    
    console.log('Submit status:', submitResponse.status);
    const submitData = await submitResponse.json();
    console.log('Submit response:', submitData);
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

// Run the debug
debugRegistrationFlow();