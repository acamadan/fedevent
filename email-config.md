# Email Configuration for FEDEVENT

## Quick Setup for Email Functionality

To enable email sending (welcome emails, notifications), you need to configure SMTP settings.

### Option 1: GoDaddy Email (if hosting on GoDaddy)

Create a `.env` file in your project root with:

```bash
SMTP_HOST=smtp.godaddy.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-email-password
SMTP_SECURE=false
NOTIFY_FROM=noreply@yourdomain.com
NOTIFY_TO=admin@yourdomain.com
```

### Option 2: Gmail (for testing)

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-app-password
SMTP_SECURE=false
NOTIFY_FROM=your-gmail@gmail.com
NOTIFY_TO=your-gmail@gmail.com
```

### Option 3: SendGrid (Recommended for production)

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_SECURE=false
NOTIFY_FROM=noreply@yourdomain.com
NOTIFY_TO=admin@yourdomain.com
```

## Testing Email Configuration

After setting up the environment variables, restart your server and test:

```bash
# Test endpoint (replace with your domain)
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"to": "your-email@example.com"}'
```

## Current Status

✅ **Fixed**: Signup success messages now stay visible longer (8 seconds instead of 2.6 seconds)
✅ **Fixed**: Improved success message styling and persistence
✅ **Added**: Support email configuration (support@fedevent.com)
❌ **Needs Setup**: SMTP configuration for email delivery

## Support Email Setup

The application references `support@fedevent.com` throughout the codebase. To enable this email:

1. **Create Email Account**: Set up `support@fedevent.com` in your domain hosting provider
2. **DNS Configuration**: Ensure MX records are properly configured
3. **Environment Variable**: Add `SUPPORT_EMAIL=support@fedevent.com` to your `.env` file
4. **Testing**: Verify the email account can send and receive messages

## Next Steps

1. Create `.env` file with SMTP settings
2. Set up support@fedevent.com email account
3. Restart the server
4. Test email functionality
5. Try user signup to verify welcome emails are sent


