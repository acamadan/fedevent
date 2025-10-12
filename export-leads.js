#!/usr/bin/env node
/**
 * Export hotel leads to CSV file
 */

import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('./data/creata.db');

try {
  const leads = db.prepare(`
    SELECT 
      user_code,
      hotel_name,
      city,
      state,
      contact_name,
      title,
      email,
      phone,
      interests,
      datetime(created_at, 'localtime') as submitted_at,
      CASE WHEN notified = 1 THEN 'Yes' ELSE 'No' END as email_sent
    FROM hotel_leads 
    ORDER BY created_at DESC
  `).all();

  if (leads.length === 0) {
    console.log('📭 No leads to export yet.');
    process.exit(0);
  }

  // Create CSV
  const headers = Object.keys(leads[0]);
  const csv = [
    headers.join(','),
    ...leads.map(lead => 
      headers.map(h => {
        const value = lead[h] || '';
        // Escape commas and quotes
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');

  // Save to file with timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `hotel-leads-${timestamp}.csv`;
  
  fs.writeFileSync(filename, csv);
  
  console.log('✅ Export successful!');
  console.log(`📄 File: ${filename}`);
  console.log(`📊 Records: ${leads.length}`);
  console.log(`\n💡 Open in Excel, Google Sheets, or any spreadsheet app.`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

db.close();

