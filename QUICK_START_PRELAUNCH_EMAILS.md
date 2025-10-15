# 🚀 Quick Start: Prelaunch Bulk Emails

## ⚡ TL;DR

Send professional invitation emails to your 13,140 hotel contacts from past Cvent proposals (without mentioning Cvent).

---

## ✅ What's Ready

- ✅ Professional HTML email template
- ✅ Unsubscribe tracking system
- ✅ Bulk send API with rate limiting
- ✅ Test mode for safe preview
- ✅ Public unsubscribe page
- ✅ CAN-SPAM & GDPR compliant

---

## 🎯 5-Minute Setup

### 1. Set Environment Variables

Add to your `.env` file:

```bash
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-password
SMTP_FROM=noreply@fedevent.com
BASE_URL=https://fedevent.com
```

### 2. Restart Server

```bash
npm start
```

The database migrations will run automatically and add unsubscribe tracking columns.

### 3. Import Your 13,140 Contacts

**Option A: CSV Import** (if you have admin dashboard CSV import)

**Option B: SQL Import**

```sql
INSERT INTO email_contacts (email, hotel_name, contact_name, source)
VALUES 
  ('hotel1@example.com', 'Grand Plaza Hotel', 'John Smith', 'cvent_proposals'),
  ('hotel2@example.com', 'Riverside Inn', 'Jane Doe', 'cvent_proposals'),
  ...
```

**Option C: Bulk Import Script**

Create `import-contacts.js`:
```javascript
const Database = require('better-sqlite3');
const db = new Database('./data/creata.db');

const contacts = [
  { email: 'hotel1@example.com', hotel_name: 'Grand Plaza', contact_name: 'John Smith' },
  // ... your 13,140 contacts
];

const insert = db.prepare(`
  INSERT INTO email_contacts (email, hotel_name, contact_name, source)
  VALUES (?, ?, ?, 'cvent_proposals')
`);

for (const contact of contacts) {
  insert.run(contact.email, contact.hotel_name, contact.contact_name);
}

console.log(`Imported ${contacts.length} contacts`);
```

Run: `node import-contacts.js`

---

## 🧪 Test Before Sending

### Step 1: Test Mode (Doesn't Actually Send)

```bash
curl -X POST https://your-domain.com/api/admin/prelaunch/bulk-send \
  -H "Authorization: Bearer YOUR_ADMIN_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "contactIds": [1, 2, 3, 4, 5],
    "testMode": true,
    "customSubject": "🏨 Exclusive Invitation: Join FEDEVENT Early Access"
  }'
```

### Step 2: Send to Yourself First

Add your email to the database, then send:

```bash
curl -X POST https://your-domain.com/api/admin/prelaunch/bulk-send \
  -H "Authorization: Bearer YOUR_ADMIN_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "contactIds": [YOUR_TEST_CONTACT_ID],
    "testMode": false
  }'
```

Check your inbox and test:
- ✅ Email looks good on desktop
- ✅ Email looks good on mobile
- ✅ Unsubscribe link works
- ✅ Not in spam folder

---

## 📧 Send to All Contacts

### Get All Contact IDs

```sql
SELECT id FROM email_contacts WHERE unsubscribed = 0;
```

Or via API (if available in admin dashboard):

```bash
curl https://your-domain.com/api/admin/email-contacts \
  -H "Authorization: Bearer YOUR_ADMIN_SESSION_ID"
```

### Send Bulk Email

```bash
curl -X POST https://your-domain.com/api/admin/prelaunch/bulk-send \
  -H "Authorization: Bearer YOUR_ADMIN_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "contactIds": [1,2,3,4,5,...,13140],
    "testMode": false,
    "customSubject": "🏨 Exclusive Invitation: Join FEDEVENT Early Access"
  }'
```

**Expected Time:** ~22 minutes for 13,140 emails (100ms delay between sends)

---

## 📊 Monitor Results

### Check Send Status

The API response will show:
```json
{
  "ok": true,
  "data": {
    "message": "Emails sent to 13014 contacts",
    "successCount": 13014,
    "skippedCount": 0,
    "failedCount": 126,
    "totalProcessed": 13140,
    "failedEmails": [...]
  }
}
```

### Check Unsubscribes

```bash
curl https://your-domain.com/api/admin/unsubscribed \
  -H "Authorization: Bearer YOUR_ADMIN_SESSION_ID"
```

Or query database:

```sql
SELECT COUNT(*) as unsubscribed 
FROM email_contacts 
WHERE unsubscribed = 1;
```

---

## 🎨 Email Preview

**Subject:**
```
🏨 Exclusive Invitation: Join FEDEVENT Early Access
```

**Key Points in Email:**
- ✅ Thanks them for previous interest (no Cvent mention)
- ✅ Introduces FEDEVENT platform
- ✅ Lists 5 key benefits
- ✅ Emphasizes "early access" privilege
- ✅ Large "Join Early Access Now" button
- ✅ Simple 4-step process
- ✅ Professional footer with links
- ✅ Unsubscribe link with warning

---

## 🔥 Recommended Strategy

### Staggered Approach (Safest)

**Day 1:** Send to 100 contacts
- Monitor deliverability
- Check spam complaints
- Test unsubscribe process

**Day 2:** Send to 1,000 contacts
- Review open rates
- Check click rates
- Monitor unsubscribe rate

**Day 3-4:** Send to 5,000 contacts
- Confirm good metrics
- Adjust if needed

**Day 5-7:** Send to remaining ~7,000 contacts
- Complete the campaign

### All-at-Once Approach (Faster)

Send to all 13,140 contacts immediately. Best if:
- You trust your contact list
- SMTP provider allows bulk sends
- You've tested with small batch first

---

## ⚠️ Important Notes

1. **Automatically Skips Unsubscribed** - System won't send to anyone who opts out
2. **Rate Limited** - 100ms delay between emails prevents spam filters
3. **Token Generated** - Each email gets unique unsubscribe token
4. **Database Updated** - Tracks who was invited and when
5. **No Cvent Mention** - Template focuses only on FEDEVENT

---

## 🐛 Common Issues

### "SMTP not configured"
**Fix:** Check environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS)

### "Contact IDs array is required"
**Fix:** Pass array of numbers: `"contactIds": [1,2,3]`

### Emails going to spam
**Fix:** 
- Configure SPF/DKIM/DMARC
- Start with small batch
- Use reputable SMTP provider

### High unsubscribe rate (>5%)
**Fix:**
- Review targeting (are these the right contacts?)
- Test different subject lines
- Send at better times (Tue-Thu, 10am-2pm)

---

## 📈 Success Metrics

Track these:

| Metric | Target | How to Calculate |
|--------|--------|------------------|
| Delivery Rate | >95% | (Delivered / Sent) × 100 |
| Open Rate | 18-25% | (Opens / Delivered) × 100 |
| Click Rate | 3-6% | (Clicks / Delivered) × 100 |
| Unsubscribe Rate | <2% | (Unsubs / Delivered) × 100 |
| Conversion Rate | 1-3% | (Signups / Delivered) × 100 |

---

## 📁 Key Files

- **Email Template:** In `server.js` - `generatePrelaunchInvitationEmail()`
- **Bulk Send API:** `POST /api/admin/prelaunch/bulk-send`
- **Unsubscribe Page:** `/public/unsubscribe.html`
- **Full Guide:** `PRELAUNCH_BULK_EMAIL_GUIDE.md`
- **Implementation Summary:** `PRELAUNCH_EMAIL_IMPLEMENTATION_SUMMARY.md`

---

## ✅ Pre-Flight Checklist

Before sending to all 13,140:

- [ ] SMTP configured and tested
- [ ] Contacts imported into `email_contacts` table
- [ ] Sent test email to yourself
- [ ] Checked email on desktop
- [ ] Checked email on mobile
- [ ] Tested unsubscribe link
- [ ] Email not in spam
- [ ] Test batch sent (100 contacts)
- [ ] Metrics look good
- [ ] Ready for full send! 🚀

---

## 🎉 You're Ready!

Everything is set up. When you're ready to launch:

1. Import your 13,140 contacts
2. Test with small batch (recommended)
3. Send to all via API
4. Monitor results
5. Watch the signups roll in! 📈

**Questions?** See `PRELAUNCH_BULK_EMAIL_GUIDE.md` for detailed documentation.

---

**Good luck with your campaign!** 🎊

