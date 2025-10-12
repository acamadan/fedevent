#!/bin/bash
# OpenAI API Key Setup Script for FEDEVENT

echo "🤖 OpenAI API Key Setup for FEDEVENT"
echo "===================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env-template.txt .env
    echo "✅ .env file created!"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "📖 Steps to get your OpenAI API Key:"
echo ""
echo "1. Visit: https://platform.openai.com/api-keys"
echo "2. Sign up or log in to your OpenAI account"
echo "3. Click 'Create new secret key'"
echo "4. Give it a name (e.g., 'FEDEVENT Project')"
echo "5. Copy the API key (it starts with 'sk-')"
echo ""
echo "⚠️  IMPORTANT: You'll only see the key once, so copy it now!"
echo ""
echo "Would you like to enter your OpenAI API key now? (y/n)"
read -r response

if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo ""
    echo "Please paste your OpenAI API key:"
    read -r api_key
    
    # Validate the key format (basic check)
    if [[ $api_key == sk-* ]]; then
        # Update the .env file
        if grep -q "OPENAI_API_KEY=" .env; then
            # Replace existing key
            sed -i.bak "s|OPENAI_API_KEY=.*|OPENAI_API_KEY=$api_key|g" .env
            rm .env.bak 2>/dev/null
            echo ""
            echo "✅ OpenAI API key added to .env file!"
        else
            # Add new key
            echo "OPENAI_API_KEY=$api_key" >> .env
            echo ""
            echo "✅ OpenAI API key added to .env file!"
        fi
        
        echo ""
        echo "🧪 Testing OpenAI integration..."
        npm run test:openai
        
    else
        echo ""
        echo "⚠️  Warning: The key doesn't start with 'sk-'. Please verify it's correct."
        echo "You can manually edit the .env file to add/update your key."
    fi
else
    echo ""
    echo "📝 To add your key manually:"
    echo "1. Open the .env file in your editor"
    echo "2. Find the line: OPENAI_API_KEY="
    echo "3. Add your key after the equals sign: OPENAI_API_KEY=sk-your-key-here"
    echo "4. Save the file"
    echo "5. Run: npm run test:openai"
fi

echo ""
echo "📚 For more information, see OPENAI_INTEGRATION.md"
echo ""
