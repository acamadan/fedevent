# 🤖 FEDEVENT AI Assistant Guide

## Overview

The FEDEVENT AI Assistant is an intelligent chatbot powered by OpenAI's GPT-4o-mini model. It provides 24/7 support to website visitors, helping them with registration, answering policy questions, and guiding them through every step of their journey on the website.

## Features

### ✨ Core Capabilities

1. **Registration Assistance**
   - Step-by-step guidance through hotel registration forms
   - Field-by-field explanations
   - Requirement clarifications
   - Document upload help

2. **Policy & Compliance Questions**
   - NET30 payment terms explanations
   - Contract structure (Prime/Subcontractor)
   - SAM.gov registration requirements
   - Government contact policies
   - Compliance requirements

3. **Technical Support**
   - Form troubleshooting
   - Website navigation help
   - Browser compatibility issues
   - Upload problems

4. **General Information**
   - Company services
   - Contact information
   - Approval timelines
   - Contract award processes

### 🎯 Key Features

- **Context-Aware**: Knows what page the user is on and what forms they're viewing
- **Conversation Memory**: Remembers the last 10 exchanges for contextual responses
- **Form Field Detection**: Automatically detects when users focus on form fields and offers help
- **Quick Action Buttons**: Pre-defined questions for common inquiries
- **Real-time Responses**: Powered by OpenAI for intelligent, natural conversations
- **Fallback Support**: Provides contact information if AI service is unavailable
- **Mobile Responsive**: Works seamlessly on all devices
- **Dark Mode Support**: Automatically adapts to user's system preferences

## Architecture

### Backend (server.js)

**Endpoint**: `POST /api/chat/assistant`

**Request Body**:
```json
{
  "message": "User's question",
  "conversationHistory": [
    {"role": "user", "content": "previous message"},
    {"role": "assistant", "content": "previous response"}
  ],
  "currentPage": "hotel-registration",
  "formContext": {
    "hasForm": true,
    "formFields": [
      {
        "name": "hotel_name",
        "type": "text",
        "label": "Hotel Name",
        "required": true
      }
    ]
  }
}
```

**Response**:
```json
{
  "response": "AI-generated response text",
  "isAiResponse": true,
  "tokensUsed": 450
}
```

### Frontend (chat.js)

The chatbot is automatically loaded on all pages that include `chat.js`. It:

1. Creates a floating bubble in the bottom-right corner
2. Opens a chat panel when clicked
3. Detects form context and current page
4. Sends user messages to the backend API
5. Displays AI responses with proper formatting
6. Maintains conversation history for context

### Styling (site.css)

Modern, professional design with:
- Gradient backgrounds
- Smooth animations
- Typing indicators
- Message bubbles with avatars
- Quick action buttons
- Mobile-responsive layout

## Knowledge Base

The AI assistant has comprehensive knowledge about:

### Company Information
- FEDEVENT / CREATA Global Event Agency LLC
- Contact details: (305) 850-7848, info@fedevent.com
- Business hours and response times

### Contract Structure
- CREATA as prime contractor
- Hotels as subcontractors
- Government PO processes
- SAM.gov registration requirements

### Hotel Partnership
- AAA 2+ Diamond rating requirement
- Indoor facilities requirement
- NET30 payment terms (mandatory)
- Government PO acceptance
- Registration process (2-4 days)

### Payment Terms
- NET30 mandatory
- No deposits or upfront payments
- Invoice flow: Hotel → CREATA → Government → CREATA → Hotel
- Payment timeline (2-3 weeks for government processing)

### Policies & Rules
- Subcontractor rules (no direct government contact)
- Compliance requirements
- Account deactivation policy (180 days)
- Profile update procedures

### Services
- Event planning
- Hotel network
- Emergency services (24/7)
- Pricing structure

## Integration

The AI assistant is automatically included on pages that load `chat.js`. To add it to a new page:

```html
<script src="/chat.js"></script>
```

**Note**: The script automatically initializes when the DOM is ready.

## Usage Examples

### Example 1: Registration Help
**User**: "How do I fill out the hotel registration form?"

**AI**: "I'd be happy to guide you through the hotel registration form! Here's what you'll need to provide:

1. **Hotel Name**: Your official legal business name
2. **Contact Information**: Primary contact who will manage bookings
3. **Property Details**: Address, phone, email, website
4. **Room Information**: Total rooms, room types, capacities
5. **Meeting Spaces**: Names, capacities, available setups
6. **Amenities**: WiFi, parking, fitness center, etc.
7. **AAA Rating**: Must be 2+ Diamonds
8. **NET30 Acceptance**: Required for all contracts
9. **Government PO Acceptance**: Must confirm willingness
10. **Licenses & Insurance**: Upload required documents

Which section would you like me to explain in more detail?"

### Example 2: Payment Terms
**User**: "What are the NET30 payment terms?"

**AI**: "Great question! NET30 payment terms are mandatory for all CREATA government contracts. Here's how it works:

**Payment Process:**
1. You provide services and invoice CREATA directly
2. CREATA invoices the U.S. government
3. Government reviews and approves CREATA's invoice
4. Once government payment is received and cleared, CREATA releases funds to you
5. The NET30 countdown starts when the government approves CREATA's invoice
6. Generally takes 2-3 weeks for government processing

**Important Points:**
- NO deposits or upfront payments permitted
- NO advance payments for government contracts
- You invoice CREATA, not the government
- CREATA does NOT complete direct bill applications

This structure ensures federal compliance and protects all parties involved."

### Example 3: Field-Specific Help
When a user focuses on a form field, the chat bubble shows a tooltip:
"Need help with 'Hotel Official Address'? Click me!"

## Configuration

### OpenAI API Key

The AI assistant requires an OpenAI API key to function. Set it in your `.env` file:

```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### Model Selection

Currently using `gpt-4o-mini` for:
- High quality responses
- Lower cost per token
- Fast response times

To change the model, edit `server.js` line 9242:

```javascript
model: 'gpt-4o-mini', // Change to 'gpt-4' or 'gpt-3.5-turbo' if needed
```

### Token Limits

- **Max Tokens per Response**: 1000
- **Conversation History**: Last 10 exchanges (20 messages)
- **Temperature**: 0.7 (balanced creativity)
- **Presence Penalty**: 0.6 (encourages topic diversity)
- **Frequency Penalty**: 0.3 (reduces repetition)

## Cost Considerations

### Token Usage
- Average query: 500-800 tokens (input + output)
- Cost with gpt-4o-mini: ~$0.0003 per query
- 1000 queries ≈ $0.30

### Optimization Tips
1. Conversation history limited to 10 exchanges
2. Knowledge base included in system prompt (cached by OpenAI)
3. Efficient prompt engineering
4. Fallback to error messages on API failures

## Monitoring & Analytics

### Backend Logging
All chat interactions are logged to console:
```
Chatbot assistant error: [error details]
OpenAI response received, length: [characters]
```

### Google Analytics Integration
If GA4 is configured, chat events are tracked:
```javascript
gtag('event', 'chat_opened', {
  'event_category': 'User Interaction',
  'event_label': 'AI Assistant'
});
```

## Fallback Behavior

If OpenAI API is unavailable:
1. Backend returns friendly error message
2. User receives contact information
3. System continues to function (no crashes)
4. Error logged for debugging

Example fallback response:
"I apologize, but I'm experiencing technical difficulties right now. Please feel free to contact us directly at (305) 850-7848 or info@fedevent.com, and our team will be happy to assist you immediately!"

## Security

### Rate Limiting
Consider adding rate limiting to prevent abuse:
```javascript
// Example using express-rate-limit
import rateLimit from 'express-rate-limit';

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50 // limit each IP to 50 requests per windowMs
});

app.post('/api/chat/assistant', chatLimiter, async (req, res) => {
  // ... existing code
});
```

### Input Sanitization
User input is passed directly to OpenAI, which handles content filtering. However, consider:
- Maximum message length limits
- Content filtering on responses
- PII detection and handling

### API Key Protection
- Never expose OpenAI API key in frontend code
- Use environment variables
- Rotate keys regularly
- Monitor usage in OpenAI dashboard

## Maintenance

### Updating Knowledge Base
To update the AI's knowledge, edit the `knowledgeBase` variable in `server.js` (lines 8943-9181).

### Testing
Test the assistant with common queries:
1. "How do I register?"
2. "What are the payment terms?"
3. "Do I need SAM.gov registration?"
4. "How long does approval take?"
5. "Can I contact the government directly?"

### Monitoring
- Check OpenAI usage dashboard regularly
- Monitor error logs for API failures
- Track user engagement metrics
- Collect user feedback

## Future Enhancements

### Potential Features
1. **Multi-language Support**: Translate responses to Spanish, French, etc.
2. **Voice Input**: Allow users to speak their questions
3. **Document Upload**: Let users upload files for analysis
4. **Proactive Suggestions**: Offer help before users ask
5. **Sentiment Analysis**: Detect frustration and escalate to human support
6. **Integration with CRM**: Log conversations to customer database
7. **Custom Training**: Fine-tune model on specific company data
8. **Analytics Dashboard**: Visualize chat metrics and common questions

### Scaling Considerations
- Implement caching for common questions
- Use Redis for session management
- Load balance across multiple servers
- Consider managed OpenAI alternative (e.g., Azure OpenAI)

## Troubleshooting

### Chat Bubble Not Appearing
1. Check if `chat.js` is loaded: View source and search for `chat.js`
2. Check console for JavaScript errors
3. Verify z-index isn't being overridden by other elements

### AI Not Responding
1. Verify OpenAI API key is set in `.env`
2. Check server logs for errors
3. Test API key: `npm run test:openai`
4. Check OpenAI service status: https://status.openai.com

### Styling Issues
1. Verify `site.css` is loaded
2. Check for CSS conflicts with other stylesheets
3. Clear browser cache
4. Test in incognito mode

### Context Not Working
1. Ensure page name is detected correctly
2. Check form structure (inputs have names/IDs)
3. Verify conversation history is being sent
4. Check network tab for API request payload

## Support

For technical support or questions about the AI assistant:
- **Email**: info@fedevent.com
- **Phone**: (305) 850-7848
- **Documentation**: This guide

## License

This AI assistant is proprietary software for FEDEVENT / CREATA Global Event Agency LLC.

---

**Last Updated**: October 9, 2025
**Version**: 1.0.0
**Powered by**: OpenAI GPT-4o-mini

