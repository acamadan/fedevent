// Detailed diagnostic script for Google Places API
import 'dotenv/config';
import fetch from 'node-fetch';

console.log('=== Detailed Google Places API Diagnostic Tool ===\n');

// Check if API key is set
const apiKey = process.env.GOOGLE_PLACES_API_KEY;
console.log('1. API Key Check:');
if (!apiKey) {
    console.log('   ❌ API key not found in environment variables');
    process.exit(1);
} else if (apiKey === 'YOUR_GOOGLE_PLACES_API_KEY_HERE' || apiKey === '' || apiKey === 'YOUR_NEW_SECURE_API_KEY_HERE' || apiKey === 'YOUR_ACTUAL_GOOGLE_PLACES_API_KEY_HERE') {
    console.log('   ❌ API key is set to a placeholder value');
    console.log('   💡 Solution: Replace the placeholder with your actual Google Places API key in the .env file');
    process.exit(1);
} else {
    console.log(`   ✅ API key found: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}`);
    console.log(`   ✅ API key length: ${apiKey.length} characters`);
}

// Test different API endpoints to isolate the issue
console.log('\n2. API Endpoint Testing:');

// Test 1: Basic Places API (New) endpoint
console.log('\n   Test 1: Places API (New) - Basic Search');
try {
    console.log('   Sending request to: https://places.googleapis.com/v1/places:searchText');
    const testResponse1 = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName'
        },
        body: JSON.stringify({
            textQuery: 'hotel',
            maxResultCount: 1
        })
    });

    const testData1 = await testResponse1.json();
    
    if (testResponse1.ok) {
        console.log('   ✅ Places API (New) is working');
        console.log(`   ✅ Status: ${testResponse1.status} ${testResponse1.statusText}`);
        console.log(`   ✅ Found ${testData1.places ? testData1.places.length : 0} places`);
    } else {
        console.log('   ❌ Places API (New) failed');
        console.log(`   ❌ Status: ${testResponse1.status} ${testResponse1.statusText}`);
        console.log(`   ❌ Error: ${JSON.stringify(testData1, null, 2)}`);
        
        // Provide specific troubleshooting guidance based on error
        if (testData1.error && testData1.error.message) {
            if (testData1.error.message.includes('API key not valid')) {
                console.log('\n   💡 Troubleshooting tip: API key validation failed');
                console.log('      - Check Google Cloud Console API key restrictions');
                console.log('      - Ensure API key is restricted to HTTP referrer: http://localhost:5050/*');
                console.log('      - Verify "Places API (New)" is enabled in APIs & Services');
                console.log('      - Confirm billing is enabled for your project');
            } else if (testData1.error.message.includes('PERMISSION_DENIED')) {
                console.log('\n   💡 Troubleshooting tip: Permission denied');
                console.log('      - Ensure API key has access to Places API (New)');
                console.log('      - Verify all required APIs are enabled');
                console.log('      - Check if the API key is restricted to specific APIs');
            } else if (testData1.error.message.includes('INVALID_ARGUMENT')) {
                console.log('\n   💡 Troubleshooting tip: Invalid argument');
                console.log('      - Check if the X-Goog-FieldMask header is properly formatted');
                console.log('      - Verify the request body is correctly structured');
            }
        }
    }
} catch (error) {
    console.log('   ❌ Failed to test Places API (New):', error.message);
}

// Test 2: Try with a different field mask
console.log('\n   Test 2: Places API (New) - Different Field Mask');
try {
    console.log('   Sending request with wildcard field mask (for testing only)');
    const testResponse2 = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': '*'  // Wildcard for testing
        },
        body: JSON.stringify({
            textQuery: 'hotel',
            maxResultCount: 1
        })
    });

    const testData2 = await testResponse2.json();
    
    if (testResponse2.ok) {
        console.log('   ✅ Places API (New) with wildcard field mask is working');
        console.log(`   ✅ Status: ${testResponse2.status} ${testResponse2.statusText}`);
    } else {
        console.log('   ❌ Places API (New) with wildcard field mask failed');
        console.log(`   ❌ Status: ${testResponse2.status} ${testResponse2.statusText}`);
        console.log(`   ❌ Error: ${JSON.stringify(testData2, null, 2)}`);
    }
} catch (error) {
    console.log('   ❌ Failed to test Places API (New) with wildcard field mask:', error.message);
}

// Test 3: Verify API key format
console.log('\n3. API Key Format Verification:');
const apiKeyPattern = /^AIza[0-9A-Za-z-_]{35}$/;
if (apiKeyPattern.test(apiKey)) {
    console.log('   ✅ API key format appears to be correct');
} else {
    console.log('   ❌ API key format may be incorrect');
    console.log('   💡 Google API keys typically start with "AIza" and are 39 characters long');
    console.log(`   💡 Your key: ${apiKey}`);
}

// Test 4: Check if key works with a simple HTTP request
console.log('\n4. Simple HTTP Request Test:');
try {
    console.log('   Testing basic connectivity to Google APIs');
    const simpleResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=New+York&key=${apiKey}`, {
        method: 'GET'
    });
    
    const simpleData = await simpleResponse.json();
    
    if (simpleResponse.ok) {
        console.log('   ✅ Basic Google Maps API connectivity working');
        console.log(`   ✅ Status: ${simpleResponse.status} ${simpleResponse.statusText}`);
    } else {
        console.log('   ❌ Basic Google Maps API connectivity failed');
        console.log(`   ❌ Status: ${simpleResponse.status} ${simpleResponse.statusText}`);
        console.log(`   ❌ Error: ${JSON.stringify(simpleData, null, 2)}`);
    }
} catch (error) {
    console.log('   ❌ Failed basic connectivity test:', error.message);
}

// Summary and recommendations
console.log('\n=== Diagnostic Summary ===');
console.log('Based on the tests above, here are recommendations:');

console.log('\n1. If API key validation failed:');
console.log('   - Double-check your API key in Google Cloud Console');
console.log('   - Verify API key restrictions include http://localhost:5050/*');
console.log('   - Ensure "Places API (New)" is enabled');
console.log('   - Confirm billing is enabled for your project');

console.log('\n2. If field mask issues were detected:');
console.log('   - Ensure you are using the correct X-Goog-FieldMask format');
console.log('   - For development, you can use "*" but avoid in production');

console.log('\n3. If connectivity issues were detected:');
console.log('   - Check your internet connection');
console.log('   - Verify firewall settings are not blocking requests');
console.log('   - Try using a different network');

console.log('\n=== Additional Troubleshooting Steps ===');
console.log('1. Wait 5 minutes for API key changes to propagate');
console.log('2. Try creating a new unrestricted API key for testing');
console.log('3. Check Google Cloud Console logs for more details');
console.log('4. Verify you are using the correct Google Cloud project');

console.log('\n=== Diagnostic Complete ===');