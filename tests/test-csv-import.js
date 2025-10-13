#!/usr/bin/env node
/**
 * CSV Import Validator & Tester
 * 
 * Use this to validate Gemini's extracted data before importing to FEDEVENT
 * 
 * Usage:
 *   node test-csv-import.js <csv-file-path>
 * 
 * Example:
 *   node test-csv-import.js sample-import-data.csv
 *   node test-csv-import.js gemini-extracted-contacts.xlsx
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Required field names (flexible matching)
const REQUIRED_FIELDS = {
  email: ['Email', 'email', 'EMAIL', 'Contact Email', 'E-mail'],
  hotelName: ['Hotel Name', 'hotel_name', 'HotelName', 'Hotel', 'Property Name'],
  contactName: ['Contact Name', 'contact_name', 'ContactName', 'Contact', 'Name', 'Full Name']
};

// Optional field names (for validation)
const OPTIONAL_FIELDS = {
  title: ['Title', 'title', 'Job Title'],
  phone: ['Phone', 'phone', 'Contact Phone', 'Mobile'],
  hotelPhone: ['Hotel Phone', 'hotel_phone', 'Property Phone'],
  address: ['Address', 'hotel_address', 'Street Address'],
  city: ['City', 'city'],
  state: ['State', 'state', 'Province'],
  zipCode: ['Zip Code', 'zip_code', 'Postal Code', 'ZIP'],
  country: ['Country', 'country'],
  indoorProperty: ['Indoor Property', 'indoor_property'],
  acceptsNet30: ['Accepts NET30', 'accepts_net30', 'NET30'],
  acceptsDirectBill: ['Accepts Direct Bill', 'accepts_po', 'Direct Bill', 'Purchase Order'],
  acceptsDiscount: ['30% Discount', 'accepts_discount', 'Discount'],
  interests: ['Interests', 'interests', 'Services'],
  priorityLevel: ['Priority Level', 'priority_level', 'Priority'],
  notes: ['Notes', 'notes', 'Comments', 'History']
};

function findColumn(headers, possibleNames) {
  for (const name of possibleNames) {
    const found = headers.find(h => h.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  return null;
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function validatePhone(phone) {
  // Remove common formatting
  const cleaned = String(phone).replace(/[\s\-\(\)\.]/g, '');
  // Should have 10-15 digits
  return /^\d{10,15}$/.test(cleaned);
}

async function validateCSV(filePath) {
  console.log(`${colors.cyan}${colors.bold}=== CSV Import Validator ===${colors.reset}\n`);
  console.log(`📄 File: ${filePath}\n`);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`${colors.red}❌ Error: File not found: ${filePath}${colors.reset}`);
    process.exit(1);
  }

  // Read file
  let fileContent;
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.xlsx' || ext === '.xls') {
    console.log(`${colors.yellow}⚠️  Excel file detected. Converting to CSV for validation...${colors.reset}`);
    // For Excel files, we'll need ExcelJS
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      
      // Convert to CSV format
      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        rows.push(row.values.slice(1)); // Skip index 0 (Excel is 1-indexed)
      });
      
      // Convert to CSV string
      fileContent = rows.map(row => row.map(cell => {
        const val = cell || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')).join('\n');
      
    } catch (error) {
      console.error(`${colors.red}❌ Error reading Excel file: ${error.message}${colors.reset}`);
      console.log(`${colors.yellow}💡 Tip: Install exceljs if not already installed: npm install exceljs${colors.reset}`);
      process.exit(1);
    }
  } else {
    fileContent = fs.readFileSync(filePath, 'utf8');
  }

  // Parse CSV
  let records;
  try {
    records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true
    });
  } catch (error) {
    console.error(`${colors.red}❌ Error parsing CSV: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.green}✅ File parsed successfully${colors.reset}`);
  console.log(`${colors.blue}📊 Total rows: ${records.length}${colors.reset}\n`);

  // Get headers
  const headers = Object.keys(records[0] || {});
  console.log(`${colors.cyan}📋 Columns found (${headers.length}):${colors.reset}`);
  headers.forEach(h => console.log(`   - ${h}`));
  console.log('');

  // Validate required fields
  console.log(`${colors.cyan}${colors.bold}🔍 Validating Required Fields:${colors.reset}`);
  
  const mappedFields = {};
  let allRequiredPresent = true;

  for (const [field, possibleNames] of Object.entries(REQUIRED_FIELDS)) {
    const foundColumn = findColumn(headers, possibleNames);
    if (foundColumn) {
      mappedFields[field] = foundColumn;
      console.log(`${colors.green}✅ ${field}: "${foundColumn}"${colors.reset}`);
    } else {
      allRequiredPresent = false;
      console.log(`${colors.red}❌ ${field}: NOT FOUND${colors.reset}`);
      console.log(`${colors.yellow}   Expected one of: ${possibleNames.join(', ')}${colors.reset}`);
    }
  }
  console.log('');

  if (!allRequiredPresent) {
    console.error(`${colors.red}${colors.bold}❌ VALIDATION FAILED: Missing required columns${colors.reset}`);
    console.log(`\n${colors.yellow}💡 Tip: Make sure your CSV has these columns:${colors.reset}`);
    console.log(`   - Email (or any variant like "email", "Contact Email")`);
    console.log(`   - Hotel Name (or "hotel_name", "Property Name")`);
    console.log(`   - Contact Name (or "contact_name", "Name")`);
    process.exit(1);
  }

  // Validate optional fields
  console.log(`${colors.cyan}${colors.bold}📝 Optional Fields Found:${colors.reset}`);
  let optionalCount = 0;
  for (const [field, possibleNames] of Object.entries(OPTIONAL_FIELDS)) {
    const foundColumn = findColumn(headers, possibleNames);
    if (foundColumn) {
      mappedFields[field] = foundColumn;
      console.log(`${colors.green}✅ ${field}: "${foundColumn}"${colors.reset}`);
      optionalCount++;
    }
  }
  console.log(`${colors.blue}Found ${optionalCount} optional fields${colors.reset}\n`);

  // Validate data quality
  console.log(`${colors.cyan}${colors.bold}🔬 Data Quality Check:${colors.reset}`);
  
  let validRows = 0;
  let invalidRows = 0;
  const errors = [];
  const warnings = [];

  records.forEach((record, index) => {
    const rowNum = index + 2; // +2 because 1-indexed and header is row 1
    let rowValid = true;
    
    // Check required fields
    const email = record[mappedFields.email];
    const hotelName = record[mappedFields.hotelName];
    const contactName = record[mappedFields.contactName];

    if (!email || !email.trim()) {
      errors.push(`Row ${rowNum}: Missing email`);
      rowValid = false;
    } else if (!validateEmail(email)) {
      errors.push(`Row ${rowNum}: Invalid email format: ${email}`);
      rowValid = false;
    }

    if (!hotelName || !hotelName.trim()) {
      errors.push(`Row ${rowNum}: Missing hotel name`);
      rowValid = false;
    }

    if (!contactName || !contactName.trim()) {
      errors.push(`Row ${rowNum}: Missing contact name`);
      rowValid = false;
    }

    // Check optional fields (warnings only)
    if (mappedFields.phone) {
      const phone = record[mappedFields.phone];
      if (phone && !validatePhone(phone)) {
        warnings.push(`Row ${rowNum}: Phone format looks unusual: ${phone}`);
      }
    }

    if (mappedFields.priorityLevel) {
      const priority = record[mappedFields.priorityLevel];
      const validPriorities = ['normal', 'high', 'urgent'];
      if (priority && !validPriorities.includes(priority.toLowerCase())) {
        warnings.push(`Row ${rowNum}: Priority "${priority}" should be: normal, high, or urgent`);
      }
    }

    if (rowValid) {
      validRows++;
    } else {
      invalidRows++;
    }
  });

  console.log(`${colors.green}✅ Valid rows: ${validRows}${colors.reset}`);
  if (invalidRows > 0) {
    console.log(`${colors.red}❌ Invalid rows: ${invalidRows}${colors.reset}`);
  }
  if (warnings.length > 0) {
    console.log(`${colors.yellow}⚠️  Warnings: ${warnings.length}${colors.reset}`);
  }
  console.log('');

  // Show errors
  if (errors.length > 0) {
    console.log(`${colors.red}${colors.bold}❌ Errors (showing first 10):${colors.reset}`);
    errors.slice(0, 10).forEach(err => console.log(`   ${colors.red}${err}${colors.reset}`));
    if (errors.length > 10) {
      console.log(`   ${colors.yellow}...and ${errors.length - 10} more errors${colors.reset}`);
    }
    console.log('');
  }

  // Show warnings
  if (warnings.length > 0) {
    console.log(`${colors.yellow}⚠️  Warnings (showing first 5):${colors.reset}`);
    warnings.slice(0, 5).forEach(warn => console.log(`   ${colors.yellow}${warn}${colors.reset}`));
    if (warnings.length > 5) {
      console.log(`   ${colors.yellow}...and ${warnings.length - 5} more warnings${colors.reset}`);
    }
    console.log('');
  }

  // Summary
  console.log(`${colors.cyan}${colors.bold}📊 Summary:${colors.reset}`);
  console.log(`   Total rows: ${records.length}`);
  console.log(`   Valid rows: ${validRows} (${(validRows/records.length*100).toFixed(1)}%)`);
  console.log(`   Invalid rows: ${invalidRows}`);
  console.log(`   Errors: ${errors.length}`);
  console.log(`   Warnings: ${warnings.length}`);
  console.log('');

  // Final verdict
  if (invalidRows === 0) {
    console.log(`${colors.green}${colors.bold}🎉 SUCCESS! File is ready to import!${colors.reset}`);
    console.log(`\n${colors.cyan}Next steps:${colors.reset}`);
    console.log(`   1. Login to FEDEVENT admin dashboard`);
    console.log(`   2. Go to Waitlist tab`);
    console.log(`   3. Click "📤 Import from CSV"`);
    console.log(`   4. Select this file`);
    console.log(`   5. Click "Import Data"`);
    console.log(`\n${colors.green}Expected result: ${validRows} contacts will be imported!${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}⚠️  VALIDATION FAILED${colors.reset}`);
    console.log(`\n${colors.yellow}Please fix the errors above before importing.${colors.reset}`);
    console.log(`${colors.cyan}After fixing, run this validator again to verify.${colors.reset}`);
  }
}

// Main execution
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`${colors.cyan}${colors.bold}CSV Import Validator${colors.reset}\n`);
  console.log('Usage: node test-csv-import.js <file-path>\n');
  console.log('Examples:');
  console.log('  node test-csv-import.js sample-import-data.csv');
  console.log('  node test-csv-import.js gemini-extracted-contacts.xlsx');
  console.log('  node test-csv-import.js ../downloads/hotel-contacts.csv\n');
  process.exit(0);
}

const filePath = args[0];
validateCSV(filePath).catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});

