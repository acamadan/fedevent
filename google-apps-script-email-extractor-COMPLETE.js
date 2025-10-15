/**
 * COMPLETE WORKING VERSION - Restored original architecture with all years
 * Version 10.2 - The Final Fix
 * - FIX: The "Turned Down" parser is now upgraded to understand the new "RFP Turned Down - " subject line format.
 * - This script will now correctly find all TD emails from 2024 and other years.
 * - This is the definitive, production-ready solution.
 */

// --- CONFIGURATION ---
const CONFIG = {
  START_YEAR: 2019,
  END_YEAR: new Date().getFullYear(),
  YOUR_EMAIL_DOMAIN: "creataglobal.com",
  GOOGLE_PLACES_API_KEY: "AIzaSyABdwje_wVZfSJi2fcfZQkxI1WhSJnlM3M" // Your Google Places API key
};

// --- MENU CREATION ---
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const topMenu = ui.createMenu('✅ Email Extractor (v10.2)');
  const spMenu = ui.createMenu('📥 Submitted Proposals (SP)');
  for (let year = CONFIG.END_YEAR; year >= CONFIG.START_YEAR; year--) {
    spMenu.addItem(`Process ${year}`, `runSP_${year}`);
  }
  topMenu.addSubMenu(spMenu);
  const tdMenu = ui.createMenu('📤 Turned Down (TD)');
  for (let year = CONFIG.END_YEAR; year >= CONFIG.START_YEAR; year--) {
    tdMenu.addItem(`Process ${year}`, `runTD_${year}`);
  }
  topMenu.addSubMenu(tdMenu);
  topMenu.addSeparator();
  topMenu.addItem('📊 Check Email Volumes', 'checkEmailVolumes');
  topMenu.addSeparator();
  topMenu.addItem('🗑️ Clear SP Sheet', 'clearSPSheet');
  topMenu.addItem('🗑️ Clear TD Sheet', 'clearTDSheet');
  topMenu.addToUi();
}

// --- DYNAMIC & HELPER FUNCTIONS ---
for (let year = CONFIG.START_YEAR; year <= CONFIG.END_YEAR; year++) {
  this[`runSP_${year}`] = () => runYearExtraction(year, 'submitted proposal', 'SP');
  this[`runTD_${year}`] = () => runYearExtraction(year, 'turned down', 'TD');
}

function clearSPSheet() {
  const sheet = getOrCreateSheet('SP');
  sheet.clear();
  sheet.appendRow(["Email", "Hotel Name", "Contact Name", "Address", "City", "State", "Zip Code", "Country", "Phone", "Priority Level", "Notes", "Month", "Year", "Source Email Link"]);
  SpreadsheetApp.getUi().alert('SP (Submitted Proposals) sheet has been cleared.');
}

function clearTDSheet() {
  const sheet = getOrCreateSheet('TD');
  sheet.clear();
  sheet.appendRow(["Email", "Hotel Name", "Contact Name", "Address", "City", "State", "Zip Code", "Country", "Phone", "Priority Level", "Notes", "Month", "Year", "Source Email Link"]);
  SpreadsheetApp.getUi().alert('TD (Turned Down) sheet has been cleared.');
}

// --- CORE LOGIC ---
function runYearExtraction(year, emailType, sheetPrefix) {
  const ui = SpreadsheetApp.getUi();
  const typeName = emailType.replace(/\b\w/g, l => l.toUpperCase());
  ui.alert(`Processing ${typeName} for ${year}...\nThis may take several minutes.`);
  
  const sheet = getOrCreateSheet(sheetPrefix);
  const existingData = getExistingData(sheet);
  
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const endMonth = (year === CONFIG.END_YEAR) ? new Date().getMonth() : 11;
  
  for (let monthIndex = 0; monthIndex <= endMonth; monthIndex++) {
    const monthName = months[monthIndex];
    const emailCount = checkEmailCount(year, monthIndex, emailType);
    
    if (emailCount > 0) {
      Logger.log(`Processing ${monthName} ${year}: ${emailCount} emails`);
      runExtractionForMonth(year, monthIndex, existingData, emailType, monthName);
    }
  }
  
  writeDataToSheet(existingData, sheet);
  ui.alert(`✅ Complete!\n\n${typeName} for ${year} processed.\nCheck the "${sheetPrefix}" sheet.`);
}

function checkEmailCount(year, monthIndex, emailType) {
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 1);
  const query = `from:noreplycsn@cvent.com "${emailType}" after:${Utilities.formatDate(startDate, "GMT", "yyyy/MM/dd")} before:${Utilities.formatDate(endDate, "GMT", "yyyy/MM/dd")} in:anywhere`;
  try {
    return GmailApp.search(query).length;
  } catch (e) {
    return 0;
  }
}

function runExtractionForMonth(year, monthIndex, existingData, emailType, monthName) {
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 1);
  const baseQuery = `from:noreplycsn@cvent.com "${emailType}" after:${Utilities.formatDate(startDate, "GMT", "yyyy/MM/dd")} before:${Utilities.formatDate(endDate, "GMT", "yyyy/MM/dd")} in:anywhere`;
  
  const threads = GmailApp.search(baseQuery);
  processThreads(threads, existingData, monthName, year);
}

function processThreads(threads, hotelData, monthName, year) {
  threads.forEach(thread => {
    let cventDataFound = false;
    const threadId = thread.getId();
    
    thread.getMessages().forEach(message => {
      if (cventDataFound) return;
      const subject = message.getSubject();
      const body = message.getPlainBody();
      const from = message.getFrom();
      const subjectLower = subject.toLowerCase();

      if (subjectLower.startsWith('re:') || subjectLower.startsWith('fw:')) return;

      let extractedInfo = null;
      if (subjectLower.includes('submitted proposal')) {
        extractedInfo = parseSubmittedProposal(subject, body, from);
      } else if (subjectLower.includes('turned down') || subjectLower.includes('withdrawn') || subjectLower.includes('declined')) {
        extractedInfo = parseTurnedDownOrWithdrawn(subject, body, from);
      }

      if (extractedInfo) {
        updateHotelData(hotelData, extractedInfo, thread.getMessageCount(), threadId, subject, monthName, year);
        cventDataFound = true;
      }
    });
  });
}

// --- CVENT EXPERT PARSERS (CORRECTED) ---
function parseSubmittedProposal(subject, body, from) {
  let hotelName = null, contactName = null, email = null, phone = null;
  const subjectMatch = subject.match(/SUBMITTED PROPOSAL\s*[-–—:]\s*(.+?)\s+submitted a proposal/i);
  if (subjectMatch) hotelName = cleanHotelName(subjectMatch[1].trim());
  
  const highlightsMatch = body.match(/Proposal Highlights[\s\S]*?Contact:\s*([^\n\r]+)[\s\S]*?Email:\s*([^\n\r]+)[\s\S]*?Phone:\s*([^\n\r]+)/i);
  if (highlightsMatch) {
    contactName = highlightsMatch[1].trim();
    email = highlightsMatch[2].trim().toLowerCase();
    phone = highlightsMatch[3].trim();
  } else {
    const emailOnlyMatch = body.match(/Email:\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/i);
    if (emailOnlyMatch) {
      email = emailOnlyMatch[1].toLowerCase();
      const phoneOnlyMatch = body.match(/Phone:\s*([+\d\s().-]{10,})/);
      phone = phoneOnlyMatch ? phoneOnlyMatch[1].trim() : "";
      contactName = parseNameFromEmail(email, from);
    }
  }
  if (!hotelName) hotelName = "Unknown (Cvent Submission)";
  return { email, hotelName, contactName, phone };
}

function parseTurnedDownOrWithdrawn(subject, body, from) {
  let hotelName = null;

  // *** THE CRITICAL FIX IS HERE ***
  // New, more flexible pattern that looks for BOTH old and new formats.
  const subjectMatch = 
    subject.match(/RFP Turned Down\s*[-–—]\s*(.+?)\s+turned down/i) || 
    subject.match(/^(.+?)\s+(won't be able to host|has turned down|has withdrawn)/i);
  
  if (subjectMatch) {
    hotelName = cleanHotelName(subjectMatch[1].trim());
  }
  
  if (!hotelName) hotelName = "Unknown (Cvent Turndown)";
  
  let email = null, contactName = "Unknown", phone = "";
  const reasonMatch = body.match(/(Turndown Reason|Withdrawal Reason)[\s\S]*/i);
  if (reasonMatch) {
    const emailMatch = reasonMatch[0].match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
      email = emailMatch[0].toLowerCase();
      contactName = parseNameFromEmail(email, from);
      const phoneMatch = reasonMatch[0].match(/(?:\+?1\s*)?(?:\(\s*\d{3}\s*\)|\d{3})\s*[.-]?\s*\d{3}\s*[.-]?\s*\d{4}/);
      phone = phoneMatch ? phoneMatch[0].trim() : "";
    }
  }

  if (!email) {
    const placeholderDomain = hotelName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.com';
    email = `no-contact@${placeholderDomain}`;
  }
  
  return { email, hotelName, contactName, phone };
}

// --- ALL OTHER HELPER FUNCTIONS ---
function updateHotelData(hotelData, extractedInfo, communicationCount, threadId, subject, monthName, year) {
  const { email, hotelName, contactName, phone } = extractedInfo;
  if (!email || hotelData.has(email)) return;
  const domain = email.split('@')[1] || '';
  const BLOCKED_DOMAINS = [CONFIG.YOUR_EMAIL_DOMAIN, 'newlandusa.com', 's365.com', 'hotelplanner.com'];
  if (BLOCKED_DOMAINS.includes(domain)) return;
  if (email.endsWith('.gov') || email.endsWith('.mil') || email.endsWith('.edu')) return;
  hotelData.set(email, { email, hotelName, contactName, phone, communicationCount, threadId, subject, monthName, year });
}

function writeDataToSheet(hotelData, sheet) {
  const rows = [];
  hotelData.forEach(contact => {
    const cleanSubject = (contact.subject || 'Email Link').replace(/"/g, '""');
    const linkFormula = `=HYPERLINK("https://mail.google.com/mail/u/0/#inbox/${contact.threadId}", "${cleanSubject}")`;
    rows.push([
      contact.email, contact.hotelName, contact.contactName, "", "", "", "", "USA", contact.phone,
      "normal", "Source: Cvent", contact.monthName, contact.year, linkFormula
    ]);
  });
  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function getExistingData(sheet) {
  const dataMap = new Map();
  if (sheet.getLastRow() < 2) return dataMap;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  values.forEach(row => {
    const email = row[0].toString().toLowerCase().trim();
    if (email) dataMap.set(email, true);
  });
  return dataMap;
}

function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Email", "Hotel Name", "Contact Name", "Address", "City", "State", "Zip Code", "Country", "Phone", "Priority Level", "Notes", "Month", "Year", "Source Email Link"]);
  }
  return sheet;
}

function cleanHotelName(name) {
  if (!name) return "Unknown";
  return name.replace(/<[^>]*>/g, '').replace(/\s*[-–—]\s*$/, '').replace(/\s+$/g, '').replace(/^["']|["']$/g, '').trim();
}

function parseNameFromEmail(email, from) {
  if (!email) return "Unknown";
  const fromName = from ? from.replace(/<.*>/, '').replace(/"/g, '').trim() : '';
  if (fromName && !fromName.includes('@') && !fromName.toLowerCase().includes('cvent')) return fromName;
  const nameFromEmail = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (nameFromEmail && nameFromEmail.length > 2 && !/[^a-zA-Z\s]/.test(nameFromEmail)) return nameFromEmail;
  return "Unknown";
}

function checkEmailVolumes() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Checking email volumes... This may take a few minutes.');
  
  let report = "📊 EMAIL VOLUME REPORT:\n\n";
  const currentYear = new Date().getFullYear();
  
  for (let year = 2019; year <= currentYear; year++) {
    report += `\n📅 YEAR ${year}:\n`;
    const startMonth = (year === 2019) ? 5 : 0;
    
    for (let monthIndex = startMonth; monthIndex < 12; monthIndex++) {
      if (year === currentYear && monthIndex > new Date().getMonth()) break;
      
      const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIndex];
      const spCount = checkEmailCount(year, monthIndex, 'submitted proposal');
      const tdCount = checkEmailCount(year, monthIndex, 'turned down');
      
      if (spCount > 0 || tdCount > 0) {
        const status = (spCount + tdCount) > 500 ? "🔥 BUSY" : "✅ Normal";
        report += `${monthName}: SP=${spCount}, TD=${tdCount} ${status}\n`;
      }
    }
  }
  
  ui.alert(report);
}
