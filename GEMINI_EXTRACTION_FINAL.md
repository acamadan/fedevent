# 📧 Gemini: Prelaunch Contact Extraction - Final Guide

## 🎯 Your Mission

Extract **basic contact information** from `info@creataglobal.com` emails to build a prelaunch invitation list.

**What You're Building:** A list of hotel contacts for the user to REVIEW and APPROVE before sending invitations.

---

## 📋 What to Extract

### **✅ REQUIRED (Must Have):**

1. **Email** - Contact email address
2. **Hotel Name** - Property name
3. **Contact Name** - Person's full name

### **✅ OPTIONAL (Nice to Have):**

4. **Address** - Street address (if in email signature)
5. **City** - City name
6. **State** - State/Province (2-letter code: DC, VA, MD)
7. **Zip Code** - Postal code
8. **Country** - Country name (default: USA if not specified)
9. **Phone** - Contact phone number
10. **Priority Level** - `high` or `normal`
11. **Notes** - Brief communication summary (1-2 sentences)

---

## ❌ DO NOT Extract

These fields are collected LATER when hotels fill out the registration form:

- ❌ Indoor Property (Yes/No)
- ❌ Accepts NET30 (Yes/No)
- ❌ Accepts Direct Bill (Yes/No)
- ❌ 30% Discount (Yes/No)
- ❌ Interests
- ❌ Meeting space details
- ❌ Room counts
- ❌ Property amenities

**Hotels provide these when they complete the registration form!**

---

## 📊 Output Format

### **File Type:** 
Excel (.xlsx) - RECOMMENDED

### **Column Headers (Exact Names):**
```
Email | Hotel Name | Contact Name | Address | City | State | Zip Code | Country | Phone | Priority Level | Notes
```

### **Example Data:**

```csv
Email,Hotel Name,Contact Name,Address,City,State,Zip Code,Country,Phone,Priority Level,Notes
john.smith@grandhotel.com,Grand Hotel Washington,John Smith,123 Main Street,Washington,DC,20001,USA,555-123-4567,high,Inquired about government lodging - March 2024
sarah.j@marriott.com,Marriott Pentagon City,Sarah Johnson,100 Pentagon Plaza,Arlington,VA,22202,USA,555-234-5678,high,Responded to initial outreach - very interested
mchen@embassysuites.com,Embassy Suites Bethesda,Michael Chen,4300 Military Road,Bethesda,MD,20814,USA,555-345-6789,normal,Past email exchange about federal contracts
l.martinez@hilton.com,Hilton Crystal City,Lisa Martinez,2399 Jefferson Davis Hwy,Arlington,VA,22202,USA,555-456-7890,high,Warm lead - wants info when launched
dthompson@marriott.com,Courtyard Arlington,David Thompson,1533 Clarendon Blvd,Arlington,VA,22209,USA,555-567-8901,normal,Initial inquiry in 2024
```

---

## 🎯 Extraction Strategy

### **From Email Signature:**

```
John Smith
General Manager
Grand Hotel Washington
123 Main Street
Washington, DC 20001
Direct: (555) 123-4567
john.smith@grandhotel.com
```

**Extract:**
- Email: `john.smith@grandhotel.com`
- Hotel Name: `Grand Hotel Washington`
- Contact Name: `John Smith`
- Address: `123 Main Street`
- City: `Washington`
- State: `DC`
- Zip Code: `20001`
- Country: `USA` (default if not mentioned)
- Phone: `555-123-4567`
- Priority Level: (see below)
- Notes: (see below)

---

## 🎯 Priority Level Guidelines

### **High Priority** (`high`):
- Multiple email exchanges
- Expressed strong interest
- Warm lead
- Responded quickly
- Asked follow-up questions
- Requested to be notified at launch
- Past business relationship

### **Normal Priority** (`normal`):
- Single email exchange
- General inquiry
- Cold lead
- No follow-up
- First contact

**Distribution:** 
- High: 20-30% of total
- Normal: 70-80% of total

---

## 📝 Notes Field Guidelines

**Keep brief (1-2 sentences max):**

✅ **Good Examples:**
- "Inquired about government contracts - March 2024"
- "Responded to initial outreach - very interested"
- "Past email exchange about federal lodging"
- "Asked to be notified at launch"
- "Multiple exchanges - warm lead"
- "Expressed interest in NET30 terms"
- "Hot lead - requested immediate follow-up"

❌ **Bad Examples:**
- (Empty - no notes)
- (Full conversation transcript)
- (Long paragraphs)
- (Detailed requirements list)

---

## 🔄 What Happens After You Deliver

### **Step 1: User Imports Your File**
```
User uploads your Excel file to FEDEVENT
System creates database records
Status set to: "not_invited"
Unique codes generated: FEV-12345
```

### **Step 2: User Reviews & Approves** ⭐
```
User reviews all contacts in dashboard
- Filters, searches, verifies data
- Removes any unwanted contacts
- Fixes any errors
- Decides who to invite
```

### **Step 3: User Selects & Approves Sending** ⭐
```
User selects specific contacts OR selects all
Clicks "Send Invitations" button
System shows confirmation: "Send to 2,000 hotels?"
User approves: Yes or Cancel
```

### **Step 4: System Sends (After Approval)**
```
Emails sent with registration codes
Status updates to: "invited"
Invitation date recorded
```

### **Step 5: Hotels Register (Automatic)**
```
Hotels click link and fill registration form
System auto-matches by email
Status updates to: "registered"
Business terms collected from form
All automatic - no manual work!
```

**Your job ends at Step 1!** ✅

---

## ✅ Quality Checklist

Before delivering file to user:

### **Data Quality:**
- [ ] All rows have Email, Hotel Name, Contact Name
- [ ] All email addresses are valid format (has @ and domain)
- [ ] No duplicate emails (or kept most recent only)
- [ ] Phone numbers formatted consistently: XXX-XXX-XXXX
- [ ] Priority level is "high" or "normal" (lowercase)
- [ ] Notes are brief (1-2 sentences max)
- [ ] State codes are 2 letters (DC, VA, MD not District of Columbia)
- [ ] No empty rows between data
- [ ] First row contains column headers

### **File Quality:**
- [ ] Saved as Excel (.xlsx) format
- [ ] File size under 25 MB
- [ ] No formulas (values only)
- [ ] No merged cells
- [ ] UTF-8 encoding (handles special characters)

### **Validation (REQUIRED!):**
- [ ] **Run validator:** `node test-csv-import.js your-file.xlsx`
- [ ] **Result shows:** 🎉 SUCCESS! File is ready to import!
- [ ] **Fix any errors** shown by validator
- [ ] **Re-validate** until clean

---

## 🧪 Validation (CRITICAL STEP!)

Before delivering to user, you MUST run the validator:

```bash
node test-csv-import.js hotel-contacts-prelaunch.xlsx
```

### **Expected Success Output:**
```
=== CSV Import Validator ===

📄 File: hotel-contacts-prelaunch.xlsx

✅ File parsed successfully
📊 Total rows: 2,347

🔍 Validating Required Fields:
✅ email: "Email"
✅ hotelName: "Hotel Name"
✅ contactName: "Contact Name"

📝 Optional Fields Found:
✅ city: "City"
✅ state: "State"
✅ phone: "Phone"
✅ notes: "Notes"
✅ priorityLevel: "Priority Level"
Found 7 optional fields

🔬 Data Quality Check:
✅ Valid rows: 2,347
⚠️  Warnings: 15

📊 Summary:
   Total rows: 2,347
   Valid rows: 2,347 (100.0%)
   Invalid rows: 0
   Errors: 0
   Warnings: 15

🎉 SUCCESS! File is ready to import!

Next steps:
   1. Login to FEDEVENT admin dashboard
   2. Go to Waitlist tab
   3. Click "📤 Import from CSV"
   4. Select this file
   5. Click "Import Data"

Expected result: 2,347 contacts will be imported!
```

### **If Validator Shows Errors:**

```
❌ Errors (showing first 10):
   Row 5: Missing email
   Row 23: Invalid email format: john@@hotel.com
   Row 98: Missing hotel name
```

**Action Required:**
1. Fix the errors in your Excel file
2. Run validator again
3. Repeat until you get green ✅ success message
4. Only then deliver to user

---

## 📊 Extraction Guidelines

### **Include These Emails:**
✅ Direct hotel contacts  
✅ Property managers  
✅ Sales directors  
✅ General managers  
✅ Revenue managers  
✅ Owners  
✅ Any hotel decision makers  

### **Exclude These Emails:**
❌ Marketing blasts from chains  
❌ Automated booking confirmations  
❌ Newsletter subscriptions  
❌ Out of office replies  
❌ Spam/promotional content  
❌ Unrelated business inquiries  
❌ Generic addresses (info@, reservations@)

### **Duplicate Handling:**
If same email appears multiple times:
- Keep the MOST RECENT contact
- Merge notes from all occurrences
- Use latest contact information
- Only one row per unique email

---

## 📋 Phone Number Formatting

**Preferred Format:** XXX-XXX-XXXX

**Examples:**
- ✅ `555-123-4567`
- ✅ `(555) 123-4567`
- ✅ `5551234567`
- ⚠️ `555.123.4567` (works but inconsistent)
- ❌ `555-123-456` (too short)

**Choose one format and use consistently throughout the file!**

---

## 🎯 Expected Output Statistics

**Total Contacts:** 2,000 - 5,000  
**High Priority:** 500 - 1,000 (20-30%)  
**Normal Priority:** 1,500 - 4,000 (70-80%)  
**File Size:** 2-5 MB  
**Format:** Excel (.xlsx)  
**Validation:** Must pass (green ✅)

---

## 💡 Pro Tips

### **Tip 1: Start Small, Test, Then Scale**
1. Extract first 20 emails
2. Create test file
3. Validate with script
4. Ensure format is perfect
5. Then proceed with full extraction

### **Tip 2: Use Consistent Formatting**
- Phone: XXX-XXX-XXXX (all the same)
- State: 2-letter codes (DC, VA, MD)
- Country: Full name (USA, Canada)
- Priority: lowercase (high, normal)

### **Tip 3: Quality Over Quantity**
Better to have 2,000 perfect contacts than 3,000 with errors.
User can always import more later.

### **Tip 4: Document Your Process**
Include a brief summary with delivery:
```
Extracted from: info@creataglobal.com
Date range: Jan 2020 - Oct 2025
Total contacts: 2,347
High priority: 487 (21%)
Normal priority: 1,860 (79%)
Validation: Passed ✅
```

---

## 📦 Delivery Format

### **File Name:**
`hotel-contacts-prelaunch-YYYY-MM-DD.xlsx`

Example: `hotel-contacts-prelaunch-2025-10-12.xlsx`

### **Include:**
1. Main Excel file (validated ✅)
2. Brief summary text (optional but helpful)

### **Summary Text Example:**
```
FEDEVENT Prelaunch Contact Extraction
Date: October 12, 2025
Source: info@creataglobal.com emails

STATISTICS:
- Total Contacts: 2,347
- High Priority: 487 (21%)
- Normal Priority: 1,860 (79%)
- With Phone: 1,823 (78%)
- With Address: 1,654 (70%)

TOP LOCATIONS:
- Virginia: 847
- Maryland: 623
- DC: 512
- California: 213
- Texas: 152

DATA QUALITY:
- Valid emails: 100%
- Validation: Passed ✅
- No duplicates
- Ready to import

NEXT STEPS:
1. User imports to FEDEVENT
2. User reviews contacts
3. User selects & approves who to invite
4. User sends invitations (bulk)
5. System tracks everything automatically
```

---

## ✅ Pre-Delivery Checklist

Before sending file to user:

### **Extraction Complete:**
- [ ] Processed all relevant emails
- [ ] Extracted required fields (email, hotel, contact)
- [ ] Added optional fields where available
- [ ] Assigned priority levels appropriately
- [ ] Added brief notes for each contact

### **Data Clean:**
- [ ] No duplicate emails
- [ ] Valid email formats (all have @ and domain)
- [ ] Consistent phone formatting
- [ ] Brief notes (1-2 sentences)
- [ ] No empty rows
- [ ] Headers in first row

### **File Ready:**
- [ ] Saved as Excel (.xlsx)
- [ ] File size under 25MB
- [ ] No formulas (values only)
- [ ] No merged cells
- [ ] Column headers match exactly

### **Validation Passed:**
- [ ] Ran `node test-csv-import.js file.xlsx`
- [ ] Got green ✅ success message
- [ ] Zero errors shown
- [ ] Fixed all warnings (if any)
- [ ] File is validated and approved

### **Ready to Deliver:**
- [ ] File named: hotel-contacts-prelaunch-YYYY-MM-DD.xlsx
- [ ] Optional summary prepared
- [ ] Quality confirmed
- [ ] Ready for user import!

---

## 🎉 Done!

Once file passes validation:

1. ✅ Save as: `hotel-contacts-prelaunch-YYYY-MM-DD.xlsx`
2. ✅ Deliver to user
3. ✅ User imports (< 1 minute)
4. ✅ User reviews & approves
5. ✅ User sends invitations
6. ✅ System tracks everything automatically!

**Your mission: Deliver clean, validated contact data!** ✅

**User's job: Review, approve, and send invitations!** ⭐

**System's job: Track everything automatically!** 🚀

---

## 📞 Questions?

If unclear about any field or format:
1. Check the sample file: `sample-prelaunch-extract.csv`
2. Run the validator to test format
3. Start with 10-20 test contacts
4. Validate before full extraction

**When in doubt, simpler is better!**
**Email, Hotel Name, Contact Name = Minimum required**
**Everything else is optional bonus!**

---

**🎯 Ready to extract! Deliver validated, clean data!** ✅

