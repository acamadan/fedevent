# 📧 GoDaddy Email Setup for FEDEVENT

## Overview

Configure `noreply@fedevent.com` to send confirmation emails to hotels that join your waitlist.

---

## 🚀 Quick Setup (3 Steps)

### **Step 1: Create Email in GoDaddy**

1. Log in to [GoDaddy](https://www.godaddy.com)
2. Go to **Email & Office** dashboard
3. Click **Create Email Address**
4. Create: `noreply@fedevent.com`
5. Set a strong password
6. Save credentials

### **Step 2: Configure Environment Variables**

Copy the example file and add your credentials:

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent

# Copy example to create your .env file
cp .env.example .env

# Edit with your favorite editor
nano .env
# or
code .env
```

Update these values in `.env`:

```bash
# GoDaddy SMTP Settings
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@fedevent.com
SMTP_PASS=YOUR_ACTUAL_PASSWORD_HERE

# Email Addresses
NOTIFY_FROM=noreply@fedevent.com
NOTIFY_TO=your-admin-email@creata.com

# Server Settings
PORT=7777
BASE_URL=http://localhost:7777
```

### **Step 3: Test Email**

Restart your server and test:

```bash
# Restart server
node server.js

# Test email (in another terminal)
curl -X POST http://localhost:7777/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"to":"your-personal-email@gmail.com"}'
```

You should receive a test email!

---

## 📋 GoDaddy SMTP Settings

### **Production Settings (SSL/TLS)**
```
Host:     smtpout.secureserver.net
Port:     465
Secure:   true (SSL/TLS)
Auth:     Required
Username: noreply@fedevent.com
Password: [Your email password]
```

### **Alternative Settings (STARTTLS)**
```
Host:     smtpout.secureserver.net
Port:     587
Secure:   false (uses STARTTLS)
Auth:     Required
Username: noreply@fedevent.com
Password: [Your email password]
```

**Recommended:** Use Port 465 with SSL/TLS (more reliable)

---

## ✉️ What Emails Are Sent?

### **1. Hotel Confirmation Email**

**From:** `noreply@fedevent.com`  
**To:** Hotel contact email  
**Subject:** "✅ Welcome to FEDEVENT - You're on the Waitlist!"

**Contains:**
- Personalized greeting
- Unique user code (FEV-XXXXX)
- Registration details
- What happens next
- Contact information

### **2. Admin Notification Email**

**From:** `noreply@fedevent.com`  
**To:** Your admin email (NOTIFY_TO)  
**Subject:** "🎯 New FEDEVENT Hotel Waitlist Signup"

**Contains:**
- All hotel information
- User code assigned
- Contact details
- Timestamp
- Reply-to set to hotel's email

---

## 🔧 Configuration File Structure

Your `.env` file should look like this:

```bash
# Email Configuration
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@fedevent.com
SMTP_PASS=SecurePassword123!

# Recipients
NOTIFY_FROM=noreply@fedevent.com
NOTIFY_TO=admin@creata.com

# Server
PORT=7777
BASE_URL=http://localhost:7777
NODE_ENV=development
```

---

## 🐛 Troubleshooting

### **Problem: "Authentication failed"**

**Solution:**
1. Verify email exists in GoDaddy
2. Check password is correct
3. Ensure SMTP is enabled (GoDaddy enables by default)
4. Try alternative port 587

### **Problem: "Connection timeout"**

**Solution:**
1. Check firewall isn't blocking port 465
2. Verify SMTP_HOST is correct: `smtpout.secureserver.net`
3. Try port 587 with `SMTP_SECURE=false`

### **Problem: "Email sent but not received"**

**Solution:**
1. Check spam/junk folder
2. Verify recipient email is correct
3. Check GoDaddy email sending limits
4. Review server logs for delivery status

### **Problem: "SMTP not configured"**

**Solution:**
1. Ensure `.env` file exists (not `.env.example`)
2. Restart your Node server after changing `.env`
3. Verify environment variables are loaded:
   ```bash
   node -e "require('dotenv').config(); console.log(process.env.SMTP_HOST)"
   ```

---

## 🧪 Testing Commands

### **Test 1: Basic Email Test**
```bash
curl -X POST http://localhost:7777/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"to":"your-email@example.com"}'
```

### **Test 2: Full Lead Submission**
```bash
curl -X POST http://localhost:7777/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "hotelName": "Test Hotel",
    "city": "Boston",
    "state": "MA",
    "contactName": "Test User",
    "title": "Manager",
    "email": "test@example.com",
    "phone": "555-1234",
    "interests": "lodging, conference"
  }'
```

This will trigger both confirmation and admin emails.

### **Test 3: Check Environment**
```bash
node -e "require('dotenv').config(); console.log({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  from: process.env.NOTIFY_FROM,
  to: process.env.NOTIFY_TO
})"
```

---

## 📧 Email Best Practices

### **DO:**
✅ Use `noreply@fedevent.com` for automated emails
✅ Set Reply-To header to hotel's email in admin notifications
✅ Include unsubscribe option in marketing emails
✅ Monitor bounce rates
✅ Keep email content professional

### **DON'T:**
❌ Use noreply@ email for two-way communication
❌ Send too many emails (spam complaints)
❌ Include sensitive data in emails
❌ Forget to test before production
❌ Hardcode email addresses in code

---

## 🚀 Production Deployment

### **Update .env for Production:**

```bash
# Production Email (same as development)
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@fedevent.com
SMTP_PASS=SecurePassword123!

# Production URLs
BASE_URL=https://fedevent.com
NODE_ENV=production

# Production Recipients
NOTIFY_FROM=noreply@fedevent.com
NOTIFY_TO=admin@creata.com
```

### **Deploy to Hosting Platform:**

**For Render.com:**
1. Add environment variables in Render dashboard
2. Don't commit `.env` file to Git
3. Verify emails work after deployment

**For other platforms:**
- Add environment variables via platform's dashboard
- Test email functionality after deployment
- Monitor email delivery logs

---

## 📊 Monitoring Email Delivery

### **Check GoDaddy Email Logs:**
1. Log in to GoDaddy Email Dashboard
2. Go to Settings → Email Activity
3. View sent/failed emails
4. Check bounce rates

### **Server Logs:**
```bash
# Watch server logs
tail -f server.log

# Search for email-related logs
grep -i "email" server.log

# Check for errors
grep -i "error.*mail" server.log
```

### **Common Email Events in Logs:**
- `Email sent successfully` - Delivery succeeded
- `Failed to send notification email` - Delivery failed
- `SMTP not configured` - Missing configuration
- `Authentication failed` - Wrong credentials

---

## 🔒 Security Considerations

### **Protect Your Credentials:**
```bash
# ✅ GOOD - Use environment variables
SMTP_PASS=SecurePassword123!

# ❌ BAD - Hardcode in code
const pass = "SecurePassword123!";
```

### **Never Commit .env:**
```bash
# Check .gitignore includes:
.env
.env.local
.env.*.local
```

### **Use Strong Passwords:**
- Minimum 12 characters
- Mix of upper/lower case, numbers, symbols
- Don't reuse passwords
- Enable 2FA on GoDaddy account

---

## 📞 GoDaddy Support

If you need help:
- **Support:** 1-480-505-8877
- **Email Setup Help:** https://www.godaddy.com/help/set-up-my-workspace-email-address-22601
- **SMTP Settings:** https://www.godaddy.com/help/server-and-port-settings-for-workspace-email-6949

---

## ✅ Checklist

Before going live:

- [ ] Created `noreply@fedevent.com` in GoDaddy
- [ ] Copied `.env.example` to `.env`
- [ ] Updated SMTP credentials in `.env`
- [ ] Set admin notification email (NOTIFY_TO)
- [ ] Tested email with curl command
- [ ] Verified confirmation email received
- [ ] Checked spam folder if not received
- [ ] Tested full lead submission flow
- [ ] Verified admin notification received
- [ ] Confirmed user code appears in emails
- [ ] Added `.env` to `.gitignore`
- [ ] Documented password securely

---

**Ready to launch!** 🚀

Once emails are configured, every hotel that signs up will receive:
1. Beautiful confirmation email from `noreply@fedevent.com`
2. Their unique user code (FEV-XXXXX)
3. All registration details

And you'll receive:
1. Instant notification of new signups
2. Full hotel contact information
3. User code for tracking

---

*Last Updated: October 10, 2025*  
*CREATA Global Event Agency LLC*

