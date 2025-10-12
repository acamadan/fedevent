@echo off
REM OpenAI API Key Setup Script for FEDEVENT (Windows)

echo.
echo 🤖 OpenAI API Key Setup for FEDEVENT
echo ====================================
echo.

REM Check if .env file exists
if not exist .env (
    echo 📝 Creating .env file from template...
    copy env-template.txt .env
    echo ✅ .env file created!
) else (
    echo ✅ .env file already exists
)

echo.
echo 📖 Steps to get your OpenAI API Key:
echo.
echo 1. Visit: https://platform.openai.com/api-keys
echo 2. Sign up or log in to your OpenAI account
echo 3. Click 'Create new secret key'
echo 4. Give it a name (e.g., 'FEDEVENT Project')
echo 5. Copy the API key (it starts with 'sk-')
echo.
echo ⚠️  IMPORTANT: You'll only see the key once, so copy it now!
echo.
echo Would you like to enter your OpenAI API key now? (Y/N)
set /p response=

if /i "%response%"=="Y" (
    echo.
    echo Please paste your OpenAI API key:
    set /p api_key=
    
    REM Update the .env file using PowerShell
    powershell -Command "(Get-Content .env) -replace 'OPENAI_API_KEY=.*', 'OPENAI_API_KEY=%api_key%' | Set-Content .env"
    
    echo.
    echo ✅ OpenAI API key added to .env file!
    echo.
    echo 🧪 Testing OpenAI integration...
    call npm run test:openai
) else (
    echo.
    echo 📝 To add your key manually:
    echo 1. Open the .env file in your editor
    echo 2. Find the line: OPENAI_API_KEY=
    echo 3. Add your key after the equals sign: OPENAI_API_KEY=sk-your-key-here
    echo 4. Save the file
    echo 5. Run: npm run test:openai
)

echo.
echo 📚 For more information, see OPENAI_INTEGRATION.md
echo.
pause
