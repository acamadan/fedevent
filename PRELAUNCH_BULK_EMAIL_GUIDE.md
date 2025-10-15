# 📧 FEDEVENT Prelaunch Bulk Email System

## Overview

This system allows you to send professional invitation emails to your 13,140 hotel contacts from past proposals, inviting them to join FEDEVENT's prelaunch waitlist. The system includes unsubscribe tracking, email templates, and bulk sending capabilities.

---

## 🎯 Key Features

- **Professional Email Template** - Beautiful, conversion-optimized HTML email
- **Unsubscribe Tracking** - Full GDPR/CAN-SPAM compliance with tracking
- **Bulk Sending** - Send to thousands of contacts efficiently
- **Test Mode** - Preview before sending to all contacts
- **Rate Limiting** - Built-in delays to avoid spam filters
- **Status Tracking** - Track who received emails, who unsubscribed
- **No Cvent Mention** - Template focuses only on FEDEVENT benefits

---

## 📋 Email Template Features

The template includes:

✅ **Professional Design** - Modern, mobile-responsive HTML email  
✅ **Clear Value Proposition** - Highlights benefits without mentioning Cvent  
✅ **Strong CTA Button** - Prominent "Join Early Access" button  
✅ **Benefit Highlights**:
  - Direct access to federal government contracts
  - Competitive bidding with real-time notifications
  - Streamlined process
  - Guaranteed payments
  - Exclusive opportunities

✅ **Unsubscribe Link** - CAN-SPAM compliant with warning about missing opportunities  
✅ **Professional Footer** - Links to website, help center, and sign up

---

## 🗄️ Database Schema

### New Columns Added

**`email_contacts` table:**
- `unsubscribed` (INTEGER) - 0 or 1
- `unsubscribed_at` (TEXT) - Timestamp of unsubscribe
- `unsubscribe_token` (TEXT) - Unique token for unsubscribe link

**`hotel_leads` table:**
- `unsubscribed` (INTEGER) - 0 or 1
- `unsubscribed_at` (TEXT) - Timestamp of unsubscribe
- `unsubscribe_token` (TEXT) - Unique token for unsubscribe link

---

## 🚀 How to Use

### Step 1: Import Your Contact List

First, import your 13,140 contacts into the `email_contacts` table. You can do this via:

1. **CSV Import** (if available in admin dashboard)
2. **Direct Database Import**
3. **API Import**

Example SQL for bulk import:
```sql
INSERT INTO email_contacts (email, hotel_name, contact_name, source)
VALUES ('hotel@example.com', 'Example Hotel', 'John Smith', 'cvent_proposals');
```

### Step 2: Access Admin Dashboard

Log into the admin dashboard at `/admin-dashboard.html`

### Step 3: Navigate to Email Contacts Section

In the admin dashboard, go to the "Prelaunch Contacts" or "Email Contacts" tab.

### Step 4: Select Contacts

- You can select individual contacts
- Or use "Select All" to choose all non-unsubscribed contacts
- Filter by criteria if needed

### Step 5: Send Bulk Emails

**Option A: Test Mode First (Recommended)**

```javascript
POST /api/admin/prelaunch/bulk-send

{
  "contactIds": [1, 2, 3, ...],
  "testMode": true,
  "customSubject": "🏨 Exclusive Invitation: Join FEDEVENT Early Access"
}
```

This will show you what would be sent without actually sending emails.

**Option B: Send for Real**

```javascript
POST /api/admin/prelaunch/bulk-send

{
  "contactIds": [1, 2, 3, ...],
  "testMode": false,
  "customSubject": "🏨 Exclusive Invitation: Join FEDEVENT Early Access"
}
```

---

## 📊 API Endpoints

### 1. Send Bulk Prelaunch Emails

**Endpoint:** `POST /api/admin/prelaunch/bulk-send`  
**Auth:** Admin only  
**Body:**
```json
{
  "contactIds": [1, 2, 3, 4, 5],
  "customSubject": "🏨 Join FEDEVENT Early Access",
  "testMode": false
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "message": "Emails sent to 5 contacts",
    "successCount": 5,
    "skippedCount": 0,
    "failedCount": 0,
    "totalProcessed": 5,
    "testMode": false
  }
}
```

**Features:**
- Automatically generates unsubscribe tokens
- Skips already unsubscribed contacts
- Adds 100ms delay between emails to avoid rate limiting
- Updates `invitation_status`, `invited_at`, and `last_contacted_at`

---

### 2. Unsubscribe (Public Endpoint)

**Endpoint:** `GET /api/unsubscribe?token={token}`  
**Auth:** None (public)  

**Response:**
```json
{
  "ok": true,
  "data": {
    "message": "Successfully unsubscribed",
    "email": "hotel@example.com",
    "success": true
  }
}
```

---

### 3. Get Unsubscribed List

**Endpoint:** `GET /api/admin/unsubscribed`  
**Auth:** Admin only  

**Response:**
```json
{
  "ok": true,
  "data": {
    "unsubscribed": [
      {
        "email": "hotel@example.com",
        "hotel_name": "Example Hotel",
        "unsubscribed_at": "2025-10-14 12:30:00",
        "source": "email_contacts"
      }
    ],
    "total": 1
  }
}
```

---

## 🎨 Email Template Preview

**Subject Line:**
```
🏨 Exclusive Invitation: Join FEDEVENT Early Access
```

**Key Sections:**
1. **Header** - FEDEVENT branding with gradient
2. **Greeting** - Personalized with contact name
3. **Introduction** - References their previous interest (without mentioning Cvent)
4. **Benefits Box** - Highlighted list of key features
5. **Early Access Pitch** - Hotel-specific value proposition
6. **CTA Button** - Large, prominent "Join Early Access Now"
7. **Limited Time Notice** - Creates urgency
8. **Next Steps** - Clear 4-step process
9. **Support Offer** - Invitation to ask questions
10. **Footer** - Links and unsubscribe with warning

---

## ⚠️ Important Notes

### Unsubscribe Warning

The email includes a strong warning about unsubscribing:

> "If you no longer wish to receive emails about government contract opportunities from FEDEVENT, you can unsubscribe below. Please note that unsubscribing means you will NOT receive notifications about upcoming government contracts that could benefit your property."

This helps reduce unnecessary unsubscribes while remaining compliant.

### Rate Limiting

The system includes a 100ms delay between emails. For 13,140 contacts:
- Estimated time: ~22 minutes
- This prevents hitting SMTP rate limits
- Reduces risk of being flagged as spam

### SMTP Configuration

Make sure these environment variables are set:
```bash
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-password
SMTP_FROM=noreply@fedevent.com
BASE_URL=https://fedevent.com
```

---

## 📈 Tracking & Analytics

### What's Tracked

1. **Email Sends**
   - `invited_at` - When email was sent
   - `invited_by` - Which admin sent it
   - `last_contacted_at` - Last contact timestamp
   - `invitation_status` - Set to 'invited'

2. **Unsubscribes**
   - `unsubscribed` - Flag (0 or 1)
   - `unsubscribed_at` - Timestamp
   - `unsubscribe_token` - Unique token

### How to Monitor

**View Stats in Admin Dashboard:**
- Total emails sent
- Total unsubscribed
- Conversion rate (invited → registered)

**Database Queries:**

```sql
-- Total invited
SELECT COUNT(*) FROM email_contacts WHERE invitation_status = 'invited';

-- Total unsubscribed
SELECT COUNT(*) FROM email_contacts WHERE unsubscribed = 1;

-- Unsubscribe rate
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN unsubscribed = 1 THEN 1 ELSE 0 END) as unsubscribed,
  ROUND(SUM(CASE WHEN unsubscribed = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as unsubscribe_rate
FROM email_contacts
WHERE invitation_status = 'invited';
```

---

## 🔧 Batch Processing Strategy

### Recommended Approach for 13,140 Contacts

**Phase 1: Test Batch (Day 1)**
- Send to 100 contacts in test mode
- Review email appearance
- Send to 100 contacts for real
- Monitor deliverability and responses

**Phase 2: Small Batch (Day 2)**
- Send to 1,000 contacts
- Monitor unsubscribe rate
- Check spam complaints
- Verify delivery rates

**Phase 3: Medium Batch (Day 3-4)**
- Send to 5,000 contacts
- Continue monitoring metrics
- Adjust subject line if needed

**Phase 4: Full Send (Day 5-7)**
- Send to remaining ~7,000 contacts
- Stagger over 2-3 days if preferred

### Why Stagger?

1. **Monitor Deliverability** - Catch issues early
2. **Avoid Spam Filters** - Sudden large volumes trigger filters
3. **Test Subject Lines** - A/B test different approaches
4. **Manage Responses** - Don't overwhelm support
5. **Track Conversion** - See what works best

---

## 📝 Compliance

### CAN-SPAM Act Compliance

✅ **Accurate From/Reply-To** - Uses legitimate FEDEVENT email  
✅ **Clear Subject Line** - No deceptive subject lines  
✅ **Identify as Ad** - Email clearly presents as invitation/opportunity  
✅ **Physical Address** - Can add to footer if required  
✅ **Clear Unsubscribe** - Prominent unsubscribe link  
✅ **Honor Unsubscribe** - System immediately flags and skips  
✅ **Monitor** - Track and honor unsubscribes within 10 days

### GDPR Compliance (if applicable)

✅ **Legitimate Interest** - Previous proposal submissions show interest  
✅ **Right to Object** - Unsubscribe link provided  
✅ **Data Minimization** - Only necessary data collected  
✅ **Transparency** - Clear about who you are and what you offer

---

## 🎯 Success Metrics

Track these KPIs:

1. **Delivery Rate** - % of emails successfully delivered
   - Target: >95%

2. **Open Rate** - % of delivered emails opened
   - Target: 15-25%

3. **Click Rate** - % who clicked "Join Early Access"
   - Target: 2-5%

4. **Unsubscribe Rate** - % who unsubscribed
   - Target: <2%

5. **Conversion Rate** - % who completed prelaunch registration
   - Target: 1-3%

---

## 🐛 Troubleshooting

### Emails Not Sending

**Check SMTP Configuration:**
```bash
curl -X POST https://your-domain.com/api/email-test \
  -H "Content-Type: application/json" \
  -d '{"to":"your-email@domain.com"}'
```

**Check Logs:**
```bash
tail -f logs/server.log | grep "Email"
```

### High Unsubscribe Rate

- Review email content
- Check if emails are going to spam
- Verify you're targeting the right audience
- Test different subject lines

### Emails Going to Spam

- Verify SPF, DKIM, DMARC records
- Use a reputable SMTP provider
- Don't send too many too fast
- Avoid spam trigger words

---

## 📞 Support

If you encounter issues:

1. Check server logs: `logs/server.log`
2. Verify database migrations ran successfully
3. Test with a small batch first
4. Contact system administrator

---

## 🎉 Best Practices

1. **Always Test First** - Use `testMode: true` before real sends
2. **Start Small** - Begin with 100-1000 contacts
3. **Monitor Metrics** - Track opens, clicks, unsubscribes
4. **Respect Unsubscribes** - System auto-skips them
5. **Time Your Sends** - Tuesday-Thursday, 10am-2pm typically best
6. **Personalize** - Template uses contact name when available
7. **Follow Up** - Consider follow-up sequence for non-responders
8. **A/B Test** - Try different subject lines with different batches

---

## 🔄 Follow-Up Sequences

After initial send, consider:

**Day 7: Reminder Email** (to non-openers)
**Day 14: Last Chance Email** (to non-clickers)
**Day 30: Re-engagement Campaign** (to inactive contacts)

---

**Ready to launch your prelaunch campaign!** 🚀

Good luck reaching all 13,140 hotels!

