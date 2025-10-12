# 🤖 AI Assistant - Quick Setup Guide

## What Was Built

You now have a **comprehensive AI-powered assistant** that helps users throughout their journey on your website. The assistant can:

✅ **Help with Registration** - Guides users step-by-step through the hotel registration form  
✅ **Answer Policy Questions** - Explains payment terms, contract structure, compliance requirements  
✅ **Provide Technical Support** - Helps with form issues, navigation, and website problems  
✅ **Detect Form Context** - Knows what page users are on and what fields they're working with  
✅ **Remember Conversations** - Maintains context for natural, flowing conversations  
✅ **Available 24/7** - AI-powered responses with comprehensive knowledge base  

## Files Created/Modified

### New Files
1. **`public/chat.js`** - Enhanced AI chatbot frontend (370 lines)
2. **`AI_ASSISTANT_GUIDE.md`** - Complete documentation (300+ lines)
3. **`test-ai-assistant.js`** - Test script for the AI assistant
4. **`AI_ASSISTANT_SETUP.md`** - This setup guide

### Modified Files
1. **`server.js`** - Added `/api/chat/assistant` endpoint with comprehensive knowledge base
2. **`public/site.css`** - Added modern, professional chat styling
3. **`package.json`** - Added `test:assistant` script

## Quick Start

### 1. Verify OpenAI API Key

Make sure your `.env` file has the OpenAI API key:

```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

If not set, run:
```bash
./setup-openai.sh
# or on Windows:
# setup-openai.bat
```

### 2. Start the Server

```bash
npm start
```

The server will run on port **7070**.

### 3. Test the AI Assistant

Run the test script:
```bash
npm run test:assistant
```

This will test 5 common questions and verify everything is working.

### 4. Try It Live

1. Open your browser to: **http://localhost:7070/hotel-registration.html**
2. Look for the **blue AI chat bubble** in the bottom-right corner (with a pulsing animation)
3. Click the bubble to open the chat panel
4. Try asking questions like:
   - "How do I fill out this registration form?"
   - "What are the NET30 payment terms?"
   - "Do I need SAM.gov registration?"
   - "Can I contact the government directly?"

### 5. Test Form Field Detection

1. Click on any input field in the registration form
2. Notice the chat bubble shows a tooltip: "Need help with [field name]? Click me!"
3. Click the bubble and ask about that specific field

## Features Demonstration

### Smart Context Awareness

The AI knows:
- **What page the user is on** (e.g., "hotel-registration")
- **What forms are present** on the page
- **What fields are in the form** (names, types, labels, required status)
- **Conversation history** (last 10 exchanges)

### Quick Action Buttons

When users first open the chat on a form page, they see quick action buttons:
- 📋 Help with form
- 💰 Payment terms
- ✅ Requirements
- ⏰ Approval time

### Intelligent Responses

The AI assistant has comprehensive knowledge about:
- Company information and contact details
- Contract structure (CREATA as prime contractor)
- Hotel partnership requirements
- NET30 payment terms and invoice flow
- SAM.gov registration (not required for hotels)
- Approval process (2-4 days)
- Subcontractor rules (critical policies)
- All services offered by FEDEVENT

## Knowledge Base Coverage

The AI can answer questions about:

### ✅ Registration Process
- How to register
- What documents are needed
- Field-by-field form explanations
- Approval timeline
- Requirements checklist

### ✅ Payment & Contracts
- NET30 payment terms
- Invoice flow and timeline
- Prime contractor vs subcontractor
- Government PO process
- Direct billing policy

### ✅ Compliance & Requirements
- AAA 2+ Diamond rating
- Indoor facilities requirement
- SAM.gov registration (not needed)
- Government contact policies
- Compliance standards

### ✅ Technical Support
- Form filling help
- Document upload assistance
- Browser issues
- Navigation help

### ✅ Company Information
- Services offered
- Contact information
- Business hours
- Emergency services (24/7)

## Example Conversations

### Example 1: New Hotel Registration

**User**: "I want to join your network. How do I start?"

**AI**: "Welcome! I'm excited to help you join CREATA's Preferred Vendor Network. Here's the registration process:

**Step 1: Check Requirements**
- AAA 2+ Diamond rating (required)
- Indoor facilities only
- Must accept NET30 payment terms
- Must accept government purchase orders

**Step 2: Complete Registration Form**
Visit our hotel registration page and provide:
- Hotel information (name, address, contact)
- Room details (types, counts, capacities)
- Meeting spaces (names, setups, capacities)
- Amenities and services
- Required documents (licenses, insurance)

**Step 3: Submit & Wait**
- We review within 2-4 business days
- You'll receive email notification
- Once approved, you're added to our network

**Important**: As a hotel partner, you'll be a subcontractor under CREATA (the prime contractor). This means:
- You invoice CREATA directly (not the government)
- NET30 payment terms apply (mandatory)
- NO SAM.gov registration required for you

Would you like me to guide you through the registration form step-by-step?"

### Example 2: Payment Terms Clarification

**User**: "When will I get paid?"

**AI**: "Great question! Here's how payment works under NET30 terms:

**Payment Flow:**
1. You provide services and invoice CREATA directly
2. CREATA invoices the U.S. government
3. Government reviews and approves CREATA's invoice (2-3 weeks typically)
4. Once government payment received and cleared, CREATA releases funds to you
5. Payment released within 30 days of government payment clearance

**Timeline:**
- Government processing: 2-3 weeks
- NET30 after government approval
- Total time: Approximately 5-7 weeks from invoice submission

**Critical Points:**
- NO deposits or upfront payments permitted
- You must wait for government to pay CREATA first
- This protects both parties and ensures compliance
- All federal contracts operate this way

**Why NET30?**
This is a federal requirement that ensures proper accountability and prevents fraud in government contracting.

Need more details about the payment process?"

### Example 3: Form Field Help

**User**: "What should I put in the 'Meeting Spaces' section?"

**AI**: "Let me explain the Meeting Spaces section - this is crucial for government bookings!

**What to Include:**
1. **Space Name**: e.g., "Grand Ballroom", "Conference Room A"
2. **Square Footage**: Exact measurements if available
3. **Maximum Capacity**: How many people it can hold
4. **Setup Styles**: Check all that apply:
   - Theater style
   - Classroom style
   - Boardroom
   - U-shape
   - Banquet rounds
   - Reception/cocktail

**Why This Matters:**
Government events often have specific space requirements. Accurate information helps us match your hotel to relevant opportunities.

**Tips:**
- Be specific and accurate
- Include all available spaces (even smaller breakout rooms)
- Update capacity numbers regularly
- Mention special features (AV equipment, natural light, etc.)

**Example Entry:**
```
Name: Executive Boardroom
Size: 600 sq ft
Capacity: 20 people (boardroom), 30 (theater)
Setups: Boardroom, U-shape, Theater
Features: Built-in AV, whiteboard, natural lighting
```

Would you like help with any other sections of the form?"

## Technical Details

### API Endpoint

**URL**: `/api/chat/assistant`  
**Method**: POST  
**Authentication**: None required (public endpoint)  
**Model**: GPT-4o-mini  
**Max Tokens**: 1000 per response  
**Conversation Memory**: Last 10 exchanges  

### Token Usage & Costs

- Average query: 500-800 tokens
- Cost per query: ~$0.0003 (using gpt-4o-mini)
- 1000 queries ≈ $0.30

Very affordable for continuous operation!

### Fallback Behavior

If OpenAI API is unavailable, the assistant will:
1. Return a friendly error message
2. Provide contact information (phone/email)
3. Log the error for debugging
4. Not crash the website

## Customization

### Update Knowledge Base

To add or modify information, edit `server.js` around line 8943-9181.

Example:
```javascript
const knowledgeBase = `
... existing content ...

## New Section
Your new information here
`;
```

### Change AI Model

In `server.js` line 9242:
```javascript
model: 'gpt-4o-mini', // Change to 'gpt-4' for higher quality
```

### Adjust Response Length

In `server.js` line 9244:
```javascript
max_tokens: 1000, // Increase for longer responses
```

### Modify Styling

Edit `public/site.css` starting at line 50 for chat bubble and panel styling.

## Monitoring

### Check Logs

Watch server logs for chat interactions:
```bash
tail -f server.log
```

### OpenAI Usage

Monitor usage in your OpenAI dashboard:
https://platform.openai.com/usage

### Test Regularly

Run periodic tests:
```bash
npm run test:assistant
```

## Troubleshooting

### Chat Bubble Not Appearing

**Issue**: No chat bubble visible on the page

**Solutions**:
1. Check if `chat.js` is loaded: View page source, search for "chat.js"
2. Open browser console (F12), look for JavaScript errors
3. Clear browser cache (Ctrl+Shift+Delete)
4. Try incognito/private browsing mode

### AI Not Responding

**Issue**: Chat bubble works but no responses

**Solutions**:
1. Verify server is running: `npm start`
2. Check server logs for errors: `tail -f server.log`
3. Test OpenAI API key: `npm run test:openai`
4. Check OpenAI service status: https://status.openai.com
5. Verify `.env` has valid API key

### Slow Responses

**Issue**: AI takes too long to respond

**Possible Causes**:
- High OpenAI API load (peak times)
- Internet connection issues
- Server resource constraints
- Large conversation history

**Solutions**:
- Wait a bit longer (first response may be slower)
- Clear conversation history (close/reopen chat)
- Check your internet speed
- Consider upgrading server resources

### Incorrect Answers

**Issue**: AI gives wrong or outdated information

**Solutions**:
1. Update knowledge base in `server.js`
2. Increase token limit for more detailed responses
3. Adjust temperature setting (lower = more focused)
4. Test with more specific questions

## Next Steps

### Recommended Enhancements

1. **Add Rate Limiting** - Prevent abuse
2. **Track Analytics** - Monitor popular questions
3. **Conversation Logging** - Store chats for analysis
4. **Multi-language** - Add Spanish, French support
5. **Voice Input** - Allow users to speak questions
6. **Proactive Help** - Detect user struggles and offer assistance

### Integration Ideas

1. **Email Integration** - Send chat transcripts to support team
2. **CRM Integration** - Log conversations to customer records
3. **Slack Notifications** - Alert team of important questions
4. **Analytics Dashboard** - Visualize chat metrics

## Support

### Need Help?

- **Documentation**: See `AI_ASSISTANT_GUIDE.md` for complete details
- **Email**: info@fedevent.com
- **Phone**: (305) 850-7848

### Report Issues

If you encounter problems:
1. Check this guide first
2. Run test script: `npm run test:assistant`
3. Check server logs: `tail -f server.log`
4. Email detailed error messages to support

---

## Summary

You now have a fully functional AI assistant that:
- ✅ Helps users with registration
- ✅ Answers policy questions
- ✅ Provides technical support
- ✅ Detects form context
- ✅ Remembers conversations
- ✅ Works 24/7

**Cost**: ~$0.0003 per conversation (very affordable!)  
**Quality**: Professional, accurate responses  
**Availability**: 24/7 automatic support  

This will significantly reduce support emails and phone calls while improving user experience!

---

**Version**: 1.0.0  
**Last Updated**: October 9, 2025  
**Powered by**: OpenAI GPT-4o-mini

