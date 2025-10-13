# 📧 Guide for Gemini: Email Data Extraction for FEDEVENT Import

## 🎯 Mission Overview

Extract hotel contact information from `info@creataglobal.com` emails and format it for bulk import into the FEDEVENT CRM system.

---

## 📋 Required Output Format

### **File Type Options:**
1. **Excel (.xlsx)** - RECOMMENDED
2. **CSV (.csv)** - Also supported

### **Column Headers (Exact Names):**

| Column Name | Required? | Description | Example |
|-------------|-----------|-------------|---------|
| **Hotel Name** | ✅ YES | Property name | Grand Hotel Washington |
| **Contact Name** | ✅ YES | Person's full name | John Smith |
| **Email** | ✅ YES | Contact email address | john.smith@grandhotel.com |
| Title | No | Job title | General Manager |
| Phone | No | Contact phone | 555-123-4567 |
| Hotel Phone | No | Property main line | 555-123-4500 |
| Address | No | Full street address | 123 Main Street |
| City | No | City name | Washington |
| State | No | State/Province | DC |
| Zip Code | No | Postal code | 20001 |
| Country | No | Country name | USA |
| Indoor Property | No | Yes/No | Yes |
| Accepts NET30 | No | Yes/No | Yes |
| Accepts Direct Bill | No | Yes/No | Yes |
| 30% Discount | No | Yes/No | Yes |
| Interests | No | Text field | Government contracts, conferences |
| Priority Level | No | normal/high/urgent | high |
| Notes | No | Any relevant info | VIP contact, met at conference 2024 |

---

## 🎨 Example Excel Output

```
| Hotel Name          | Contact Name | Email                        | Title            | Phone        | City       | State | Country | Notes                          |
|---------------------|--------------|------------------------------|------------------|--------------|------------|-------|---------|--------------------------------|
| Grand Hotel DC      | John Smith   | john.smith@grandhotel.com    | General Manager  | 555-123-4567 | Washington | DC    | USA     | Responded to 5 RFPs in 2024   |
| Marriott Pentagon   | Sarah Jones  | sarah.j@marriott.com         | Sales Director   | 555-234-5678 | Arlington  | VA    | USA     | Prefers direct bill, NET30 OK |
| Embassy Suites      | Mike Chen    | mchen@embassysuites.com      | Revenue Manager  | 555-345-6789 | Bethesda   | MD    | USA     | High priority, quick responses|
```

---

## 🔍 Data Extraction Guidelines

### **What to Extract:**

1. **Hotel Name**
   - Look for property names in email signatures
   - Extract from "From:" field if domain matches hotel
   - Check email body for mentions like "at [Hotel Name]"
   - Clean up formatting (remove LLC, Inc., etc. unless part of brand)

2. **Contact Name**
   - Extract from email signature
   - Use "From:" name if available
   - Format: First Name Last Name
   - No titles (Dr., Mr., Ms.) in this field

3. **Email Address**
   - Primary contact email
   - Use "From:" address if it's personal
   - Skip generic addresses like info@, reservations@
   - Validate format (must have @ and domain)

4. **Title/Position**
   - Look in signature for role
   - Common titles: General Manager, Sales Director, Revenue Manager, Owner
   - Use exact title from signature

5. **Phone Numbers**
   - Extract personal cell from signature (Contact Phone)
   - Extract property main line (Hotel Phone)
   - Format: XXX-XXX-XXXX or (XXX) XXX-XXXX
   - Remove extensions if present

6. **Location**
   - Extract from signature or email body
   - City and State are most important
   - Country defaults to USA if not specified

7. **Communication Notes**
   - Summarize relationship/history
   - Note response quality: "Quick responder", "Detailed quotes", etc.
   - Flag any special terms: "Requires NET30", "30% discount accepted"
   - Include relevant dates: "Last quoted March 2024"
   - VIP status: "Platinum partner", "Referred by X", etc.

8. **Priority Level**
   - **high** = Frequent responder, large property, government contracts
   - **normal** = Standard contact
   - **urgent** = Hot lead, pending proposal, time-sensitive

---

## 🎯 Email Processing Rules

### **Include These Emails:**
✅ Direct responses to RFPs/quotes  
✅ Property information requests  
✅ Contract negotiations  
✅ Hotel introduction emails  
✅ Follow-up correspondence  
✅ Rate confirmations  

### **Exclude These Emails:**
❌ Marketing blasts from chains  
❌ Automated booking confirmations  
❌ Newsletter subscriptions  
❌ Out of office replies  
❌ Spam/promotional content  
❌ Unrelated business inquiries  

### **Duplicate Handling:**
- If same email appears multiple times, keep the MOST RECENT
- Merge notes from all occurrences
- Update contact info if it changed
- Priority: Latest information wins

---

## 💡 Smart Extraction Tips

### **From Email Signatures:**
```
John Smith
General Manager
Grand Hotel Washington
123 Main Street, Washington, DC 20001
Direct: (555) 123-4567 | Hotel: (555) 123-4500
john.smith@grandhotel.com
```

**Extract:**
- Hotel Name: Grand Hotel Washington
- Contact Name: John Smith
- Email: john.smith@grandhotel.com
- Title: General Manager
- Phone: (555) 123-4567
- Hotel Phone: (555) 123-4500
- Address: 123 Main Street
- City: Washington
- State: DC
- Zip Code: 20001

### **From Email Content:**
Look for phrases like:
- "Our property offers..."
- "We are located in..."
- "We can accommodate..."
- "Our rates start at..."
- "We accept NET30 terms"
- "Government per diem accepted"
- "We offer a 30% discount for..."

### **Rating/Tier System (Optional for Notes):**
Based on communication history:
- **Tier 1 (VIP):** 10+ interactions, always responsive, large contracts
- **Tier 2 (Active):** 3-9 interactions, generally responsive
- **Tier 3 (Warm):** 1-2 interactions, shown interest
- **Tier 4 (Cold):** Initial contact only, no follow-up

---

## 📊 Expected Output Statistics

Based on your email volume, expect:
- **Total Contacts:** 10,000-15,000
- **Unique Hotels:** 3,000-5,000
- **VIP/High Priority:** 500-1,000
- **Complete Profiles:** 60-70% (with all optional fields)
- **Minimal Profiles:** 30-40% (required fields only)

---

## 🔄 Import Process (What Happens Next)

1. **You deliver Excel file** with extracted data
2. **User downloads import template** from FEDEVENT
3. **User maps your columns** to template (if needed)
4. **User clicks "Import from CSV"** in admin dashboard
5. **System processes:**
   - Validates required fields
   - Checks for duplicates by email
   - Updates existing records
   - Imports new records
   - Generates unique FEV-XXXXX codes
6. **User sees results:**
   - X new leads imported
   - X existing leads updated
   - X rows skipped (errors)
7. **All data now in FEDEVENT CRM** ready for campaigns

---

## ⚠️ Quality Control Checklist

Before delivering the Excel file:

- [ ] All rows have Hotel Name, Contact Name, and Email
- [ ] No duplicate emails (or intentionally keeping latest)
- [ ] Email formats are valid (contain @ and domain)
- [ ] Phone numbers are formatted consistently
- [ ] No empty rows between data
- [ ] Column headers match exactly (case-sensitive)
- [ ] Special characters handled properly (é, ñ, etc.)
- [ ] No Excel formulas (values only)
- [ ] File size under 25MB
- [ ] Tested with a sample import (first 10 rows)

---

## 🎨 Recommended Excel Formatting

### **Header Row (Row 1):**
- Bold text
- Background color: Blue (#4472C4)
- White text color
- Freeze pane after header

### **Data Rows:**
- Alternate row colors for readability (optional)
- Wrap text in Notes column
- Auto-fit column widths
- Left-align text, right-align numbers

### **Color Coding (Optional):**
- 🟢 Green rows = VIP contacts (Tier 1)
- 🟡 Yellow rows = Active contacts (Tier 2)
- ⚪ White rows = Standard contacts

---

## 📤 Delivery Format

### **Option 1: Single File (Recommended)**
```
hotel-contacts-extracted-2025.xlsx
```
- All data in one sheet
- Ready for direct import
- Most convenient

### **Option 2: Multiple Files**
```
hotel-contacts-vip.xlsx       (500 VIP contacts)
hotel-contacts-active.xlsx    (2,000 active contacts)
hotel-contacts-warm.xlsx      (3,000 warm contacts)
hotel-contacts-cold.xlsx      (5,000 cold contacts)
```
- Segmented by priority
- User can import selectively
- Easier to review quality

### **Option 3: Single File + Summary**
```
hotel-contacts-extracted-2025.xlsx
extraction-summary.txt
```
- Main data file
- Plus text file with statistics and notes

---

## 📈 Sample Summary Report

```
=== FEDEVENT Data Extraction Summary ===

Extraction Date: October 12, 2025
Source: info@creataglobal.com
Date Range: January 2020 - October 2025

STATISTICS:
- Total Emails Processed: 47,523
- Unique Hotels Identified: 4,287
- Contacts Extracted: 6,142
- Complete Profiles (all fields): 2,856 (46%)
- Partial Profiles: 3,286 (54%)

PRIORITY BREAKDOWN:
- High Priority: 892 (15%)
- Normal Priority: 5,050 (82%)
- Urgent: 200 (3%)

TOP STATES:
1. Virginia: 847 contacts
2. Maryland: 623 contacts
3. DC: 512 contacts
4. California: 438 contacts
5. Texas: 391 contacts

SPECIAL TERMS ACCEPTED:
- NET30 Payment: 1,245 hotels (29%)
- Direct Bill: 987 hotels (23%)
- 30% Discount: 456 hotels (11%)
- Government Per Diem: 2,134 hotels (50%)

DATA QUALITY:
- Valid Email Addresses: 100%
- Phone Numbers Present: 78%
- Full Address Present: 65%
- Notes/History Added: 83%

RECOMMENDATIONS:
- Import VIP contacts first (892 records)
- Review "Urgent" flagged leads immediately (200 records)
- Consider segmented campaigns by state
- Follow up with NET30-friendly hotels for government work
```

---

## 🤝 Communication Protocol

### **When Extraction is Complete:**
1. Upload file to secure location
2. Share download link
3. Include summary statistics
4. Note any challenges or anomalies
5. Suggest segmentation strategy

### **If Issues Arise:**
- Missing data: Note percentage and fields affected
- Format questions: Ask for clarification
- Ambiguous information: Flag for human review
- Large file size: Offer to split into batches

---

## ✅ Success Criteria

**Your extraction is successful when:**
- ✅ File imports without errors
- ✅ 95%+ of rows have valid data
- ✅ Duplicate detection works correctly
- ✅ Notes provide actionable insights
- ✅ Priority flags are meaningful
- ✅ User can immediately start campaigns

---

## 🎯 Final Checklist for Gemini

Before delivery:
- [ ] Run spell check on notes
- [ ] Verify email format on ALL rows
- [ ] Check for missing required fields
- [ ] Remove test/sample data
- [ ] Validate phone number formats
- [ ] Check for special characters that might break import
- [ ] Test import with first 10 rows
- [ ] Generate summary statistics
- [ ] Document any anomalies or questions
- [ ] Compress file if over 10MB

---

## 💬 Questions to Ask User (If Needed)

1. **Date Range:** Should I extract from all emails or specific timeframe?
2. **Duplicates:** Keep latest info or merge all communications?
3. **Priority:** How should I determine high vs normal priority?
4. **Notes:** How detailed should communication history be?
5. **Segmentation:** Do you want one file or split by priority/state?
6. **Exclusions:** Any specific hotels or contacts to exclude?
7. **Format:** Excel or CSV? Any special formatting needed?

---

## 🚀 Ready to Begin?

**Confirmation Questions:**
1. ✅ Access to info@creataglobal.com emails confirmed?
2. ✅ Date range for extraction determined?
3. ✅ Output format agreed upon (Excel recommended)?
4. ✅ Priority criteria understood?
5. ✅ Quality standards clear?

**Once confirmed, proceed with extraction!**

---

**Expected Timeline:**
- Small dataset (< 1,000 emails): 1-2 hours
- Medium dataset (1,000-10,000 emails): 4-8 hours
- Large dataset (10,000+ emails): 1-2 days

**Deliverable:**
Professional Excel file ready for one-click import into FEDEVENT CRM.

---

**🎉 This data will power the entire FEDEVENT sales funnel! Let's make it count!**

