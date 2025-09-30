# GSA Per Diem API Setup Guide

## Overview
This guide explains how to properly configure and use the GSA Per Diem API in the FEDEVENT application.

## Prerequisites
1. A valid GSA API key (obtain from https://api.gsa.gov/)

## Setup Instructions

### 1. Obtain GSA API Key
1. Visit https://api.gsa.gov/
2. Register for an account or log in if you already have one
3. Navigate to the "API Keys" section
4. Generate a new API key for the "Per Diem API"
5. Copy the API key for use in the next step

### 2. Configure API Key
1. Open the `.env` file in the project root directory
2. Find the line that says `GSA_API_KEY=YOUR_GSA_API_KEY_HERE`
3. Replace `YOUR_GSA_API_KEY_HERE` with your actual GSA API key
4. Save the file

Example:
```env
# Before
GSA_API_KEY=YOUR_GSA_API_KEY_HERE

# After (with a real API key)
GSA_API_KEY=a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8
```

### 3. Verify API Integration
Run the test script to verify the API is working correctly:

```bash
node test-gsa-api.js
```

If configured correctly, you should see output similar to:
```
Testing GSA Per Diem API Integration
=====================================
GSA API Key configured: true
GSA API Key (first 10 chars): a1b2c3d4-e...

--- Test 1: State Rates ---
Testing URL: https://api.gsa.gov/travel/perdiem/v2/rates/state/MT/year/2025
Response status: 200
✅ State rates API working
```

## API Endpoints Used

The application uses the following GSA Per Diem API endpoints according to the OpenAPI specification:

1. `GET /v2/rates/city/{city}/state/{state}/year/{year}` - Get per diem rates by city, state, and year
2. `GET /v2/rates/state/{state}/year/{year}` - Get per diem rates for all counties/cities, by state and year
3. `GET /v2/rates/zip/{zip}/year/{year}` - Get per diem rates by ZIP code and year
4. `GET /v2/rates/conus/lodging/{year}` - Lodging rates for the Continental US by year
5. `GET /v2/rates/conus/zipcodes/{year}` - Mapping of ZIP code to Destination-IDs and state locations

## Troubleshooting

### Common Issues

1. **API Key Not Configured**
   - Error: "GSA API Key not configured or using placeholder value"
   - Solution: Follow the setup instructions to add your real API key to the `.env` file

2. **API Key Invalid**
   - Error: "403 Forbidden" or "API key is invalid"
   - Solution: Verify your API key is correct and has permissions for the Per Diem API

3. **Rate Limiting**
   - Error: "429 Too Many Requests"
   - Solution: The GSA API has a rate limit of 1,000 requests per hour. Wait and try again later.

4. **Network Issues**
   - Error: "Network error" or "Timeout"
   - Solution: Check your internet connection and firewall settings

### Fallback Behavior
When the GSA API is not available or misconfigured, the application will:
1. Fall back to mock data for demonstration purposes
2. Display a note indicating that mock data is being used
3. Continue to function with limited data accuracy

## Testing Without API Key
If you don't have a GSA API key, the application will still work with mock data. However, this data is not accurate and should only be used for testing purposes.

To test with mock data:
1. Ensure the `GSA_API_KEY` in `.env` is set to `YOUR_GSA_API_KEY_HERE` or is missing
2. Run the application normally
3. The application will automatically use mock data

## Security Considerations
- Never commit your real API key to version control
- The `.env` file is included in `.gitignore` to prevent accidental commits
- Use environment variables for API keys in production deployments