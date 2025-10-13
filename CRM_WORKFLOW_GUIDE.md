# 🎯 FEDEVENT CRM & Registrant Management System

## Overview

Your FEDEVENT system now has a **powerful CRM workflow** that automates Gemini's suggested Excel workflow and adds advanced tracking features. This guide shows you how to manage your hotel registrants from waitlist to active customers.

---

## 🚀 Quick Start Workflow

### **Option 1: Fully Automated (Recommended)**
1. Log into Admin Dashboard → Waitlist Tab
2. Click **"🔄 Sync Registered"** - Automatically matches registered hotels with waitlist
3. Click **"📊 Export to Excel"** - Get your master list with all statuses
4. Done! Your statuses are automatically updated

### **Option 2: Semi-Automated (Gemini's Workflow)**
1. Click **"📥 Export Registered List"** - Downloads emails of all registered hotels
2. Click **"📊 Export to Excel"** - Downloads your full waitlist
3. Use XLOOKUP in Excel to match and update statuses
4. System automatically tracks changes when hotels complete registration

---

## 📊 New CRM Fields

Your `hotel_leads` table now tracks:

| Field | Values | Description |
|-------|---------|-------------|
| `invitation_status` | `not_invited`, `invited` | Whether you've sent invitation email |
| `invited_at` | Timestamp | When invitation was sent |
| `invited_by` | Admin User ID | Who sent the invitation |
| `registration_status` | `waitlist`, `invited`, `registered`, `active` | Current stage in funnel |
| `registered_hotel_id` | Hotel ID | Links to completed registration |
| `last_contacted_at` | Timestamp | Last time you contacted this lead |
| `notes` | Text | Private notes about this lead |
| `priority_level` | `normal`, `high`, `urgent` | Priority flag |

---

## 🎨 Admin Dashboard Features

### **Waitlist Tab - New Features**

#### **Filters:**
- **All Statuses** → Filter by `Not Invited` or `Invited`
- **All Registration** → Filter by `Waitlist`, `Invited`, `Registered`, `Active`
- **Country Filter** → Filter by country
- **30% Discount Filter** → Find hotels that accepted discount

#### **Bulk Actions:**
- ☑️ **Select Multiple Leads** - Click checkboxes to select leads
- **📧 Send Invitations** - Bulk send invitation emails with registration codes
- **🔄 Sync Registered** - Auto-match registered hotels with leads
- **📊 Export to Excel** - Download full CRM data with all tracking fields
- **📥 Export Registered List** - Download list of registered emails for XLOOKUP

#### **Visual Status Badges:**
- 🟡 **INVITED** - Yellow badge for invited leads
- 🟢 **REGISTERED** - Green badge for completed registrations
- 🔵 **Waitlist** - Blue badge for new signups
- ⚪ **Not Invited** - Gray badge for pending leads

---

## 📋 API Endpoints

### **Waitlist Management**

#### Get All Leads
```http
GET /api/admin/waitlist
Authorization: Bearer {sessionId}
```

#### Bulk Send Invitations
```http
POST /api/admin/waitlist/bulk-invite
Authorization: Bearer {sessionId}
Content-Type: application/json

{
  "leadIds": [1, 2, 3],
  "emailSubject": "Welcome to FEDEVENT",
  "emailBody": "<html>...",
  "sendEmail": true
}
```

#### Update Single Lead
```http
PUT /api/admin/waitlist/:id
Authorization: Bearer {sessionId}
Content-Type: application/json

{
  "invitation_status": "invited",
  "registration_status": "registered",
  "priority_level": "high",
  "notes": "VIP customer"
}
```

#### Bulk Update Leads
```http
PUT /api/admin/waitlist/bulk-update
Authorization: Bearer {sessionId}
Content-Type: application/json

{
  "leadIds": [1, 2, 3],
  "updates": {
    "registration_status": "invited"
  }
}
```

#### Sync Registered Hotels
```http
POST /api/admin/waitlist/sync-registered
Authorization: Bearer {sessionId}
```
Automatically matches registered hotel accounts with waitlist leads by email and updates their status to "registered".

#### Export to Excel
```http
GET /api/admin/waitlist/export
Authorization: Bearer {sessionId}
```
Downloads Excel file with all CRM fields, color-coded by status.

#### Export Registered Hotels List
```http
GET /api/admin/hotels/export-emails
Authorization: Bearer {sessionId}
```
Downloads simple list of registered hotel emails for XLOOKUP matching.

---

## 🔄 The XLOOKUP Workflow (Gemini's Method)

### **Step 1: Export Your Data**
1. Go to Admin Dashboard → Waitlist Tab
2. Click **"📊 Export to Excel"** → This is your MASTER LIST
3. Click **"📥 Export Registered List"** → This is your LOOKUP LIST

### **Step 2: Setup Your Excel Workbook**
1. Open your master list (hotel-waitlist-YYYY-MM-DD.xlsx)
2. Create a new tab and paste the registered hotels list
3. Name the new tab `Registrations`

### **Step 3: Add XLOOKUP Formula**
In your master list, add a new column "Registration Check" with this formula:

```excel
=XLOOKUP(J2, Registrations!A:A, Registrations!A:A, "Not Found")
```

Where `J2` is the email column in your master list.

### **Step 4: Filter and Update**
1. Filter the "Registration Check" column to show only matched emails
2. Those are the hotels that have registered
3. Update their "Registration Status" column to "Registered"

### **Step 5: Automated Sync (Even Easier!)**
Instead of manual XLOOKUP, just click **"🔄 Sync Registered"** in the admin dashboard and it does this automatically!

---

## 📧 Invitation Email System

### **How It Works:**
1. Select leads from the waitlist
2. Click **"📧 Send Invitations"**
3. System automatically:
   - Marks them as "Invited"
   - Records who sent it and when
   - Sends email with their registration code
   - Updates last contacted date

### **Email Template:**
```html
Subject: Welcome to FEDEVENT - Your Registration Code: FEV-12345

Dear [Contact Name],

Thank you for your interest in FEDEVENT. We're excited to invite you to complete your hotel registration.

Your unique registration code: FEV-12345

Use this code to complete your registration at:
https://fedevent.com/hotel-registration.html

If you have any questions, please don't hesitate to reach out.

Best regards,
FEDEVENT Team
```

You can customize the email template when sending invitations.

---

## 📊 Excel Export Features

### **What's Included:**
- All contact information
- Hotel details and location
- User codes for registration
- **NEW:** Invitation status & date
- **NEW:** Registration status
- **NEW:** Priority level
- **NEW:** Last contacted date
- **NEW:** Notes
- Accepts NET30, Direct Bill, Discount flags

### **Color Coding:**
- 🟢 **Green** - Registered or Active
- 🟡 **Yellow** - Invited but not registered yet
- ⚪ **White** - Not invited yet

---

## 🎯 Recommended Workflow

### **Weekly Routine:**
1. **Monday Morning:**
   - Click **"🔄 Sync Registered"** to update statuses
   - Review new signups from last week
   - Filter by "Not Invited" and send invitations to qualified leads

2. **Wednesday:**
   - Filter by "Invited" status
   - Review who hasn't completed registration
   - Send follow-up emails to invited leads

3. **Friday:**
   - Click **"📊 Export to Excel"**
   - Review your conversion metrics
   - Identify high-priority leads for next week

### **Monthly Routine:**
1. Export full waitlist to Excel
2. Analyze conversion rates:
   - Waitlist → Invited
   - Invited → Registered
   - Registered → Active
3. Update priority levels based on engagement
4. Add notes for VIP leads

---

## 💡 Pro Tips

1. **Use Filters Aggressively** - Find exactly who you need to contact
2. **Bulk Actions Save Time** - Select 50 leads and invite them all at once
3. **Auto-Sync is Magic** - Let the system match registered hotels automatically
4. **Export Often** - Keep your Excel master list updated weekly
5. **Add Notes** - Track important conversations and promises
6. **Priority Flags** - Mark VIP hotels that accepted 30% discount

---

## 🔧 Database Changes

All new fields are automatically added via migrations. No manual SQL needed!

### **Migration Details:**
```sql
ALTER TABLE hotel_leads ADD COLUMN invitation_status TEXT DEFAULT 'not_invited';
ALTER TABLE hotel_leads ADD COLUMN invited_at TEXT;
ALTER TABLE hotel_leads ADD COLUMN invited_by INTEGER;
ALTER TABLE hotel_leads ADD COLUMN registration_status TEXT DEFAULT 'waitlist';
ALTER TABLE hotel_leads ADD COLUMN registered_hotel_id INTEGER;
ALTER TABLE hotel_leads ADD COLUMN last_contacted_at TEXT;
ALTER TABLE hotel_leads ADD COLUMN notes TEXT;
ALTER TABLE hotel_leads ADD COLUMN priority_level TEXT DEFAULT 'normal';
```

---

## 🎬 Next Steps

1. **Restart your server** to apply database migrations
2. **Login to Admin Dashboard**
3. **Go to Waitlist Tab**
4. **Click "🔄 Sync Registered"** to populate existing data
5. **Click "📊 Export to Excel"** to see your enhanced CRM data
6. **Start sending invitations!**

---

## 📞 Support

If you have questions or need help:
- Check the API endpoints section for integration
- Review the workflow examples above
- All changes are backwards-compatible with existing data

---

**Enjoy your new CRM system! 🎉**

