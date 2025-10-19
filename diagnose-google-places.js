// Diagnostic script for Google Places API
import 'dotenv/config';
import fetch from 'node-fetch';

console.log('=== Google Places API Diagnostic Tool ===\n');

// Check if API key is set
const apiKey = process.env.GOOGLE_PLACES_API_KEY;
console.log('1. API Key Check:');
if (!apiKey) {
    console.log('   ❌ API key not found in environment variables');
    process.exit(1);
} else if (apiKey === 'YOUR_GOOGLE_PLACES_API_KEY_HERE' || apiKey === '' || apiKey === 'YOUR_NEW_SECURE_API_KEY_HERE' || apiKey === 'YOUR_ACTUAL_GOOGLE_PLACES_API_KEY_HERE') {
    console.log('   ❌ API key is set to a placeholder value');
    process.exit(1);
} else {
    console.log(`   ✅ API key found: ${apiKey.substring(0, 10)}...`);
}

// Test API key with a simple request
console.log('\n2. API Key Validation Test:');
try {
    const testResponse = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
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

    const testData = await testResponse.json();
    
    if (testResponse.ok) {
        console.log('   ✅ API key is valid and working');
        console.log(`   ✅ Status: ${testResponse.status} ${testResponse.statusText}`);
        console.log(`   ✅ Found ${testData.places ? testData.places.length : 0} places`);
    } else {
        console.log('   ❌ API key validation failed');
        console.log(`   ❌ Status: ${testResponse.status} ${testResponse.statusText}`);
        console.log(`   ❌ Error: ${JSON.stringify(testData, null, 2)}`);
        
        // Provide specific troubleshooting guidance based on error
        if (testData.error && testData.error.message) {
            if (testData.error.message.includes('API key not valid')) {
                console.log('\n   💡 Troubleshooting tip: Check Google Cloud Console API key restrictions');
                console.log('      - Ensure API key is restricted to HTTP referrer: http://localhost:7070/*');
                console.log('      - Verify "Places API (New)" is enabled in APIs & Services');
                console.log('      - Confirm billing is enabled for your project');
            } else if (testData.error.message.includes('PERMISSION_DENIED')) {
                console.log('\n   💡 Troubleshooting tip: Check API key permissions');
                console.log('      - Ensure API key has access to Places API (New)');
                console.log('      - Verify all required APIs are enabled');
            }
        }
    }
} catch (error) {
    console.log('   ❌ Failed to test API key:', error.message);
}

// Check enabled APIs (we can't do this programmatically, but we can provide guidance)
console.log('\n3. Google Cloud Console Configuration Check:');
console.log('   Please verify in Google Cloud Console:');
console.log('   ✅ "Maps JavaScript API" is enabled');
console.log('   ✅ "Places API" is enabled');
console.log('   ✅ "Places API (New)" is enabled');
console.log('   ✅ API key is restricted to HTTP referrer: http://localhost:7070/*');
console.log('   ✅ API key has access to all three APIs listed above');
console.log('   ✅ Billing is enabled for your project');

console.log('\n=== Diagnostic Complete ===');