# 🤖 OpenAI API Key Setup Guide

This guide will help you set up your OpenAI API key for the FEDEVENT project to enable AI-powered features like meeting space extraction and document processing.

## Quick Start

### Option 1: Automated Setup (Recommended)

Run the setup script:

**On macOS/Linux:**
```bash
./setup-openai.sh
```

**On Windows:**
```bash
setup-openai.bat
```

The script will:
1. Create a `.env` file if it doesn't exist
2. Guide you through getting an API key
3. Add the key to your `.env` file
4. Test the integration

### Option 2: Manual Setup

#### Step 1: Get Your OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in to your OpenAI account
3. Click **"Create new secret key"**
4. Give it a name (e.g., "FEDEVENT Project")
5. **Copy the API key** (starts with `sk-`)
   - ⚠️ **Important:** You'll only see this key once!

#### Step 2: Create .env File

If you don't have a `.env` file, create one:

```bash
cp env-template.txt .env
```

#### Step 3: Add Your API Key

Open the `.env` file and find this line:

```bash
OPENAI_API_KEY=
```

Replace it with your key:

```bash
OPENAI_API_KEY=sk-your-actual-key-here
```

#### Step 4: Test the Integration

Run the test script:

```bash
npm run test:openai
```

You should see output like:
```
✓ OPENAI_API_KEY: Set ✅
✓ OpenAI client created successfully
🤖 Testing OpenAI API Connection...
✅ Response: OpenAI integration working!
```

## Features Enabled by OpenAI

Once configured, you'll have access to:

### 1. 🏢 AI Meeting Space Extraction
- Upload meeting space fact sheets (PDF/images)
- Automatically extract room details, capacities, and dimensions
- Available in the hotel registration form

### 2. 📄 Document Processing
- Process meeting layout documents
- Extract structured data from unstructured documents
- Available at `/api/process-meeting-layout`

### 3. 💬 AI Assistant Features
- Code review assistance
- Document analysis
- Proposal generation
- General federal contracting questions

Access the AI Assistant at: `http://localhost:5050/openai-assistant.html`

## Cost Information

OpenAI API usage is billed per token. The project uses `gpt-4o-mini` by default, which is cost-effective:

- **Input:** ~$0.15 per 1M tokens
- **Output:** ~$0.60 per 1M tokens

### Estimated Costs:
- Meeting space extraction: ~$0.002-0.01 per document
- Document processing: ~$0.01-0.05 per document
- Code review: ~$0.002-0.005 per review

💡 **Tip:** Start with a small credit ($5) to test the features

## Troubleshooting

### "OpenAI API key not configured"
- Check that `OPENAI_API_KEY` is set in your `.env` file
- Verify the key starts with `sk-`
- Restart your server after adding the key

### "Invalid API key"
- Make sure you copied the entire key
- Check for extra spaces or line breaks
- Generate a new key if needed

### Testing Connection
Run the test script to diagnose issues:
```bash
npm run test:openai
```

### Check Environment Variables
Verify the key is loaded:
```bash
node -e "require('dotenv').config(); console.log('Key:', process.env.OPENAI_API_KEY ? 'Set ✅' : 'Not set ❌');"
```

## Security Best Practices

⚠️ **Important Security Notes:**

1. **Never commit `.env` to git**
   - The `.env` file is already in `.gitignore`
   - Double-check before pushing changes

2. **Keep your API key secret**
   - Don't share in screenshots or logs
   - Rotate keys if accidentally exposed

3. **Monitor usage**
   - Check your OpenAI dashboard regularly
   - Set up usage alerts

4. **Production keys**
   - Use separate keys for development and production
   - Set usage limits on production keys

## Advanced Configuration

### Custom Model Selection

You can customize which model to use by adding to your `.env`:

```bash
# Use a specific model for testing
OPENAI_TEST_MODEL=gpt-4o-mini

# Use a specific model for code reviews
OPENAI_REVIEW_MODEL=gpt-4o
```

### Custom Base URL

For using Azure OpenAI or custom endpoints:

```bash
OPENAI_BASE_URL=https://your-custom-endpoint.com/v1
```

## Need Help?

- 📖 See [OPENAI_INTEGRATION.md](./OPENAI_INTEGRATION.md) for detailed API documentation
- 🧪 Run `npm run test:openai` to test your setup
- 📧 Contact support if you encounter issues

## Quick Reference

| Task | Command |
|------|---------|
| Setup wizard | `./setup-openai.sh` (Mac/Linux) or `setup-openai.bat` (Windows) |
| Test integration | `npm run test:openai` |
| View documentation | Open `OPENAI_INTEGRATION.md` |
| Access AI Assistant | `http://localhost:5050/openai-assistant.html` |

---

✅ Once your API key is configured, restart your server and you're ready to use AI features!
