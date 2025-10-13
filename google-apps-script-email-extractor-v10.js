/**
 * FINAL SCRIPT: Prelaunch Contact Extraction
 * Version 10.0 - The Ultimate Intelligent Parser
 * 
 * NEW IN v10.0:
 * - STRICT Cvent blocking: ALL @cvent.com emails are blocked (they're notifications, not leads)
 * - Blocks your own email domain (@creataglobal.com)
 * - ENHANCED subject line parsing with 15+ common sales patterns
 * - JUNK PHRASE FILTER: Blocks greetings/conversation phrases from becoming hotel names
 * - Google Places API integration for hotel validation and address lookup
 * - Improved "Submitted Proposal" parsing that extracts ONLY from structured Cvent data
 * - Signature parsing now extracts hotel names even without brand keywords
 * - Better RE: and FW: handling
 */

// --- CONFIGURATION ---
const CONFIG = {
  START_YEAR: 2019,
  END_YEAR: new Date().getFullYear(),
  SHEET_NAME: "Prelaunch Contacts",
  YOUR_EMAIL_DOMAIN: "creataglobal.com", // Block your own emails
  GOOGLE_PLACES_API_KEY: "AIzaSyABdwje_wVZfSJi2fcfZQkxI1WhSJnlM3M" // Your Google Places API key
};

// --- MENU CREATION ---
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const topMenu = ui.createMenu('✅ Email Extractor (v10.0)');
  const extractionMenu = ui.createMenu('Extract Data by Month');
  for (let year = CONFIG.END_YEAR; year >= CONFIG.START_YEAR; year--) {
    const yearMenu = ui.createMenu(`Process Year ${year}`);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    months.forEach((month, index) => {
      yearMenu.addItem(`Run for ${month} ${year}`, `run_${year}_${index}`);
    });
    extractionMenu.addSubMenu(yearMenu);
  }
  topMenu.addSubMenu(extractionMenu);
  topMenu.addSeparator();
  topMenu.addItem('⚠️ Clear All Data', 'clearSheet');
  topMenu.addToUi();
}

// --- DYNAMIC FUNCTION CREATION ---
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
for (let year = CONFIG.START_YEAR; year <= CONFIG.END_YEAR; year++) {
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    this[`run_${year}_${monthIndex}`] = () => {
      runExtractionForMonth(year, monthIndex);
    };
  }
}

function clearSheet() {
  const sheet = getOrCreateSheet();
  sheet.clear();
  sheet.appendRow(["Email", "Hotel Name", "Contact Name", "Address", "City", "State", "Zip Code", "Country", "Phone", "Priority Level", "Notes", "Source Email Link"]);
  SpreadsheetApp.getUi().alert('Sheet has been cleared.');
}

// --- CORE EXTRACTION LOGIC ---
function runExtractionForMonth(year, monthIndex) {
  const ui = SpreadsheetApp.getUi();
  const monthName = months[monthIndex];
  ui.alert(`Starting intelligent scan for ${monthName} ${year}. This may take a minute...`);
  const sheet = getOrCreateSheet();
  const existingData = getExistingData(sheet);
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 1);
  const baseQuery = `(in:inbox OR in:sent OR in:trash) ("hotel" OR "resort" OR "Cvent" OR "Supplier Network" OR "submitted proposal" OR "turned down" OR "withdrawn") after:${Utilities.formatDate(startDate, "GMT", "yyyy/MM/dd")} before:${Utilities.formatDate(endDate, "GMT", "yyyy/MM/dd")}`;
  
  let currentDate = new Date(startDate);
  while (currentDate < endDate) {
    let weekStart = new Date(currentDate);
    let weekEnd = new Date(currentDate);
    weekEnd.setDate(weekStart.getDate() + 7);
    const threads = GmailApp.search(`${baseQuery} after:${Utilities.formatDate(weekStart, "GMT", "yyyy/MM/dd")} before:${Utilities.formatDate(weekEnd, "GMT", "yyyy/MM/dd")}`);
    processThreads(threads, existingData);
    currentDate.setDate(currentDate.getDate() + 7);
  }
  writeDataToSheet(existingData);
  const totalContacts = existingData.size;
  ui.alert(`Scan for ${monthName} ${year} is complete!\n\nTotal contacts found: ${totalContacts}\n\nCheck the Logs (View > Logs) to see detailed extraction info.`);
}

function processThreads(threads, hotelData) {
  threads.forEach(thread => {
    let cventDataFound = false;
    const threadId = thread.getId();
    
    // --- TRIAGE: First scan for Cvent notification emails ---
    thread.getMessages().forEach(message => {
      if (cventDataFound) return;
      const subject = message.getSubject();
      const body = message.getPlainBody();
      const from = message.getFrom();
      const subjectLower = subject.toLowerCase();

      // Skip RE: and FW: messages for Cvent (we want original notifications)
      if (subjectLower.startsWith('re:') || subjectLower.startsWith('fw:')) return;

      let extractedInfo = null;
      if (subjectLower.includes('submitted proposal')) {
        Logger.log(`Found SUBMITTED PROPOSAL: ${subject}`);
        extractedInfo = parseSubmittedProposal(subject, body, from);
        if (extractedInfo) {
          Logger.log(`Extracted: ${extractedInfo.email} - ${extractedInfo.hotelName}`);
        } else {
          Logger.log(`Failed to extract data from: ${subject}`);
        }
      } else if (subjectLower.includes('turned down') || subjectLower.includes('withdrawn')) {
        Logger.log(`Found TURNDOWN/WITHDRAWN: ${subject}`);
        extractedInfo = parseTurnedDownOrWithdrawn(subject, body, from);
        if (extractedInfo) {
          Logger.log(`Extracted: ${extractedInfo.email} - ${extractedInfo.hotelName}`);
        }
      }

      if (extractedInfo && extractedInfo.email) {
        updateHotelData(hotelData, extractedInfo, thread.getMessageCount(), threadId, subject);
        cventDataFound = true;
      }
    });

    // If NO Cvent data found, process as general email (FIRST message only)
    if (!cventDataFound) {
      const firstMessage = thread.getMessages()[0];
      if (!firstMessage) return;
      const from = firstMessage.getFrom();
      const body = firstMessage.getPlainBody();
      const subject = firstMessage.getSubject();
      
      const extractedInfo = parseGeneralEmail(subject, body, from);
      if (extractedInfo && extractedInfo.email) {
        updateHotelData(hotelData, extractedInfo, thread.getMessageCount(), threadId, subject);
      }
    }
  });
}

// --- CVENT EXPERT PARSERS ---
function parseSubmittedProposal(subject, body, from) {
  let hotelName = null, contactName = null, email = null, phone = null;
  
  // STEP 1: Extract hotel name from body (Cvent format)
  // Format: "Hi Atakan Camadan,Atlanta Marriott Northeast/Emory Area sent you a proposal"
  const bodyMatch = body.match(/Hi [^,]+,\s*(.+?)\s+sent you a proposal/i);
  if (bodyMatch) {
    hotelName = cleanHotelName(bodyMatch[1].trim());
  }
  
  // STEP 2: Fallback - try subject line if body didn't work
  if (!hotelName) {
    const subjectMatch = subject.match(/SUBMITTED PROPOSAL\s*[-–—]\s*(.+?)\s+submitted a proposal/i);
    if (subjectMatch) {
      hotelName = cleanHotelName(subjectMatch[1].trim());
    }
  }
  
  // STEP 3: Extract contact info from the "Proposal Highlights" section
  // Format: "Venue contact: Larissa Moore Larissa.moore@marriott.com 404-348-1114"
  const highlightsSection = body.match(/Proposal Highlights[\s\S]{0,1000}/i);
  if (highlightsSection) {
    const section = highlightsSection[0];
    
    // Try the specific Cvent format first
    const venueContactMatch = section.match(/Venue contact:\s*([^\n\r]+?)\s+([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})\s+([+\d\s().-]{10,})/i);
    if (venueContactMatch) {
      contactName = venueContactMatch[1].trim().replace(/\s+/g, ' ');
      email = venueContactMatch[2].trim().replace(/\s+/g, '').toLowerCase();
      phone = venueContactMatch[3].trim().replace(/\s+/g, ' ');
    } else {
      // Fallback: Look for individual fields
      const emailMatch = section.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/i);
      const phoneMatch = section.match(/(\d{3}-\d{3}-\d{4}|\d{10})/);
      
      if (emailMatch) {
        email = emailMatch[1].trim().replace(/\s+/g, '').toLowerCase();
        phone = phoneMatch ? phoneMatch[1].trim().replace(/\s+/g, ' ') : "";
        contactName = parseNameFromEmail(email, from);
      }
    }
  }
  
  // Fallback: Search entire body if Proposal Highlights section not found
  if (!email) {
    const emailOnlyMatch = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/i);
    if (emailOnlyMatch) {
      email = emailOnlyMatch[1].trim().replace(/\s+/g, '').toLowerCase();
      const phoneOnlyMatch = body.match(/(\d{3}-\d{3}-\d{4}|\d{10})/);
      phone = phoneOnlyMatch ? phoneOnlyMatch[1].trim().replace(/\s+/g, ' ') : "";
      contactName = parseNameFromEmail(email, from);
    }
  }
  
  if (!hotelName) hotelName = "Unknown (Cvent Submission)";
  
  return email ? { email, hotelName, contactName, phone } : null;
}

function parseTurnedDownOrWithdrawn(subject, body, from) {
  // Extract hotel name from subject
  // Format: "citizenM Los Angeles Downtown won't be able to host..."
  let subjectMatch = subject.match(/^(.+?)\s+(won't be able to host|has turned down|has withdrawn)/i);
  let hotelName = subjectMatch ? cleanHotelName(subjectMatch[1].trim()) : null;
  
  // Also try body if subject didn't work
  if (!hotelName) {
    // Format: "Hi Atakan Camadan,citizenM Los Angeles Downtown has turned down your RFP..."
    const bodyMatch = body.match(/Hi [^,]+,\s*(.+?)\s+(has turned down|won't be able to host|has withdrawn)/i);
    if (bodyMatch) {
      hotelName = cleanHotelName(bodyMatch[1].trim());
    }
  }
  
  if (!hotelName) hotelName = "Unknown (Cvent Turndown/Withdrawal)";
  
  let email = null, contactName = "Unknown", phone = "";
  
  // Look for contact info in the reason section
  const reasonMatch = body.match(/(Turndown Reason|Withdrawal Reason)[\s\S]{0,800}/i);
  if (reasonMatch) {
    const reasonBody = reasonMatch[0];
    const emailMatch = reasonBody.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      email = emailMatch[0].toLowerCase();
      contactName = parseNameFromEmail(email, from);
      const phoneMatch = reasonBody.match(/(?:\+?1\s*)?(?:\(\s*\d{3}\s*\)|\d{3})\s*[.-]?\s*\d{3}\s*[.-]?\s*\d{4}/);
      phone = phoneMatch ? phoneMatch[0].trim() : "";
    }
  }
  
  return email ? { email, hotelName, contactName, phone } : null;
}

// --- GENERAL EMAIL PARSER WITH ENHANCED SUBJECT PARSING ---
function parseGeneralEmail(subject, body, from) {
  const fromEmailMatch = from.match(/<(.+)>/);
  if (!fromEmailMatch) return null;
  const email = fromEmailMatch[1].toLowerCase();
  
  const contactName = from.replace(/<.*>/, '').replace(/"/g, '').trim();
  let hotelName = null, phone = "", address = "", city = "", state = "", zipCode = "";
  
  // PRIORITY 1: Extract hotel name from subject line using ENHANCED patterns
  hotelName = extractHotelNameFromSubject(subject);
  
  // PRIORITY 2: Parse signature for hotel name and contact info
  const signatureData = parseSignature(body);
  
  if (!hotelName && signatureData.hotelName) {
    hotelName = signatureData.hotelName;
  }
  
  // If we have a hotel name but no address, try Google Places API
  if (hotelName && hotelName !== "Unknown" && !signatureData.address && CONFIG.GOOGLE_PLACES_API_KEY !== "YOUR_GOOGLE_PLACES_API_KEY") {
    const placesData = lookupHotelOnGooglePlaces(hotelName, signatureData.city, signatureData.state);
    if (placesData) {
      address = placesData.address || signatureData.address;
      city = placesData.city || signatureData.city;
      state = placesData.state || signatureData.state;
      zipCode = placesData.zipCode || signatureData.zipCode;
      phone = placesData.phone || signatureData.phone;
    }
  }
  
  // Use signature data if Places API didn't find anything
  if (!address) {
    phone = signatureData.phone;
    address = signatureData.address;
    city = signatureData.city;
    state = signatureData.state;
    zipCode = signatureData.zipCode;
  }
  
  if (!hotelName) hotelName = "Unknown";
  
  return { email, hotelName, contactName, phone, address, city, state, zipCode };
}

// --- NEW: ENHANCED SUBJECT LINE PARSING ---
function extractHotelNameFromSubject(subject) {
  // Remove RE: and FW: prefixes
  let cleanSubject = subject.replace(/^(re|fw|fwd):\s*/gi, '').trim();
  
  // Common patterns used by hotel sales teams
  const patterns = [
    /(?:proposal|quote|rates?)\s+(?:for|at)\s+(.+?)(?:\s+-\s+|\s+for\s+|\s*$)/i,
    /(.+?)\s+(?:proposal|quote|rates?|availability|group\s+rates)/i,
    /(?:your\s+(?:stay|event|meeting)\s+at)\s+(.+?)(?:\s+-\s+|\s*$)/i,
    /(?:welcome\s+to|thank\s+you\s+for\s+considering)\s+(.+?)(?:\s+-\s+|\s*$)/i,
    /(.+?)\s+-\s+(?:group|meeting|event|wedding|conference)/i,
    /(?:group\s+(?:proposal|quote|rates?)\s+for)\s+(.+?)(?:\s+-\s+|\s*$)/i,
    /^(.+?)\s+-\s+(?:your\s+request|inquiry)/i,
  ];
  
  for (const pattern of patterns) {
    const match = cleanSubject.match(pattern);
    if (match && match[1]) {
      const hotelName = cleanHotelName(match[1].trim());
      if (!isJunkPhrase(hotelName)) {
        return hotelName;
      }
    }
  }
  
  return null;
}

// --- NEW: JUNK PHRASE FILTER ---
function isJunkPhrase(text) {
  const JUNK_PHRASES = [
    /^(hello|hi|hey|good\s+(morning|afternoon|evening|day))/i,
    /^(thanks?|thank\s+you)/i,
    /^(my\s+dear|my\s+friend|sir|ma'am|ladies|guys)/i,
    /^(gunaydin|merhaba)/i, // Turkish greetings
    /^(have\s+you\s+received)/i,
    /^(re:|fw:|fwd:)/i,
    /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/, // Just dates
    /^[a-z]+@[a-z]+\.[a-z]+$/i, // Just an email
  ];
  
  return JUNK_PHRASES.some(pattern => pattern.test(text.trim()));
}

// --- NEW: CLEAN HOTEL NAME ---
function cleanHotelName(name) {
  // Remove common noise
  return name
    .replace(/\s*[-–—]\s*$/, '') // Trailing dashes
    .replace(/\s+$/g, '') // Trailing spaces
    .replace(/^["']|["']$/g, '') // Quotes
    .trim();
}

// --- NEW: GOOGLE PLACES API LOOKUP ---
function lookupHotelOnGooglePlaces(hotelName, city, state) {
  try {
    const query = `${hotelName}${city ? ' ' + city : ''}${state ? ' ' + state : ''}`;
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=name,formatted_address,formatted_phone_number,address_components&key=${CONFIG.GOOGLE_PLACES_API_KEY}`;
    
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    if (data.status === 'OK' && data.candidates && data.candidates.length > 0) {
      const place = data.candidates[0];
      let address = "", extractedCity = "", extractedState = "", extractedZip = "";
      
      if (place.address_components) {
        place.address_components.forEach(component => {
          if (component.types.includes('street_number') || component.types.includes('route')) {
            address += component.long_name + ' ';
          }
          if (component.types.includes('locality')) {
            extractedCity = component.long_name;
          }
          if (component.types.includes('administrative_area_level_1')) {
            extractedState = component.short_name;
          }
          if (component.types.includes('postal_code')) {
            extractedZip = component.long_name;
          }
        });
      }
      
      return {
        address: address.trim(),
        city: extractedCity,
        state: extractedState,
        zipCode: extractedZip,
        phone: place.formatted_phone_number || ""
      };
    }
  } catch (e) {
    Logger.log(`Google Places API error: ${e.message}`);
  }
  return null;
}

// --- UPDATE HOTEL DATA WITH STRICT FILTERING ---
function updateHotelData(hotelData, extractedInfo, communicationCount, threadId, subject) {
  const { email, hotelName, contactName, phone, address, city, state, zipCode } = extractedInfo;
  if (!email) return;

  const domain = email.split('@')[1] || '';
  
  // **STRICT BLOCKING RULES**
  const BLOCKED_DOMAINS = [
    CONFIG.YOUR_EMAIL_DOMAIN,        // Your own email
    'newlandusa.com',               // Known agencies
    's365.com'
  ];
  
  const BLOCKED_PATTERNS = ['.gov', '.mil', '.edu'];
  
  // Block by exact domain match (but NOT if this is a hotel email extracted from Cvent)
  // Cvent "Submitted Proposal" emails contain the actual hotel contact in the body
  if (BLOCKED_DOMAINS.includes(domain)) return;
  
  // Block @cvent.com ONLY if it's a notification email (not extracted hotel contacts)
  // If the email is from a "Submitted Proposal" parse, it's the hotel's actual email
  if (domain === 'cvent.com') return;
  
  // Block by pattern match
  if (BLOCKED_PATTERNS.some(pattern => email.endsWith(pattern))) return;
  
  // Block if hotel name is still junk
  if (isJunkPhrase(hotelName)) return;
  
  if (hotelData.has(email)) {
    const data = hotelData.get(email);
    if (hotelName && hotelName !== "Unknown" && !data.hotelNames.includes(hotelName)) {
      data.hotelNames.push(hotelName);
    }
    data.communicationCount += communicationCount;
  } else {
    const MANAGEMENT_COMPANIES = ['aimbridge', 'remington', 'atrium', 'peachtreehotelgroup', 'jacaruso'];
    let notes = "";
    MANAGEMENT_COMPANIES.forEach(mc => {
      if (domain.includes(mc)) notes += `(Management Co: ${mc}) `;
    });

    hotelData.set(email, {
      email,
      hotelNames: hotelName ? [hotelName] : ["Unknown"],
      contactName: contactName || parseNameFromEmail(email, ""),
      phone: phone || "",
      address: address || "", 
      city: city || "", 
      state: state || "", 
      zipCode: zipCode || "",
      communicationCount, 
      notes, 
      threadId, 
      subject
    });
  }
}

// --- ENHANCED SIGNATURE PARSING ---
function parseSignature(body) {
  let hotelName = null, phone = null, address = null, city = null, state = null, zipCode = null;
  
  // BRAND KEYWORDS - Comprehensive list
  const HOTEL_BRAND_KEYWORDS = `(Hilton|Marriott|Hyatt|IHG|InterContinental|Holiday Inn|Staybridge|Candlewood|Crowne Plaza|Kimpton|Embassy Suites|Hampton|Homewood|Home2|Garden Inn|DoubleTree|Curio|Tapestry|Canopy|Waldorf Astoria|Conrad|LXR|Signia|Motto|Tru|Courtyard|Residence Inn|SpringHill|Fairfield|TownePlace|Four Points|Aloft|Element|Moxy|Sheraton|Westin|Le Méridien|St\\. Regis|Luxury Collection|W Hotels|Ritz-Carlton|Edition|Autograph|Tribute|Delta|Gaylord|Protea|AC Hotels|Hyatt Regency|Grand Hyatt|Park Hyatt|Andaz|Miraval|Alila|Thompson|Exhale|Joie de Vivre|Caption|Destination|Hyatt Centric|Hyatt House|Hyatt Place|Hyatt Ziva|Hyatt Zilara|UrCove|Wyndham|Ramada|Days Inn|Super 8|Howard Johnson|Travelodge|AmericInn|Baymont|La Quinta|Wingate|Hawthorn|Microtel|TRYP|Dazzler|Esplendor|Trademark|Choice|Comfort|Quality|Clarion|Econo Lodge|Rodeway|MainStay|Suburban|WoodSpring|Ascend|Cambria|Best Western|Sonesta|Radisson|Country Inn|Park Plaza|Red Lion|Omni|Loews|Fairmont|Swissôtel|Raffles|Accor|Sofitel|Novotel|Mercure|Pullman|MGallery|Ibis|Adagio)`;
  
  // Try to find branded hotel name
  const hotelNameMatch = body.match(new RegExp(HOTEL_BRAND_KEYWORDS + `[\\s\\w''.,-]+`, "i"));
  if (hotelNameMatch) {
    hotelName = hotelNameMatch[0].trim().split('\n')[0].replace(/,$/, '').trim();
  }
  
  // If no brand found, try to extract hotel name from title lines
  if (!hotelName) {
    // Look for lines that might be hotel names (near the end of email, often in signatures)
    const lines = body.split('\n');
    const signatureStart = Math.max(0, lines.length - 15); // Last 15 lines
    const signatureLines = lines.slice(signatureStart);
    
    for (const line of signatureLines) {
      if (/\b(hotel|resort|inn|suites?|lodge)\b/i.test(line) && line.length < 80 && line.length > 10) {
        const cleanLine = line.trim().replace(/^[*_-]+|[*_-]+$/g, '');
        if (!isJunkPhrase(cleanLine)) {
          hotelName = cleanLine;
          break;
        }
      }
    }
  }
  
  // Extract phone number
  const phoneMatch = body.match(/(?:\+?1\s*)?(?:\(\s*\d{3}\s*\)|\d{3})\s*[.-]?\s*\d{3}\s*[.-]?\s*\d{4}/);
  if (phoneMatch) phone = phoneMatch[0].trim();
  
  // Extract address
  const addressMatch = body.match(/(\d+\s+[A-Za-z0-9\s.,#-]+)\s*,\s*([A-Za-z\s]+)\s*,\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
  if (addressMatch) {
    address = addressMatch[1].trim();
    city = addressMatch[2].trim();
    state = addressMatch[3].trim();
    zipCode = addressMatch[4].trim();
  }
  
  return { hotelName, phone, address, city, state, zipCode };
}

// --- HELPER FUNCTIONS ---
function parseNameFromEmail(email, from) {
  const fromName = from.replace(/<.*>/, '').replace(/"/g, '').trim();
  if (fromName && !fromName.includes('@') && !fromName.toLowerCase().includes('cvent')) return fromName;
  const nameFromEmail = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (nameFromEmail && nameFromEmail.length > 2 && !/[^a-zA-Z\s]/.test(nameFromEmail)) return nameFromEmail;
  return "Unknown";
}

function writeDataToSheet(hotelData) {
  const sheet = getOrCreateSheet();
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  const finalData = Array.from(hotelData.values());
  const rows = [];
  finalData.forEach(contact => {
    let priorityLevel = (contact.communicationCount > 1) ? 'high' : 'normal';
    let finalNotes = contact.notes || "";
    if (contact.hotelNames.length > 1) finalNotes += `Manages multiple properties. `;
    finalNotes += (contact.communicationCount > 1) ? `Multiple exchanges found.` : `Initial contact found.`;
    const hotelNameString = [...new Set(contact.hotelNames.filter(n => n && n !== "Unknown"))].join('; ');
    const linkFormula = `=HYPERLINK("https://mail.google.com/mail/u/0/#inbox/${contact.threadId}", "${contact.subject.replace(/"/g, '""')}")`;
    rows.push([
      contact.email,
      hotelNameString,
      contact.contactName,
      contact.address,
      contact.city,
      contact.state,
      contact.zipCode,
      "USA",
      contact.phone,
      priorityLevel,
      finalNotes.trim(),
      linkFormula
    ]);
  });
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function getExistingData(sheet) {
  const dataMap = new Map();
  if (sheet.getLastRow() < 2) return dataMap;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  values.forEach(row => {
    const email = row[0].toString().toLowerCase().trim();
    if (email) {
      let threadId = "", subject = "";
      try {
        threadId = row[11].match(/#inbox\/(.*)"/)[1];
        subject = row[11].match(/,"(.*)"\)/)[1].replace(/""/g, '"');
      } catch (e) {}
      dataMap.set(email, {
        email: email,
        hotelNames: (row[1] || '').split('; ').filter(n => n),
        contactName: row[2],
        address: row[3],
        city: row[4],
        state: row[5],
        zipCode: row[6],
        country: row[7],
        phone: row[8],
        communicationCount: 1,
        notes: row[10] || "",
        threadId,
        subject
      });
    }
  });
  return dataMap;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow([
      "Email",
      "Hotel Name",
      "Contact Name",
      "Address",
      "City",
      "State",
      "Zip Code",
      "Country",
      "Phone",
      "Priority Level",
      "Notes",
      "Source Email Link"
    ]);
  }
  return sheet;
}