# 🧪 Testing Your Import Files - Quick Guide

## Tools Available

You now have **3 files** to help test and validate imports before going live:

1. **`sample-import-data.csv`** - Perfect example with 10 sample contacts
2. **`test-csv-import.js`** - Validator script to check any CSV/Excel file
3. **`IMPORT_FORMAT_SPEC.md`** - Official format specification

---

## 🚀 Quick Start: Test the Sample File

### Step 1: Test the Sample Data
```bash
node test-csv-import.js sample-import-data.csv
```

**Expected output:**
```
✅ File parsed successfully
📊 Total rows: 10

🔍 Validating Required Fields:
✅ email: "Email"
✅ hotelName: "Hotel Name"
✅ contactName: "Contact Name"

🎉 SUCCESS! File is ready to import!
```

### Step 2: Import the Sample to FEDEVENT
1. Start your server: `npm start`
2. Login to admin dashboard
3. Go to **Waitlist** tab
4. Click **"📤 Import from CSV"**
5. Select `sample-import-data.csv`
6. Click **"Import Data"**

**Expected result:**
```
✅ Import Successful!
- 10 new leads imported
- 0 existing leads updated
- 0 rows skipped
```

### Step 3: Verify in Dashboard
- See 10 new contacts in waitlist table
- Check that all data imported correctly
- Note the auto-generated user codes (FEV-XXXXX)

---

## 🔍 Test Gemini's Extracted File

When Gemini delivers the extracted data:

### Step 1: Validate Before Importing
```bash
node test-csv-import.js gemini-hotel-contacts.xlsx
```

or

```bash
node test-csv-import.js path/to/gemini-data.csv
```

### Step 2: Review Results

**✅ If validation passes:**
```
🎉 SUCCESS! File is ready to import!

Expected result: 10,247 contacts will be imported!
```
→ Go ahead and import to FEDEVENT!

**❌ If validation fails:**
```
⚠️ VALIDATION FAILED

Errors:
   Row 5: Missing email
   Row 23: Invalid email format: john@@hotel.com
   Row 98: Missing hotel name
```
→ Fix errors in the file and validate again

### Step 3: Fix Common Issues

**Missing Email:**
```csv
# Before (BAD)
Hotel Name,Contact Name,Email
Grand Hotel,John Smith,

# After (GOOD)
Hotel Name,Contact Name,Email
Grand Hotel,John Smith,john.smith@grandhotel.com
```

**Invalid Email Format:**
```csv
# Before (BAD)
Email
john.smith
john@@hotel.com
@grandhotel.com

# After (GOOD)
Email
john.smith@grandhotel.com
john@hotel.com
admin@grandhotel.com
```

**Missing Required Columns:**
```csv
# Before (BAD) - Missing "Contact Name"
Email,Hotel Name,Person
john@hotel.com,Grand Hotel,John Smith

# After (GOOD)
Email,Hotel Name,Contact Name
john@hotel.com,Grand Hotel,John Smith
```

---

## 🎯 Testing Workflow

### For Gemini (Data Extractor):

1. **Extract sample data** (10-20 emails first)
2. **Create test CSV file**
3. **Run validator:**
   ```bash
   node test-csv-import.js test-sample.csv
   ```
4. **If passes** → Continue with full extraction
5. **If fails** → Adjust format and retry
6. **Full extraction** → Validate again
7. **Deliver to user**

### For User (Importer):

1. **Receive file from Gemini**
2. **Run validator:**
   ```bash
   node test-csv-import.js gemini-contacts.xlsx
   ```
3. **Review results:**
   - Green ✅ = Ready to import!
   - Red ❌ = Ask Gemini to fix errors
   - Yellow ⚠️ = Warnings only, can still import
4. **Import to FEDEVENT**
5. **Verify import results**
6. **Check data in dashboard**

---

## 🧪 Test Scenarios

### Scenario 1: Perfect File
```bash
node test-csv-import.js sample-import-data.csv
```
**Result:** All green checkmarks, ready to import

### Scenario 2: Missing Required Field
Create a test file:
```csv
Hotel Name,Contact Name
Grand Hotel,John Smith
```
(Missing Email column)

```bash
node test-csv-import.js bad-sample.csv
```
**Result:** Red ❌ showing "email: NOT FOUND"

### Scenario 3: Invalid Data
```csv
Email,Hotel Name,Contact Name
john.smith,Grand Hotel,John Smith
```
(Invalid email format)

```bash
node test-csv-import.js bad-data.csv
```
**Result:** Shows error "Row 2: Invalid email format"

### Scenario 4: Large File
```bash
node test-csv-import.js big-file-10000-rows.xlsx
```
**Result:** Shows processing stats and quality metrics

---

## 📊 Understanding Validator Output

### Section 1: File Info
```
📄 File: gemini-contacts.xlsx
✅ File parsed successfully
📊 Total rows: 10,247
```
Shows file loaded correctly and row count.

### Section 2: Column Detection
```
📋 Columns found (18):
   - Email
   - Hotel Name
   - Contact Name
   ...
```
Lists all columns found in your file.

### Section 3: Required Fields
```
🔍 Validating Required Fields:
✅ email: "Email"
✅ hotelName: "Hotel Name"
✅ contactName: "Contact Name"
```
**Must all be ✅** or import will fail.

### Section 4: Optional Fields
```
📝 Optional Fields Found:
✅ title: "Title"
✅ phone: "Phone"
✅ notes: "Notes"
Found 6 optional fields
```
Nice to have, but not required.

### Section 5: Data Quality
```
🔬 Data Quality Check:
✅ Valid rows: 10,200
❌ Invalid rows: 47
⚠️  Warnings: 15
```
Shows how many rows are good vs problematic.

### Section 6: Errors & Warnings
```
❌ Errors (showing first 10):
   Row 5: Missing email
   Row 23: Invalid email format: john@@hotel.com
   Row 98: Missing hotel name
```
Specific issues that need fixing.

### Section 7: Summary
```
📊 Summary:
   Total rows: 10,247
   Valid rows: 10,200 (99.5%)
   Invalid rows: 47
   Errors: 47
   Warnings: 15
```
Overall quality metrics.

### Section 8: Verdict
```
🎉 SUCCESS! File is ready to import!
```
or
```
⚠️ VALIDATION FAILED
Please fix the errors above before importing.
```

---

## 💡 Pro Tips

### Tip 1: Test with Small Sample First
```bash
# Create a test file with just 10 rows
# Run validator
# Import to FEDEVENT
# Verify results
# Then proceed with full file
```

### Tip 2: Use Validator During Extraction
Gemini can run the validator after extracting each batch:
```bash
# Extract first 100 emails
node test-csv-import.js batch1.csv

# Fix any issues
# Extract next 100
node test-csv-import.js batch2.csv

# Repeat until all done
```

### Tip 3: Save Validation Reports
```bash
node test-csv-import.js data.csv > validation-report.txt
```
Keep a log of validation results.

### Tip 4: Check Before Sending
**Gemini should always run validator before delivering:**
```bash
node test-csv-import.js final-extraction.xlsx
```
Only send if it passes!

---

## 🔧 Troubleshooting

### Problem: "Command not found: node"
**Solution:** Install Node.js or use npm:
```bash
npm start  # This ensures Node.js is available
node test-csv-import.js file.csv
```

### Problem: "Cannot find module 'csv-parse'"
**Solution:** Install dependencies:
```bash
npm install
```

### Problem: "File not found"
**Solution:** Check file path:
```bash
# Use relative path
node test-csv-import.js ./data/file.csv

# Or absolute path
node test-csv-import.js /full/path/to/file.csv

# Or change to file directory first
cd downloads
node ../test-csv-import.js file.csv
```

### Problem: "Error reading Excel file"
**Solution:** Make sure ExcelJS is installed:
```bash
npm install exceljs
```

### Problem: Validator passes but import fails
**Solution:** 
1. Check file size (must be under 25MB)
2. Try saving Excel as CSV first
3. Check for hidden characters/BOM
4. Review FEDEVENT server logs

---

## 📋 Quick Command Reference

```bash
# Test the sample file
node test-csv-import.js sample-import-data.csv

# Test your CSV file
node test-csv-import.js your-file.csv

# Test your Excel file
node test-csv-import.js your-file.xlsx

# Test with full path
node test-csv-import.js /path/to/file.csv

# Show help
node test-csv-import.js
```

---

## ✅ Pre-Import Checklist

Before importing any file to FEDEVENT:

- [ ] File validated with test-csv-import.js
- [ ] All errors fixed (green ✅ result)
- [ ] Reviewed warnings (optional fixes)
- [ ] Tested with small sample if large file
- [ ] Server is running (npm start)
- [ ] Logged into admin dashboard
- [ ] Ready to click "Import from CSV"!

---

## 🎯 Expected Timeline

### For Testing Sample File:
- Validate: 5 seconds
- Import: 5 seconds
- Verify: 1 minute
**Total: ~2 minutes**

### For Testing Gemini's File (10,000 rows):
- Validate: 10-15 seconds
- Review results: 2-3 minutes
- Import: 20-30 seconds
- Verify: 2-3 minutes
**Total: ~5-7 minutes**

---

## 🎉 Success Criteria

You know testing is complete when:

✅ Validator shows green checkmarks  
✅ No red error messages  
✅ Valid rows = 100% (or 95%+)  
✅ Sample import works correctly  
✅ Data appears correctly in dashboard  
✅ Auto-generated codes present (FEV-XXXXX)  
✅ Duplicate emails update existing records  
✅ Ready for production import!  

---

## 📞 Need Help?

**If validator shows errors:**
1. Read the error messages carefully
2. Check IMPORT_FORMAT_SPEC.md
3. Fix issues in source file
4. Run validator again
5. Repeat until green ✅

**If import fails after validation passes:**
1. Check server logs
2. Verify file size under 25MB
3. Try CSV instead of Excel
4. Test with smaller subset first
5. Contact developer if persistent issues

---

**🎊 You're all set! The testing tools are ready to ensure perfect imports!**

**Test → Validate → Import → Success!** 🚀

