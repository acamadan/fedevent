/**
 * FIXED VERSION - Addresses deduplication and data truncation issues
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('📧 Fixed Email Extractor');
  menu.addItem('Extract TD 2024 (Fixed)', 'extractTD2024Fixed');
  menu.addItem('Extract SP 2024 (Fixed)', 'extractSP2024Fixed');
  menu.addItem('Clear TD Sheet', 'clearTDSheet');
  menu.addItem('Clear SP Sheet', 'clearSPSheet');
  menu.addToUi();
}

function clearTDSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('TD');
  if (!sheet) {
    sheet = ss.insertSheet('TD');
  }
  sheet.clear();
  sheet.appendRow(['Email', 'Hotel Name', 'Contact Name', 'Address', 'City', 'State', 'Zip Code', 'Country', 'Phone', 'Priority Level', 'Notes', 'Month', 'Year', 'Source Email Link']);
  SpreadsheetApp.getUi().alert('TD sheet cleared');
}

function clearSPSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('SP');
  if (!sheet) {
    sheet = ss.insertSheet('SP');
  }
  sheet.clear();
  sheet.appendRow(['Email', 'Hotel Name', 'Contact Name', 'Address', 'City', 'State', 'Zip Code', 'Country', 'Phone', 'Priority Level', 'Notes', 'Month', 'Year', 'Source Email Link']);
  SpreadsheetApp.getUi().alert('SP sheet cleared');
}

function extractTD2024Fixed() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Starting TD 2024 extraction (Fixed version)...');
  
  // Create or get TD sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('TD');
  if (!sheet) {
    sheet = ss.insertSheet('TD');
    sheet.appendRow(['Email', 'Hotel Name', 'Contact Name', 'Address', 'City', 'State', 'Zip Code', 'Country', 'Phone', 'Priority Level', 'Notes', 'Month', 'Year', 'Source Email Link']);
  }
  
  // Search for TD emails in 2024
  const query = 'from:noreplycsn@cvent.com "RFP Turned Down" after:2024/01/01 before:2025/01/01';
  const threads = GmailApp.search(query);
  
  Logger.log(`Found ${threads.length} threads`);
  ui.alert(`Found ${threads.length} TD threads for 2024`);
  
  const rows = [];
  const processedEmails = new Set(); // Track processed emails to avoid duplicates
  
  threads.forEach((thread, index) => {
    const messages = thread.getMessages();
    const firstMessage = messages[0];
    const subject = firstMessage.getSubject();
    const body = firstMessage.getPlainBody();
    
    Logger.log(`Processing ${index + 1}/${threads.length}: ${subject}`);
    
    // Extract hotel name from subject
    let hotelName = 'Unknown Hotel';
    const subjectMatch = subject.match(/RFP Turned Down\s*[-–—]\s*(.+?)(?:\s+turned down|\s*$)/i);
    if (subjectMatch) {
      hotelName = subjectMatch[1].trim();
    }
    
    // Extract email from body
    let email = 'no-contact@' + hotelName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.com';
    const emailMatch = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      email = emailMatch[1].toLowerCase();
    }
    
    // Skip if we've already processed this email
    if (processedEmails.has(email)) {
      Logger.log(`Skipping duplicate email: ${email}`);
      return;
    }
    processedEmails.add(email);
    
    // Extract phone
    let phone = '';
    const phoneMatch = body.match(/(\d{3}-\d{3}-\d{4}|\d{10})/);
    if (phoneMatch) {
      phone = phoneMatch[1];
    }
    
    // Extract contact name from email
    let contactName = 'Unknown';
    if (email !== 'no-contact@' + hotelName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.com') {
      const nameFromEmail = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (nameFromEmail && nameFromEmail.length > 2) {
        contactName = nameFromEmail;
      }
    }
    
    // Create link with full subject
    const link = `=HYPERLINK("https://mail.google.com/mail/u/0/#inbox/${thread.getId()}", "${subject.replace(/"/g, '""')}")`;
    
    rows.push([email, hotelName, contactName, '', '', '', '', 'USA', phone, 'normal', 'Source: Cvent', '2024', '2024', link]);
  });
  
  // Write to sheet
  if (rows.length > 0) {
    // Clear existing data first (except headers)
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    
    // Write all new data
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
    ui.alert(`✅ Successfully added ${rows.length} TD contacts to sheet`);
    Logger.log(`Added ${rows.length} contacts to TD sheet`);
  } else {
    ui.alert('No data to add');
  }
}

function extractSP2024Fixed() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Starting SP 2024 extraction (Fixed version)...');
  
  // Create or get SP sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('SP');
  if (!sheet) {
    sheet = ss.insertSheet('SP');
    sheet.appendRow(['Email', 'Hotel Name', 'Contact Name', 'Address', 'City', 'State', 'Zip Code', 'Country', 'Phone', 'Priority Level', 'Notes', 'Month', 'Year', 'Source Email Link']);
  }
  
  // Search for SP emails in 2024
  const query = 'from:noreplycsn@cvent.com "submitted proposal" after:2024/01/01 before:2025/01/01';
  const threads = GmailApp.search(query);
  
  Logger.log(`Found ${threads.length} threads`);
  ui.alert(`Found ${threads.length} SP threads for 2024`);
  
  const rows = [];
  const processedEmails = new Set(); // Track processed emails to avoid duplicates
  
  threads.forEach((thread, index) => {
    const messages = thread.getMessages();
    const firstMessage = messages[0];
    const subject = firstMessage.getSubject();
    const body = firstMessage.getPlainBody();
    
    Logger.log(`Processing ${index + 1}/${threads.length}: ${subject}`);
    
    // Extract hotel name from subject
    let hotelName = 'Unknown Hotel';
    const subjectMatch = subject.match(/SUBMITTED PROPOSAL\s*[-–—:]\s*(.+?)\s+submitted a proposal/i);
    if (subjectMatch) {
      hotelName = subjectMatch[1].trim();
    }
    
    // Extract email from body
    let email = 'no-contact@' + hotelName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.com';
    const emailMatch = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      email = emailMatch[1].toLowerCase();
    }
    
    // Skip if we've already processed this email
    if (processedEmails.has(email)) {
      Logger.log(`Skipping duplicate email: ${email}`);
      return;
    }
    processedEmails.add(email);
    
    // Extract phone
    let phone = '';
    const phoneMatch = body.match(/(\d{3}-\d{3}-\d{4}|\d{10})/);
    if (phoneMatch) {
      phone = phoneMatch[1];
    }
    
    // Extract contact name from email
    let contactName = 'Unknown';
    if (email !== 'no-contact@' + hotelName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.com') {
      const nameFromEmail = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (nameFromEmail && nameFromEmail.length > 2) {
        contactName = nameFromEmail;
      }
    }
    
    // Create link with full subject
    const link = `=HYPERLINK("https://mail.google.com/mail/u/0/#inbox/${thread.getId()}", "${subject.replace(/"/g, '""')}")`;
    
    rows.push([email, hotelName, contactName, '', '', '', '', 'USA', phone, 'normal', 'Source: Cvent', '2024', '2024', link]);
  });
  
  // Write to sheet
  if (rows.length > 0) {
    // Clear existing data first (except headers)
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    
    // Write all new data
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
    ui.alert(`✅ Successfully added ${rows.length} SP contacts to sheet`);
    Logger.log(`Added ${rows.length} contacts to SP sheet`);
  } else {
    ui.alert('No data to add');
  }
}
