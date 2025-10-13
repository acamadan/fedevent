// Comprehensive test to simulate the exact hotel registration form flow
async function testHotelRegistrationFlow() {
  console.log('=== Comprehensive Hotel Registration Flow Test ===\n');
  
  // Simulate what happens in the hotel registration form
  console.log('1. Simulating localStorage session retrieval...');
  
  // We can't access localStorage from Node.js, so we'll simulate having a valid session
  // Let's login first to get a valid session
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
  
  if (!loginData.ok) {
    console.log('❌ Login failed:', loginData.error);
    return;
  }
  
  const sessionId = loginData.sessionId;
  console.log('✅ Got session ID:', sessionId.substring(0, 20) + '...\n');
  
  // 2. Simulate the form's session validation (exactly as in the form)
  console.log('2. Simulating form session validation...');
  
  try {
    const sessionCheck = await fetch('http://localhost:5050/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${sessionId}`
      }
    });
    
    console.log('   Session check status:', sessionCheck.status);
    
    if (!sessionCheck.ok) {
      console.log('❌ Session validation failed!');
      return;
    }
    
    console.log('✅ Session validation passed\n');
  } catch (sessionError) {
    console.log('❌ Session validation error:', sessionError.message);
    return;
  }
  
  // 3. Simulate form submission with proper headers
  console.log('3. Simulating form submission...');
  
  // Create minimal form data (what the form would send)
  const formData = new FormData();
  formData.append('hotel_name', 'Test Hotel ' + Date.now());
  formData.append('address', '123 Test Street');
  formData.append('city', 'Test City');
  formData.append('country', 'USA');
  formData.append('sales_director_name', 'Test Director');
  formData.append('sales_director_email', 'director@test.com');
  formData.append('ar_name', 'Test AR');
  formData.append('ar_email', 'ar@test.com');
  formData.append('accepts_net30', 'Yes');
  formData.append('accepts_po', 'Yes');
  
  try {
    const submitResponse = await fetch('http://localhost:5050/api/submit', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${sessionId}`
      }
    });
    
    console.log('   Submit response status:', submitResponse.status);
    
    if (submitResponse.ok) {
      const result = await submitResponse.json();
      console.log('✅ Form submission successful!');
      console.log('   Result:', result);
    } else {
      const errorResult = await submitResponse.json().catch(() => ({}));
      console.log('❌ Form submission failed!');
      console.log('   Error:', errorResult.error || 'Unknown error');
    }
  } catch (submitError) {
    console.log('❌ Form submission error:', submitError.message);
  }
  
  console.log('\n=== Test Complete ===');
}

testHotelRegistrationFlow().catch(console.error);