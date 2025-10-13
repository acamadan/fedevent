# 📋 CSV Import Format Specification

## Official Format Guide for Gemini's Data Extraction

This document defines the **exact format** FEDEVENT expects for CSV imports. Share this with Gemini to ensure perfect compatibility!

---

## ✅ Required Columns (Must Have)

These 3 columns **MUST** be present in your CSV/Excel file:

| Column Name | Alternative Names Accepted | Format | Example |
|-------------|---------------------------|---------|---------|
| **Email** | `email`, `EMAIL`, `Contact Email`, `E-mail` | Valid email address | john.smith@grandhotel.com |
| **Hotel Name** | `hotel_name`, `HotelName`, `Hotel`, `Property Name` | Text (any length) | Grand Hotel Washington DC |
| **Contact Name** | `contact_name`, `ContactName`, `Contact`, `Name`, `Full Name` | Text (First Last) | John Smith |

⚠️ **If ANY of these 3 columns are missing, the import will fail!**

---

## 📝 Optional Columns (Highly Recommended)

These columns are optional but add valuable data:

| Column Name | Alternative Names | Format | Example |
|-------------|------------------|--------|---------|
| **Title** | `title`, `Job Title` | Text | General Manager |
| **Phone** | `phone`, `Contact Phone`, `Mobile` | XXX-XXX-XXXX or (XXX) XXX-XXXX | 555-123-4567 |
| **Hotel Phone** | `hotel_phone`, `Property Phone` | XXX-XXX-XXXX or (XXX) XXX-XXXX | 555-123-4500 |
| **Address** | `hotel_address`, `Street Address` | Full street address | 123 Main Street |
| **City** | `city` | City name | Washington |
| **State** | `state`, `Province` | 2-letter code or full name | DC or District of Columbia |
| **Zip Code** | `zip_code`, `Postal Code`, `ZIP` | 5 or 9 digits | 20001 or 20001-1234 |
| **Country** | `country` | Full country name | USA or United States |
| **Indoor Property** | `indoor_property` | Yes/No | Yes |
| **Accepts NET30** | `accepts_net30`, `NET30` | Yes/No | Yes |
| **Accepts Direct Bill** | `accepts_po`, `Direct Bill`, `Purchase Order` | Yes/No | Yes |
| **30% Discount** | `accepts_discount`, `Discount` | Yes/No | Yes |
| **Interests** | `interests`, `Services` | Free text | Government contracts, conferences |
| **Priority Level** | `priority_level`, `Priority` | normal / high / urgent | high |
| **Notes** | `notes`, `Comments`, `History` | Free text (unlimited) | VIP contact, responds within 24hrs |

---

## 🎯 Column Name Flexibility

**Good news!** The system is smart about column names. All these work:

### Email Column:
✅ `Email`  
✅ `email`  
✅ `EMAIL`  
✅ `Contact Email`  
✅ `E-mail`  

### Hotel Name Column:
✅ `Hotel Name`  
✅ `hotel_name`  
✅ `HotelName`  
✅ `Hotel`  
✅ `Property Name`  

### Contact Name Column:
✅ `Contact Name`  
✅ `contact_name`  
✅ `ContactName`  
✅ `Contact`  
✅ `Name`  
✅ `Full Name`  

**Bottom line:** Use whatever naming makes sense, the system will figure it out!

---

## 📊 File Format Options

### Supported File Types:
1. **.csv** (Comma-separated values) ✅ BEST
2. **.xlsx** (Excel 2007+) ✅ RECOMMENDED
3. **.xls** (Excel 97-2003) ✅ Supported

### File Requirements:
- **Maximum size:** 25 MB
- **Maximum rows:** Unlimited (tested with 50,000+)
- **Encoding:** UTF-8 (handles international characters)
- **No merged cells** in Excel
- **First row must be headers**
- **No empty rows** between data

---

## 🎨 Sample File Structure

### Minimal (3 Required Columns):
```csv
Email,Hotel Name,Contact Name
john.smith@grandhotel.com,Grand Hotel DC,John Smith
sarah.j@marriott.com,Marriott Pentagon,Sarah Johnson
mchen@embassysuites.com,Embassy Suites,Michael Chen
```

### Recommended (All Useful Columns):
```csv
Email,Hotel Name,Contact Name,Title,Phone,City,State,Priority Level,Notes
john.smith@grandhotel.com,Grand Hotel DC,John Smith,General Manager,555-123-4567,Washington,DC,high,VIP contact
sarah.j@marriott.com,Marriott Pentagon,Sarah Johnson,Sales Director,555-234-5678,Arlington,VA,high,Quick responder
mchen@embassysuites.com,Embassy Suites,Michael Chen,Revenue Manager,555-345-6789,Bethesda,MD,normal,Solid partner
```

### Complete (All Possible Columns):
See `sample-import-data.csv` in the project root for a full example with all 18 columns!

---

## ✅ Data Validation Rules

### Email Validation:
- ✅ Must contain `@` and a domain
- ✅ Format: `name@domain.com`
- ❌ Invalid: `john.smith`, `@grandhotel.com`, `john@`

### Phone Validation (Optional but recommended):
- ✅ 10-15 digits
- ✅ Can include: `( ) - . spaces`
- ✅ Valid: `555-123-4567`, `(555) 123-4567`, `5551234567`
- ⚠️ Warning: `555-123-456` (too short)

### Priority Level (If provided):
- ✅ Must be: `normal`, `high`, or `urgent`
- ✅ Case-insensitive: `Normal`, `HIGH`, `Urgent` all work
- ❌ Invalid: `medium`, `low`, `top`

### Yes/No Fields:
- ✅ Accepts: `Yes`, `yes`, `YES`, `Y`
- ✅ Accepts: `No`, `no`, `NO`, `N`
- ✅ Empty is treated as "No"

---

## 🔄 Duplicate Handling

**Email is the unique identifier!**

### What Happens:
1. **New email** → Creates new contact
2. **Existing email** → Updates existing contact with new data
3. **Duplicate in same file** → Latest row wins

### Example:
```csv
Email,Hotel Name,Contact Name,Notes
john@hotel.com,Grand Hotel,John Smith,First note
john@hotel.com,Grand Hotel,John Smith,Updated note
```
**Result:** Only ONE contact created/updated with "Updated note"

---

## 🧪 Testing Your File

### Before Sending to FEDEVENT:

1. **Use the validator:**
   ```bash
   node test-csv-import.js your-file.csv
   ```

2. **Check for:**
   - ✅ All required columns present
   - ✅ Valid email formats
   - ✅ No completely empty rows
   - ✅ Reasonable phone number formats
   - ✅ Priority levels are correct values

3. **Review output:**
   - Green ✅ = Good to go!
   - Red ❌ = Fix errors before importing
   - Yellow ⚠️ = Warnings (won't stop import)

---

## 📤 Import Process

### Step 1: Prepare File
- Save as CSV or Excel
- Verify required columns
- Run validator (optional but recommended)

### Step 2: Import to FEDEVENT
1. Login to admin dashboard
2. Go to **Waitlist** tab
3. Click **"📤 Import from CSV"**
4. Select your file
5. Click **"Import Data"**

### Step 3: Review Results
```
✅ Import Successful!
- 2,847 new leads imported
- 1,234 existing leads updated
- 43 rows skipped
- 4,124 total rows processed
```

### Step 4: Handle Errors (if any)
- Review error list
- Fix issues in source file
- Re-import (updates existing records)

---

## 🎯 Best Practices for Gemini

### DO:
✅ Include all 3 required fields in every row  
✅ Use consistent column names  
✅ Format phone numbers consistently  
✅ Add detailed notes (very valuable!)  
✅ Set priority levels for VIP contacts  
✅ Use proper capitalization  
✅ Include city/state for better tracking  

### DON'T:
❌ Leave email field empty  
❌ Use merged cells in Excel  
❌ Include formulas (values only!)  
❌ Add summary rows at bottom  
❌ Use special characters in column headers  
❌ Include multiple contacts in one row  

---

## 🔍 Common Issues & Solutions

### Issue: "Missing required field 'email'"
**Solution:** Make sure every row has an email address in the Email column

### Issue: "Invalid email format"
**Solution:** Check for typos like `john@@hotel.com` or `john.smithhotel.com`

### Issue: "All rows skipped"
**Solution:** Check column headers - they must match one of the accepted names

### Issue: "Some rows skipped"
**Solution:** Review error list in import results - usually missing required fields

### Issue: "Excel file shows weird characters"
**Solution:** Save as CSV with UTF-8 encoding

---

## 📋 Quick Reference Checklist

Before importing, verify:
- [ ] File is .csv, .xlsx, or .xls format
- [ ] First row contains column headers
- [ ] Has columns: Email, Hotel Name, Contact Name
- [ ] All email addresses are valid format
- [ ] No completely empty rows
- [ ] No merged cells (if Excel)
- [ ] File size under 25 MB
- [ ] Ran validator (optional)
- [ ] Ready to import!

---

## 🎨 Excel Formatting Tips (Optional)

Make it pretty for review:

### Headers:
- Bold text
- Blue background (#4472C4)
- White text color

### Data:
- Wrap text in Notes column
- Auto-fit column widths
- Freeze top row
- Alternate row colors (optional)

### Priority Highlighting:
- 🟢 Green = VIP/High priority
- 🟡 Yellow = Normal priority
- ⚪ White = Standard

---

## 📊 Expected Performance

| File Size | Rows | Import Time |
|-----------|------|-------------|
| Small | 1-100 | < 5 seconds |
| Medium | 100-1,000 | 5-10 seconds |
| Large | 1,000-10,000 | 10-30 seconds |
| Very Large | 10,000-50,000 | 30-90 seconds |

---

## ✅ Validation Success Example

When you run the validator on a good file:

```
=== CSV Import Validator ===

📄 File: gemini-extracted-contacts.xlsx

✅ File parsed successfully
📊 Total rows: 10,247

🔍 Validating Required Fields:
✅ email: "Email"
✅ hotelName: "Hotel Name"
✅ contactName: "Contact Name"

📝 Optional Fields Found:
✅ title: "Title"
✅ phone: "Phone"
✅ city: "City"
✅ state: "State"
✅ notes: "Notes"
✅ priorityLevel: "Priority Level"
Found 6 optional fields

🔬 Data Quality Check:
✅ Valid rows: 10,247
⚠️  Warnings: 23

📊 Summary:
   Total rows: 10,247
   Valid rows: 10,247 (100.0%)
   Invalid rows: 0
   Errors: 0
   Warnings: 23

🎉 SUCCESS! File is ready to import!

Next steps:
   1. Login to FEDEVENT admin dashboard
   2. Go to Waitlist tab
   3. Click "📤 Import from CSV"
   4. Select this file
   5. Click "Import Data"

Expected result: 10,247 contacts will be imported!
```

---

## 🤝 Questions?

If you're unsure about formatting:
1. Download the template from FEDEVENT dashboard
2. Use `sample-import-data.csv` as reference
3. Run the validator on your file
4. Test with 10 rows first

---

## 🎯 TL;DR (Quick Version)

**Required:**
- Email, Hotel Name, Contact Name

**Recommended:**
- Phone, City, State, Notes, Priority Level

**Format:**
- CSV or Excel
- First row = headers
- UTF-8 encoding

**Test:**
```bash
node test-csv-import.js your-file.csv
```

**Import:**
1. Dashboard → Waitlist Tab
2. Click "Import from CSV"
3. Select file
4. Done!

---

**🎉 You're ready! Just follow this spec and your import will be perfect!**

