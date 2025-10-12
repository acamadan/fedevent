# 🔢 FEDEVENT User Code System

## Overview

Every hotel that signs up for the FEDEVENT prelaunch waitlist receives a unique user code in the format **`FEV-XXXXX`** (e.g., `FEV-12345`).

---

## 📋 User Code Details

### **Format**
- **Prefix:** `FEV-` (FEDEVENT abbreviated)
- **Number:** 5 random digits (10000-99999)
- **Example:** `FEV-47821`

### **Characteristics**
- ✅ **Unique** - No two hotels get the same code
- ✅ **Permanent** - Never changes for that hotel
- ✅ **Memorable** - Short and easy to reference
- ✅ **Professional** - Clean, business-appropriate format

---

## 🎯 Where Hotels See Their Code

### **1. Success Message (Website)**
After submitting the form, hotels see their code displayed in a prominent gradient box:
```
┌──────────────────────────────┐
│  Your Unique User Code       │
│      FEV-47821              │
│  Save this code for reference│
└──────────────────────────────┘
```

### **2. Confirmation Email**
The hotel receives an email with their code highlighted:
- Big, bold display at the top
- Repeated in the registration details section
- Encouragement to save it

### **3. All Future Communications**
Reference the code in:
- Follow-up emails
- Phone calls
- Support tickets
- Platform invitations

---

## 💼 How to Use User Codes

### **Customer Support**
```
Hotel: "Hi, I signed up for the waitlist last week."
You: "Great! Do you have your user code handy?"
Hotel: "Yes, it's FEV-47821."
You: *looks up immediately* "Perfect! I see Grand Plaza Hotel in Washington, DC..."
```

### **Follow-Up Emails**
```
Subject: FEV-47821 - Your FEDEVENT Early Access is Ready!

Dear John,

Your user code: FEV-47821
```

### **Database Queries**
```bash
# Find a specific hotel by code
sqlite3 data/creata.db "SELECT * FROM hotel_leads WHERE user_code = 'FEV-47821';"

# View all codes
node view-leads.js
```

### **Phone Support**
```
"For reference, your user code is FEV-47821. 
Please save this for future communications."
```

---

## 📊 Viewing User Codes

### **Option 1: View Script**
```bash
node view-leads.js
```

Output:
```
🎯 FEDEVENT PRELAUNCH LEADS

┌─────┬────────────┬──────────────────┬────────────┬───────┐
│ ... │ user_code  │ hotel_name       │ city       │ state │
├─────┼────────────┼──────────────────┼────────────┼───────┤
│ ... │ FEV-47821  │ Grand Plaza      │ Washington │ DC    │
│ ... │ FEV-23456  │ Harbor Hotel     │ Boston     │ MA    │
└─────┴────────────┴──────────────────┴────────────┴───────┘

Total Leads: 2
```

### **Option 2: Export to CSV**
```bash
node export-leads.js
```

Creates: `hotel-leads-2025-10-10.csv` with user_code as the first column

### **Option 3: Direct SQL Query**
```bash
sqlite3 data/creata.db "SELECT user_code, hotel_name, email FROM hotel_leads;"
```

---

## 🔍 Search by User Code

### **Quick Lookup Script**

Create `lookup-user.js`:
```javascript
#!/usr/bin/env node
import Database from 'better-sqlite3';

const code = process.argv[2];
if (!code) {
  console.log('Usage: node lookup-user.js FEV-12345');
  process.exit(1);
}

const db = new Database('./data/creata.db');
const lead = db.prepare('SELECT * FROM hotel_leads WHERE user_code = ?').get(code);

if (lead) {
  console.log('\n✅ Hotel Found:\n');
  console.log(`User Code:    ${lead.user_code}`);
  console.log(`Hotel:        ${lead.hotel_name}`);
  console.log(`Location:     ${lead.city}, ${lead.state}`);
  console.log(`Contact:      ${lead.contact_name} (${lead.title})`);
  console.log(`Email:        ${lead.email}`);
  console.log(`Phone:        ${lead.phone || 'N/A'}`);
  console.log(`Interests:    ${lead.interests}`);
  console.log(`Submitted:    ${lead.created_at}`);
} else {
  console.log(`\n❌ No hotel found with code: ${code}`);
}

db.close();
```

**Usage:**
```bash
node lookup-user.js FEV-47821
```

---

## 📧 Email Templates with User Code

### **Follow-Up Email Template**
```html
Subject: [FEV-47821] FEDEVENT Platform Update

Dear John,

Reference: FEV-47821
Hotel: Grand Plaza Hotel

We're excited to share an update about FEDEVENT...
```

### **Early Access Invitation**
```html
Subject: FEV-47821 - You're Invited! Early Access to FEDEVENT

Your User Code: FEV-47821

Dear John,

As one of our first 1,000 hotels (FEV-47821), you now have 
early access to the FEDEVENT platform...
```

---

## 🛡️ Security Benefits

### **Why User Codes Improve Security**

1. **No PII Needed**
   - Hotels can identify themselves without sharing sensitive info
   - Safe to use in subject lines, tickets, etc.

2. **Quick Verification**
   - "Can you confirm your user code?" vs asking for full details
   - Fast identity confirmation

3. **Audit Trail**
   - Easy to track all interactions with a specific code
   - Clear reference in all communications

4. **Data Privacy**
   - Code doesn't reveal hotel name, location, or contact info
   - GDPR/privacy-friendly

---

## 📈 Analytics with User Codes

### **Track Engagement**
```sql
-- Hotels that opened confirmation email
SELECT user_code, hotel_name 
FROM hotel_leads 
WHERE notified = 1;

-- Hotels by signup date
SELECT 
  DATE(created_at) as signup_date,
  COUNT(*) as hotels,
  GROUP_CONCAT(user_code) as codes
FROM hotel_leads 
GROUP BY DATE(created_at);
```

### **Segment by State**
```sql
-- Generate state-specific marketing lists
SELECT state, user_code, hotel_name, email
FROM hotel_leads
WHERE state = 'CA'
ORDER BY created_at;
```

---

## 🚀 When Platform Launches

### **Convert Codes to Account Numbers**

When hotels register for full access, you can:

1. **Link user code to account**
   ```sql
   UPDATE hotels 
   SET prelaunch_code = 'FEV-47821' 
   WHERE email = 'contact@hotel.com';
   ```

2. **Grant Priority Features**
   - Early sign-ups (by user code) get featured placement
   - "Verified FEV-47821 member since October 2025"

3. **Loyalty Recognition**
   ```
   "Welcome back, FEV-47821! 
   Thanks for being an early supporter."
   ```

---

## 📞 Customer Service Scripts

### **Inbound Call**
```
"Thank you for calling FEDEVENT. Do you have your 
user code? It starts with FEV."

[Hotel provides code]

"Perfect! I have your information pulled up..."
```

### **Outbound Call**
```
"Hi, I'm calling from FEDEVENT regarding your 
waitlist registration, user code FEV-47821."
```

### **Email Support**
```
"Hi [Name],

I've located your registration under user code 
FEV-47821. Let me help you with..."
```

---

## 🎁 Special Perks Based on Code

### **Early Adopter Benefits**

Grant special privileges to early codes:

```javascript
// Example: First 100 codes
const earlyAdopters = leads
  .filter(l => parseInt(l.user_code.split('-')[1]) < 10100)
  .map(l => l.user_code);

// First 100 get:
// - Lifetime featured placement
// - Exclusive "Founding Partner" badge
// - Priority RFP notifications
```

### **Referral Tracking**

Add referral feature:
```
"Share your code FEV-47821 with other hotels.
For every 3 referrals, unlock premium features!"
```

---

## 📋 Best Practices

### **DO:**
✅ Include code in all communications
✅ Make it easy to find in emails (header/footer)
✅ Train staff to ask for codes
✅ Use as primary identifier
✅ Display prominently in user dashboards

### **DON'T:**
❌ Change codes after assignment
❌ Reuse codes for different hotels
❌ Use codes as passwords
❌ Share codes between hotels
❌ Delete codes from database

---

## 🔧 Technical Implementation

### **Code Generation Algorithm**
```javascript
// Generate unique 5-digit code
const randomNum = Math.floor(10000 + Math.random() * 90000);
const userCode = `FEV-${randomNum}`;

// Check uniqueness
const existing = db.prepare(
  'SELECT id FROM hotel_leads WHERE user_code = ?'
).get(userCode);

// Retry if duplicate (rare)
```

### **Database Schema**
```sql
CREATE TABLE hotel_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_code TEXT UNIQUE NOT NULL,  -- FEV-XXXXX
  hotel_name TEXT NOT NULL,
  email TEXT NOT NULL,
  -- ... other fields
);

-- Index for fast lookups
CREATE INDEX idx_user_code ON hotel_leads(user_code);
```

---

## 📞 Support

For questions about the user code system:
- **Email:** info@Fedevent.com
- **Reference:** Your code in subject line

---

**Last Updated:** October 10, 2025  
**Version:** 1.0  
**System:** FEDEVENT Prelaunch User Codes

