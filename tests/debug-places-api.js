// Debug script to test Google Places API requests
async function debugPlacesAPI() {
    try {
        console.log('Fetching API key from server...');
        
        // Get the API key
        const keyResponse = await fetch('http://localhost:7070/api/google-places-key');
        if (!keyResponse.ok) {
            console.error('Failed to get API key:', keyResponse.status, await keyResponse.text());
            return;
        }
        
        const keyData = await keyResponse.json();
        const apiKey = keyData.apiKey;
        console.log('API Key (first 10 chars):', apiKey.substring(0, 10) + '...');
        
        // Test 1: Basic search request
        console.log('\n--- Test 1: Basic Search Request ---');
        const searchResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName'
            },
            body: JSON.stringify({
                textQuery: 'hotel',
                maxResultCount: 2
            })
        });
        
        console.log('Search request status:', searchResponse.status);
        if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            console.error('Search request failed:', searchResponse.status, errorText);
        } else {
            const searchData = await searchResponse.json();
            console.log('Search response:', JSON.stringify(searchData, null, 2));
            
            // Test 2: Get place details (if we have results)
            if (searchData.places && searchData.places.length > 0) {
                const placeId = searchData.places[0].id;
                console.log('\n--- Test 2: Place Details Request ---');
                console.log('Getting details for place ID:', placeId);
                
                const detailsResponse = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
                    method: 'GET',
                    headers: {
                        'X-Goog-Api-Key': apiKey,
                        'X-Goog-FieldMask': 'id,displayName'
                    }
                });
                
                console.log('Details request status:', detailsResponse.status);
                if (!detailsResponse.ok) {
                    const errorText = await detailsResponse.text();
                    console.error('Details request failed:', detailsResponse.status, errorText);
                } else {
                    const detailsData = await detailsResponse.json();
                    console.log('Details response:', JSON.stringify(detailsData, null, 2));
                }
            }
        }
    } catch (error) {
        console.error('Error in debug script:', error);
    }
}

debugPlacesAPI();