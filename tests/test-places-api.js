// Simple test script to verify Google Places API functionality
async function testGooglePlacesAPI() {
    try {
        console.log('Testing Google Places API key endpoint...');
        
        // Test the API key endpoint
        const response = await fetch('http://localhost:7070/api/google-places-key');
        
        if (!response.ok) {
            console.log(`Failed to get API key: ${response.status} ${response.statusText}`);
            return;
        }
        
        const data = await response.json();
        console.log('API Key Status:', data.apiKey ? 'Received' : 'Not found');
        
        if (data.apiKey) {
            console.log('API Key (first 10 chars):', data.apiKey.substring(0, 10) + '...');
            
            // Test a simple Places API request
            console.log('Testing Places API request...');
            const placesResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': data.apiKey,
                    'X-Goog-FieldMask': 'places.id,places.displayName'
                },
                body: JSON.stringify({
                    textQuery: 'hotel',
                    maxResultCount: 2
                })
            });
            
            if (!placesResponse.ok) {
                console.log(`Places API request failed: ${placesResponse.status} ${placesResponse.statusText}`);
                return;
            }
            
            const placesData = await placesResponse.json();
            console.log('Places API Response:', JSON.stringify(placesData, null, 2));
        }
    } catch (error) {
        console.error('Error testing Google Places API:', error.message);
    }
}

// Run the test
testGooglePlacesAPI();