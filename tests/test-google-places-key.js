// Test script to verify Google Places API key
import 'dotenv/config';
import fetch from 'node-fetch';

async function testGooglePlacesApiKey() {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    console.log('Testing Google Places API Key...');
    console.log('API Key prefix:', apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET');
    
    if (!apiKey || apiKey === 'YOUR_GOOGLE_PLACES_API_KEY_HERE' || apiKey === '' || apiKey === 'YOUR_NEW_SECURE_API_KEY_HERE' || apiKey === 'YOUR_ACTUAL_GOOGLE_PLACES_API_KEY_HERE') {
        console.log('❌ API Key not properly configured');
        return;
    }
    
    try {
        // Test the API with a simple query
        const response = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName'
            },
            body: JSON.stringify({
                textQuery: 'hotel',
                maxResultCount: 3
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('✅ Google Places API Test: SUCCESS');
            console.log(`Status: ${response.status} ${response.statusText}`);
            console.log(`Results: ${data.places ? data.places.length : 0} places found`);
        } else {
            console.log('❌ Google Places API Test: FAILED');
            console.log(`Status: ${response.status} ${response.statusText}`);
            console.log(`Error: ${JSON.stringify(data, null, 2)}`);
        }
    } catch (error) {
        console.log('❌ Error testing Google Places API:', error.message);
    }
}

testGooglePlacesApiKey();