import fs from 'fs';

console.log('🔍 Testing file system access...');

// Check if file exists and get its size
if (fs.existsSync('naics.xlsx')) {
  const stats = fs.statSync('naics.xlsx');
  console.log('✅ File exists!');
  console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📅 Last modified: ${stats.mtime}`);
} else {
  console.log('❌ File naics.xlsx not found!');
}

console.log('🔍 Testing exceljs import...');
try {
  const ExcelJS = await import('exceljs');
  console.log('✅ ExcelJS imported successfully');
  console.log('Version:', ExcelJS.default.version || 'unknown');
} catch (error) {
  console.log('❌ ExcelJS import failed:', error.message);
}

console.log('✅ Test complete!');
