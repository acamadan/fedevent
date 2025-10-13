// Test script to verify the new Google Places API key
async function testNewApiKey() {
    const apiKey = 'AIzaSyABdwje_wVZfSJi2fcfZQkxI1WhSJnlM3M';
    
    console.log('Testing new Google Places API key:', apiKey.substring(0, 10) + '...');
    
    try {
        // Test a simple Places API request
        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
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
        
        console.log('API request status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ API key is working correctly!');
            console.log('Sample response:', JSON.stringify(data, null, 2));
        } else {
            const errorText = await response.text();
            console.log('❌ API key test failed with status:', response.status);
            console.log('Error details:', errorText);
        }
    } catch (error) {
        console.error('❌ Error testing API key:', error.message);
    }
}

testNewApiKey();