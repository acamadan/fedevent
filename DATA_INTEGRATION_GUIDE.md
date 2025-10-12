# 🔗 FEDEVENT Data Integration Guide

## Overview

This guide explains how prelaunch waitlist data integrates with the main FEDEVENT platform.

---

## 🗄️ Database Structure

### **Single Shared Database:** `data/creata.db`

All data is stored in one SQLite database with three key tables:

```
┌─────────────────────────────────────────────────────────┐
│                    data/creata.db                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────┐             │
│  │     hotel_leads (Prelaunch)           │             │
│  ├───────────────────────────────────────┤             │
│  │ • user_code (FEV-XXXXX)              │             │
│  │ • hotel_name                          │             │
│  │ • email                               │             │
│  │ • city, state                         │             │
│  │ • contact_name, title                 │             │
│  │ • phone, interests                    │             │
│  │ • created_at                          │             │
│  └───────────────────────────────────────┘             │
│                      ↓                                  │
│                   LINKS TO                              │
│                      ↓                                  │
│  ┌───────────────────────────────────────┐             │
│  │     hotels (Main Platform)            │             │
│  ├───────────────────────────────────────┤             │
│  │ • id                                  │             │
│  │ • prelaunch_code (FEV-XXXXX) ← LINK  │             │
│  │ • is_early_adopter (boolean)         │             │
│  │ • name, email, city, state           │             │
│  │ • Full hotel profile...               │             │
│  └───────────────────────────────────────┘             │
│                      ↓                                  │
│                   HAS MANY                              │
│                      ↓                                  │
│  ┌───────────────────────────────────────┐             │
│  │     users (Login Accounts)            │             │
│  ├───────────────────────────────────────┤             │
│  │ • id                                  │             │
│  │ • hotel_id (Foreign Key)             │             │
│  │ • email, password_hash                │             │
│  │ • first_name, last_name               │             │
│  │ • fedevent_account_number             │             │
│  │ • role (hotel, admin, vendor)         │             │
│  └───────────────────────────────────────┘             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow

### **Phase 1: Prelaunch (October - November 2025)**

```
Hotel visits prelaunch page
        ↓
Submits contact info
        ↓
Gets user code: FEV-12345
        ↓
Stored in: hotel_leads table
        ↓
Status: Waitlist only (no login)
```

**Database Entry:**
```sql
INSERT INTO hotel_leads (
  user_code, hotel_name, email, city, state, contact_name
) VALUES (
  'FEV-12345', 'Grand Plaza Hotel', 'info@grandplaza.com', 
  'Washington', 'DC', 'John Smith'
);
```

---

### **Phase 2: Platform Launch (December 2025)**

```
Hotel returns with FEV-12345
        ↓
Creates full account
        ↓
System checks: Does FEV-12345 exist in hotel_leads?
        ↓
YES → Link code + Grant early adopter benefits
        ↓
NO → Regular signup (not an early supporter)
        ↓
Full access to platform
```

**Database Operations:**

1. **Check for prelaunch code:**
```sql
SELECT * FROM hotel_leads 
WHERE user_code = 'FEV-12345' 
AND email = 'info@grandplaza.com';
```

2. **Create hotel account:**
```sql
INSERT INTO hotels (
  name, email, city, state, 
  prelaunch_code, is_early_adopter
) VALUES (
  'Grand Plaza Hotel', 'info@grandplaza.com', 
  'Washington', 'DC', 
  'FEV-12345', 1
);
```

3. **Create user login:**
```sql
INSERT INTO users (
  hotel_id, email, password_hash, first_name, last_name
) VALUES (
  [hotel_id], 'john@grandplaza.com', '[hash]', 
  'John', 'Smith'
);
```

---

## 🎯 User Code vs Username

### **They Serve Different Purposes:**

| Feature | User Code (FEV-12345) | Username (email or custom) |
|---------|----------------------|----------------------------|
| **Created** | Prelaunch signup | Full account registration |
| **Purpose** | Tracking & reference | Login authentication |
| **Visibility** | Support, emails, CRM | Login screen only |
| **Changes** | Never | Can be updated |
| **Example Use** | "Re: FEV-12345..." | "Log in with john@hotel.com" |
| **Database** | `hotel_leads.user_code` + `hotels.prelaunch_code` | `users.email` |

### **Real-World Example:**

**During Prelaunch:**
```
John Smith submits form
  → Gets code: FEV-12345
  → Can't log in yet (no password)
  → Just on waitlist
```

**After Launch:**
```
John returns to sign up
  → Provides email: john@grandplaza.com
  → Creates password: ********
  → System asks: "Do you have a prelaunch code?"
  → John enters: FEV-12345
  → System links code to account
  → John logs in with: john@grandplaza.com
  → Dashboard shows: "Early Adopter (FEV-12345)"
```

---

## 🔧 Implementation

### **Registration Flow with Prelaunch Code**

When a hotel registers on the main site, add this logic:

```javascript
// In your registration endpoint (server.js)
app.post('/api/auth/register', async (req, res) => {
  const { hotelName, email, password, prelaunchCode } = req.body;
  
  let isEarlyAdopter = false;
  
  // Check if they have a prelaunch code
  if (prelaunchCode) {
    const prelaunch = db.prepare(`
      SELECT * FROM hotel_leads 
      WHERE user_code = ? 
      AND email = ?
    `).get(prelaunchCode, email);
    
    if (prelaunch) {
      isEarlyAdopter = true;
      console.log(`✅ Early adopter verified: ${prelaunchCode}`);
    }
  }
  
  // Create hotel account
  const hotelResult = db.prepare(`
    INSERT INTO hotels (
      name, email, city, state, 
      prelaunch_code, is_early_adopter
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    hotelName, email, city, state,
    prelaunchCode || null,
    isEarlyAdopter ? 1 : 0
  );
  
  const hotelId = hotelResult.lastInsertRowid;
  
  // Create user login
  const passwordHash = await bcrypt.hash(password, 10);
  db.prepare(`
    INSERT INTO users (
      hotel_id, email, password_hash
    ) VALUES (?, ?, ?)
  `).run(hotelId, email, passwordHash);
  
  // Grant early adopter benefits
  if (isEarlyAdopter) {
    // Featured placement
    // Priority RFP access
    // Special badge
  }
  
  return ok(res, { 
    success: true,
    isEarlyAdopter,
    prelaunchCode 
  });
});
```

---

## 🎁 Early Adopter Benefits

Hotels with prelaunch codes get special perks:

### **Automatic Benefits:**

1. **✅ Featured Placement**
   - Top of search results
   - "Early Supporter" badge
   - Free featured listing (normally $X/month)

2. **✅ Priority Access**
   - See RFPs 24 hours before others
   - First notification of new contracts
   - Priority customer support

3. **✅ Recognition**
   - "Founding Partner" status
   - Listed on "Early Supporters" page
   - Special dashboard theme

4. **✅ Analytics**
   - Track early adopters in reports:
   ```sql
   SELECT COUNT(*) FROM hotels WHERE is_early_adopter = 1;
   ```

### **Implementation:**

```javascript
// Check early adopter status
function isEarlyAdopter(hotelId) {
  const hotel = db.prepare(`
    SELECT is_early_adopter, prelaunch_code 
    FROM hotels 
    WHERE id = ?
  `).get(hotelId);
  
  return hotel?.is_early_adopter === 1;
}

// Grant benefits
if (isEarlyAdopter(hotelId)) {
  // Show badge
  badges.push({
    icon: '⭐',
    label: 'Early Supporter',
    code: hotel.prelaunch_code
  });
  
  // Featured placement
  listings.featured = true;
  listings.sort_priority = 1;
  
  // Priority RFPs
  notifications.priority_hours = 24;
}
```

---

## 📊 Queries & Reports

### **View All Early Adopters:**
```sql
SELECT 
  h.prelaunch_code,
  h.name,
  h.email,
  h.city,
  h.state,
  hl.created_at as waitlist_date,
  h.created_at as signup_date
FROM hotels h
LEFT JOIN hotel_leads hl ON h.prelaunch_code = hl.user_code
WHERE h.is_early_adopter = 1
ORDER BY hl.created_at;
```

### **Match Prelaunch to Full Accounts:**
```sql
-- Hotels that signed up for waitlist AND created accounts
SELECT 
  hl.user_code,
  hl.hotel_name as waitlist_name,
  h.name as account_name,
  hl.email as waitlist_email,
  h.email as account_email,
  hl.created_at as waitlist_date,
  h.created_at as signup_date,
  CAST(julianday(h.created_at) - julianday(hl.created_at) AS INTEGER) as days_between
FROM hotel_leads hl
INNER JOIN hotels h ON h.prelaunch_code = hl.user_code
ORDER BY hl.created_at;
```

### **Waitlist Conversion Rate:**
```sql
-- How many prelaunch signups converted to full accounts?
SELECT 
  COUNT(DISTINCT hl.user_code) as total_waitlist,
  COUNT(DISTINCT h.id) as converted_accounts,
  ROUND(
    (COUNT(DISTINCT h.id) * 100.0) / COUNT(DISTINCT hl.user_code), 
    2
  ) as conversion_rate
FROM hotel_leads hl
LEFT JOIN hotels h ON h.prelaunch_code = hl.user_code;
```

### **Unclaimed Codes:**
```sql
-- Hotels on waitlist who haven't signed up yet
SELECT 
  user_code,
  hotel_name,
  email,
  contact_name,
  created_at as waitlist_date,
  CAST(julianday('now') - julianday(created_at) AS INTEGER) as days_waiting
FROM hotel_leads
WHERE user_code NOT IN (
  SELECT prelaunch_code FROM hotels WHERE prelaunch_code IS NOT NULL
)
ORDER BY created_at;
```

---

## 🚀 Migration Strategy

### **When You Launch (December 2025):**

1. **Export Waitlist:**
```bash
node export-leads.js
# Creates: hotel-leads-2025-12-01.csv
```

2. **Email All Leads:**
```
Subject: FEV-12345 - FEDEVENT is LIVE! Create Your Account

Dear John,

Your prelaunch code: FEV-12345

We're excited to announce FEDEVENT is now live!

Create your account and use code FEV-12345 to unlock:
✅ Featured placement
✅ Priority RFP access
✅ Founding Partner badge

Sign up now: https://fedevent.com/register?code=FEV-12345
```

3. **Monitor Conversions:**
```bash
# Create monitoring script
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/creata.db');

setInterval(() => {
  const stats = db.prepare(\`
    SELECT 
      COUNT(DISTINCT hl.user_code) as waitlist,
      COUNT(DISTINCT h.id) as converted
    FROM hotel_leads hl
    LEFT JOIN hotels h ON h.prelaunch_code = hl.user_code
  \`).get();
  
  console.log(\`Conversion: \${stats.converted}/\${stats.waitlist} 
    (\${((stats.converted/stats.waitlist)*100).toFixed(1)}%)\`);
}, 60000); // Check every minute
" &
```

---

## 🔒 Security Considerations

### **Verify Code Ownership:**

Always verify the email matches:

```javascript
// ✅ GOOD - Verify email matches
const prelaunch = db.prepare(`
  SELECT * FROM hotel_leads 
  WHERE user_code = ? AND email = ?
`).get(code, email);

// ❌ BAD - Anyone could claim any code
const prelaunch = db.prepare(`
  SELECT * FROM hotel_leads 
  WHERE user_code = ?
`).get(code);
```

### **Prevent Code Reuse:**

```javascript
// Check if code already claimed
const existing = db.prepare(`
  SELECT id FROM hotels 
  WHERE prelaunch_code = ?
`).get(prelaunchCode);

if (existing) {
  return fail(res, 400, 'This code has already been used');
}
```

---

## 📞 Support Scenarios

### **Scenario 1: Hotel Lost Their Code**

```
Hotel: "I signed up for the waitlist but lost my code."
You: "No problem! What email did you use?"
      [Look up in hotel_leads by email]
You: "Found it! Your code is FEV-12345."
```

**Query:**
```sql
SELECT user_code FROM hotel_leads WHERE email = 'john@hotel.com';
```

### **Scenario 2: Hotel Can't Register**

```
Hotel: "I'm trying to use code FEV-12345 but it says invalid."
You: "Let me check... What email are you using?"
Hotel: "john@hotel.com"
You: [Check if email matches]
```

**Query:**
```sql
SELECT * FROM hotel_leads 
WHERE user_code = 'FEV-12345' AND email = 'john@hotel.com';
```

### **Scenario 3: Code Already Used**

```
Hotel: "It says my code was already used!"
You: "Let me check your account..."
     [See if they already registered]
```

**Query:**
```sql
SELECT * FROM hotels 
WHERE prelaunch_code = 'FEV-12345';
```

---

## ✅ Summary

### **Key Points:**

1. ✅ **One Database** - Everything in `data/creata.db`
2. ✅ **User Code ≠ Username** - Different purposes
3. ✅ **Codes Link Tables** - `hotel_leads` → `hotels`
4. ✅ **Early Adopter Benefits** - Automatic perks
5. ✅ **Conversion Tracking** - Monitor waitlist → accounts

### **Data Remains Separate Until:**
- Hotel creates full account on main site
- Provides their prelaunch code during registration
- System verifies and links the records

### **All Information Preserved:**
- Waitlist data stays in `hotel_leads`
- Full account in `hotels` + `users`
- Link maintained via `prelaunch_code`
- Historical tracking of all conversions

---

**Your prelaunch and main site share ONE database with smart linking!** 🎉

---

*Last Updated: October 10, 2025*  
*CREATA Global Event Agency LLC*

