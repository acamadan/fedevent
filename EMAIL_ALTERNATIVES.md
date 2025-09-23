# Email Service Alternatives for FEDEVENT

## Issue with GoDaddy SMTP
GoDaddy often disables SMTP authentication for security reasons, which prevents applications from sending emails.

## Recommended Solutions

### Option 1: SendGrid (Recommended - FREE)
**Free Tier:** 100 emails/day (3,000/month)
**Perfect for:** Getting started and testing

**Setup:**
1. Sign up at https://sendgrid.com
2. Get your API key
3. Update your .env file:

```bash
# Replace SMTP settings with SendGrid
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key-here
SMTP_SECURE=false
```

### Option 2: Mailgun
**Free Tier:** 5,000 emails/month
**Perfect for:** Growing applications

**Setup:**
1. Sign up at https://mailgun.com
2. Get your SMTP credentials
3. Update your .env file:

```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your-mailgun-username
SMTP_PASS=your-mailgun-password
SMTP_SECURE=false
```

### Option 3: Gmail SMTP (For Testing)
**Free but limited:** 500 emails/day
**Perfect for:** Development and testing

**Setup:**
1. Enable 2-factor authentication on Gmail
2. Generate an "App Password"
3. Update your .env file:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-app-password-here
SMTP_SECURE=false
```

### Option 4: Fix GoDaddy SMTP
**If you want to keep using GoDaddy:**

1. **Log into GoDaddy Email Dashboard**
2. **Go to Email Settings**
3. **Enable SMTP/IMAP Access**
4. **Try these alternative settings:**

```bash
# Alternative GoDaddy SMTP settings
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_USER=infol@fedevent.com
SMTP_PASS=Atakanc1$
SMTP_SECURE=true
```

OR

```bash
# Another alternative
SMTP_HOST=smtp.godaddy.com
SMTP_PORT=465
SMTP_USER=infol@fedevent.com
SMTP_PASS=Atakanc1$
SMTP_SECURE=true
```

## Quick Test Commands

After updating your .env file, test with:

```bash
# Test email functionality
curl -X POST http://localhost:3000/api/test-email -H "Content-Type: application/json" -d '{"to": "your-test-email@gmail.com"}'
```

## Recommended Approach

1. **Start with SendGrid** (easiest setup, reliable)
2. **Test your registration process**
3. **Monitor email delivery rates**
4. **Upgrade to paid plan when needed**

## Email Delivery Best Practices

1. **Use a dedicated "from" address:** noreply@fedevent.com
2. **Set up SPF/DKIM records** (ask your domain provider)
3. **Monitor bounce rates**
4. **Include unsubscribe links** in marketing emails

## Cost Comparison

| Service | Free Tier | Paid Plans | Reliability |
|---------|-----------|------------|-------------|
| SendGrid | 100/day | $15/month (40k) | Excellent |
| Mailgun | 5,000/month | $35/month (50k) | Excellent |
| Gmail | 500/day | Not for business | Good |
| GoDaddy SMTP | Unlimited* | Included | Variable |

*If it works properly

## Next Steps

1. **Choose an email service** (I recommend SendGrid)
2. **Update your .env file**
3. **Test the registration process**
4. **Verify welcome emails are being sent**
