# 📧 Gemini: Prelaunch Contact Extraction Guide

## 🎯 Your Mission

Extract **basic contact information** from `info@creataglobal.com` emails to build a prelaunch invitation list.

**What You're Building:** A list of hotels to INVITE (not detailed profiles)

---

## 📋 What to Extract

### **✅ REQUIRED (Must Have):**

1. **Email** - Contact email address
2. **Hotel Name** - Property name
3. **Contact Name** - Person's full name

### **✅ OPTIONAL (Nice to Have):**

4. **Address** - Street address (if in signature)
5. **City** - City name
6. **State** - State/Province  
7. **Zip Code** - Postal code
8. **Country** - Country (default: USA if not specified)
9. **Phone** - Contact phone number
10. **Priority Level** - `high` or `normal`
11. **Notes** - Brief communication summary

---

## ❌ DO NOT Extract

These fields are collected LATER when hotels fill out the registration form:

- ❌ Indoor Property
- ❌ Accepts NET30
- ❌ Accepts Direct Bill
- ❌ 30% Discount
- ❌ Interests
- ❌ Meeting space details
- ❌ Room counts
- ❌ Amenities

**Hotels provide these when they register!**

---

## 📊 Output Format

### **File Type:** Excel (.xlsx) or CSV

### **Column Headers:**
```
Email | Hotel Name | Contact Name | Address | City | State | Zip Code | Country | Phone | Priority Level | Notes
```

### **Example Row:**
```csv
john.smith@grandhotel.com,Grand Hotel Washington,John Smith,123 Main Street,Washington,DC,20001,USA,555-123-4567,high,Inquired about government lodging - March 2024
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
- Email: john.smith@grandhotel.com
- Hotel Name: Grand Hotel Washington
- Contact Name: John Smith
- Address: 123 Main Street
- City: Washington
- State: DC
- Zip Code: 20001
- Country: USA (default)
- Phone: 555-123-4567

### **Priority Level Decision:**

**High Priority:**
- Multiple email exchanges
- Warm leads
- Expressed strong interest
- Responded quickly
- Asked follow-up questions

**Normal Priority:**
- Single email exchange
- Cold leads
- General inquiry
- No follow-up

### **Notes Field:**

Keep it brief (1-2 sentences):
- "Inquired about government contracts - March 2024"
- "Responded to initial outreach - interested"
- "Past email exchange about federal lodging"
- "Asked to be notified at launch"
- "Multiple exchanges - warm lead"

**NOT needed:**
- Full conversation history
- Long paragraphs
- Detailed requirements

---

## 📝 Sample Output File

```csv
Email,Hotel Name,Contact Name,Address,City,State,Zip Code,Country,Phone,Priority Level,Notes
john.smith@grandhotel.com,Grand Hotel Washington,John Smith,123 Main Street,Washington,DC,20001,USA,555-123-4567,high,Inquired about government lodging - March 2024
sarah.j@marriott.com,Marriott Pentagon City,Sarah Johnson,100 Pentagon Plaza,Arlington,VA,22202,USA,555-234-5678,high,Responded to initial outreach - very interested
mchen@embassysuites.com,Embassy Suites Bethesda,Michael Chen,4300 Military Road,Bethesda,MD,20814,USA,555-345-6789,normal,Past email exchange about federal contracts
l.martinez@hilton.com,Hilton Crystal City,Lisa Martinez,2399 Jefferson Davis Hwy,Arlington,VA,22202,USA,555-456-7890,high,Warm lead - wants info when launched
dthompson@marriott.com,Courtyard by Marriott,David Thompson,1533 Clarendon Blvd,Arlington,VA,22209,USA,555-567-8901,normal,Initial inquiry in 2024
```

---

## ✅ Quality Checklist

Before delivering file:

- [ ] All rows have Email, Hotel Name, Contact Name
- [ ] All emails are valid format (has @ and domain)
- [ ] No duplicate emails (or keep most recent)
- [ ] Phone numbers formatted consistently
- [ ] Priority level is "high" or "normal"
- [ ] Notes are brief (1-2 sentences)
- [ ] No empty rows between data
- [ ] First row is headers
- [ ] File size under 25MB
- [ ] **Run validator:** `node test-csv-import.js your-file.xlsx`

---

## 🧪 Validation (REQUIRED!)

Before delivering, run the validator:

```bash
node test-csv-import.js hotel-contacts.xlsx
```

**Expected output:**
```
✅ File parsed successfully
📊 Total rows: 2,347

🔍 Validating Required Fields:
✅ email: "Email"
✅ hotelName: "Hotel Name"
✅ contactName: "Contact Name"

📝 Optional Fields Found:
✅ city: "City"
✅ state: "State"
✅ notes: "Notes"
✅ priorityLevel: "Priority Level"

🔬 Data Quality Check:
✅ Valid rows: 2,347

🎉 SUCCESS! File is ready to import!
```

**If errors shown:** Fix them and validate again!

---

## 🔄 What Happens After Delivery

1. **User imports** your file to FEDEVENT
2. **System assigns** unique codes (FEV-XXXXX)
3. **Status set to** "not_invited"
4. **User sends** bulk invitation emails
5. **Status updates to** "invited"
6. **Hotels click** link and fill registration form
7. **System auto-updates** status to "registered"
8. **Business terms** collected from form (not your extraction!)

**Your job ends at step 1!** ✅

---

## 💡 Pro Tips

### **Tip 1: Start Small**
Extract 10-20 emails first, validate, ensure format is perfect.

### **Tip 2: Use Consistent Formatting**
- Phone: XXX-XXX-XXXX
- State: 2-letter code (DC, VA, MD)
- Country: Full name (USA, Canada)

### **Tip 3: Skip Non-Contacts**
Don't extract:
- Marketing emails
- Automated replies
- Newsletters
- Spam

### **Tip 4: Prioritize Wisely**
Only mark "high" if genuinely warm lead.
Most should be "normal".

---

## 📊 Expected Output

**Total Contacts:** 2,000 - 5,000
**High Priority:** 500 - 1,000 (20-30%)
**Normal Priority:** 1,500 - 4,000 (70-80%)
**File Size:** 2-5 MB
**Format:** Excel (.xlsx) preferred

---

## 🎯 Quick Reference

**Extract:**
- ✅ Email, Hotel Name, Contact Name (required)
- ✅ Address, City, State, Phone, Notes (optional)
- ✅ Priority level based on engagement

**Don't Extract:**
- ❌ Business terms (NET30, discounts, etc.)
- ❌ Property details (rooms, amenities)
- ❌ Service offerings

**Validate:**
- ✅ Run `node test-csv-import.js file.xlsx`
- ✅ Fix errors until green checkmark
- ✅ Deliver validated file

---

## ✅ Delivery Checklist

- [ ] Extracted from all relevant emails
- [ ] Required fields present in every row
- [ ] No duplicate emails
- [ ] Valid email formats
- [ ] Consistent phone formatting
- [ ] Brief notes (1-2 sentences)
- [ ] Priority levels assigned
- [ ] Validated with test script
- [ ] No errors in validation
- [ ] File saved as Excel (.xlsx)
- [ ] Ready to deliver!

---

## 🎉 Done!

Once file passes validation:
1. Save as: `hotel-contacts-prelaunch-YYYY-MM-DD.xlsx`
2. Deliver to user
3. User imports in < 1 minute
4. System tracks everything automatically!

**Simple, clean, validated data = Perfect import!** ✅

