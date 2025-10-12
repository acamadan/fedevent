import ExcelJS from 'exceljs';
import fs from 'fs';

async function readExcel() {
  try {
    console.log('🔍 Starting to read Excel file...');
    
    // Check if file exists
    if (!fs.existsSync('example.xlsx')) {
      console.error('❌ File example.xlsx not found!');
      return;
    }
    
    console.log('📁 File found, reading...');
    const workbook = new ExcelJS.Workbook();
    
    // Show progress while reading
    console.log('⏳ Loading workbook (this may take a moment for large files)...');
    await workbook.xlsx.readFile('example.xlsx');
    
    console.log('✅ File read successfully, getting worksheet...');
    const worksheet = workbook.getWorksheet(1);
    
    if (!worksheet) {
      console.error('❌ No worksheet found!');
      return;
    }
    
    console.log(`📊 Worksheet found with ${worksheet.rowCount} rows`);
    
    // Just read first 10 rows to test
    console.log('📖 Reading first 10 rows as sample...');
    const sampleRows = [];
    
    for (let i = 1; i <= Math.min(10, worksheet.rowCount); i++) {
      const row = worksheet.getRow(i);
      sampleRows.push(row.values);
      console.log(`Row ${i}:`, row.values);
    }

    console.log(`✅ Sample complete! Read ${sampleRows.length} rows`);
    
  } catch (error) {
    console.error('❌ Error reading Excel file:', error.message);
  }
}

readExcel();
