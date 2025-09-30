# OpenAI Integration for FEDEVENT

This document explains how to set up and use the OpenAI integration in your FEDEVENT project.

## 🚀 Setup Instructions

### 1. Environment Configuration

Add your OpenAI API key to your `.env` file:

```bash
# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here
```

### 2. Get an OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in to your account
3. Create a new API key
4. Copy the key and add it to your `.env` file

### 3. Test the Integration

Run the test script to verify everything is working:

```bash
npm run test:openai
```

## 🔧 Available API Endpoints

### 1. Code Review (`POST /api/openai/code-review`)

Reviews code for quality, security, performance, and maintainability.

**Request Body:**
```json
{
  "code": "console.log('Hello World');",
  "language": "javascript",
  "focus": "general"
}
```

**Focus Options:**
- `general` - Overall code review
- `security` - Security vulnerabilities
- `performance` - Performance optimizations
- `refactor` - Refactoring suggestions

### 2. Document Analysis (`POST /api/openai/analyze-document`)

Analyzes documents for summaries, key points, requirements, or action items.

**Request Body:**
```json
{
  "text": "Document content here...",
  "analysis_type": "summary"
}
```

**Analysis Types:**
- `summary` - Document summary
- `key_points` - Extract key information
- `requirements` - Extract requirements
- `action_items` - Identify action items

### 3. Proposal Generation (`POST /api/openai/generate-proposal`)

Generates professional contract proposals based on requirements.

**Request Body:**
```json
{
  "requirements": "Hotel services for government contract...",
  "hotel_info": "Hotel details and capabilities...",
  "contract_type": "hotel_services"
}
```

### 4. General Assistant (`POST /api/openai/assistant`)

General AI assistant for federal contracting and hotel management questions.

**Request Body:**
```json
{
  "message": "How do I handle government contract compliance?",
  "context": "Optional context information..."
}
```

## 🖥️ Frontend Interface

Access the OpenAI Assistant interface at:
```
http://localhost:5050/openai-assistant.html
```

The interface provides:
- **Code Review Tab**: Upload and review code
- **Document Analysis Tab**: Analyze documents
- **Proposal Generator Tab**: Generate contract proposals
- **General Assistant Tab**: Ask questions

## 💰 Token Usage and Costs

Each API call returns token usage information:

```json
{
  "response": "AI response here...",
  "tokens_used": 150
}
```

**Estimated Costs (GPT-3.5-turbo):**
- Input: $0.0005 per 1K tokens
- Output: $0.0015 per 1K tokens

**Example costs per feature:**
- Code Review: ~$0.002-0.005 per review
- Document Analysis: ~$0.001-0.003 per analysis
- Proposal Generation: ~$0.003-0.008 per proposal

## 🔒 Authentication

All OpenAI endpoints require authentication. Users must be logged in with a valid session token.

## 🛠️ Development

### Adding New Features

1. Add new endpoint in `server.js`
2. Follow the existing pattern:
   - Check for OpenAI client availability
   - Validate input
   - Create appropriate prompt
   - Call OpenAI API
   - Return structured response

### Error Handling

The integration includes comprehensive error handling:
- API key validation
- Input validation
- OpenAI API error handling
- Graceful degradation when service unavailable

## 📊 Monitoring

Monitor OpenAI usage through:
- Token usage returned in API responses
- Server logs for API calls
- OpenAI dashboard for detailed usage stats

## 🔧 Troubleshooting

### Common Issues

1. **"OpenAI service not available"**
   - Check if OPENAI_API_KEY is set in .env
   - Verify API key is valid

2. **Authentication errors**
   - Ensure user is logged in
   - Check session token validity

3. **Rate limiting**
   - OpenAI has rate limits per API key
   - Consider implementing request queuing for high volume

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=openai
```

## 🚀 Production Deployment

For production deployment:

1. **Set environment variables:**
   ```bash
   OPENAI_API_KEY=your_production_key
   NODE_ENV=production
   ```

2. **Monitor usage and costs**
3. **Set up rate limiting if needed**
4. **Consider caching for repeated requests**

## 📝 Examples

### JavaScript Code Review Example

```javascript
// Frontend JavaScript
const response = await fetch('/api/openai/code-review', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  },
  body: JSON.stringify({
    code: 'function hello() { console.log("Hello"); }',
    language: 'javascript',
    focus: 'general'
  })
});

const result = await response.json();
console.log(result.review);
```

### Document Analysis Example

```javascript
const response = await fetch('/api/openai/analyze-document', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  },
  body: JSON.stringify({
    text: 'Contract document content...',
    analysis_type: 'requirements'
  })
});

const result = await response.json();
console.log(result.analysis);
```

---

## 🤝 Support

For issues with OpenAI integration:
1. Check the troubleshooting section
2. Review server logs
3. Test with the integration test script
4. Contact the development team