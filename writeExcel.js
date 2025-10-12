import ExcelJS from 'exceljs';

async function createExcel() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('My Sheet');

  worksheet.columns = [
    { header: 'Name', key: 'name' },
    { header: 'Email', key: 'email' },
    { header: 'Score', key: 'score' },
  ];

  worksheet.addRow({ name: 'John Doe', email: 'john@example.com', score: 95 });
  worksheet.addRow({ name: 'Jane Smith', email: 'jane@example.com', score: 88 });

  await workbook.xlsx.writeFile('output.xlsx');
  console.log('✅ Excel file created: output.xlsx');
}

createExcel();
