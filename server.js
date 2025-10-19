import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import nodemailer from 'nodemailer';
// Lazy load heavy libraries to improve startup time
// import mammoth from 'mammoth';
// import unzipper from 'unzipper';
// import * as pdfjsLib from 'pdfjs-dist';
// import Tesseract from 'tesseract.js';
// import OpenAI from 'openai';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
// guessFields will be imported dynamically in the autofill endpoint
import { spawnSync } from 'child_process';
import { rotateLogs } from './scripts/log-rotation.js';
import QRCode from 'qrcode';
// QuickBooks integration available but using payment link for now
// import OAuthClient from 'intuit-oauth';
// import QuickBooks from 'node-quickbooks';

// Startup logging
console.log('CWD:', process.cwd());
console.log('SAM key prefix:', (process.env.SAM_API_KEY || '').slice(0, 12) + '…');

const fsp = fs.promises;

// ---------- shell helpers / OCR pipeline ----------
function hasBin(cmd) {
  return spawnSync('which', [cmd]).status === 0;
}
function run(cmd, args, opts = {}) {
  const p = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (p.status !== 0) throw new Error(`${cmd} failed: ${p.stderr || p.stdout}`);
  return p.stdout || '';
}
async function ocrPdfText(pdfPath) {
  if (hasBin('ocrmypdf')) {
    const outPdf  = pdfPath.replace(/\.pdf$/i, `.ocr.${Date.now()}.pdf`);
    const sidecar = pdfPath.replace(/\.pdf$/i, `.txt.${Date.now()}.txt`);
    try {
      run('ocrmypdf', ['--force-ocr', '--sidecar', sidecar, '--quiet', pdfPath, outPdf]);
      const txt = fs.readFileSync(sidecar, 'utf8');
      if (txt && txt.trim()) return txt;
    } catch (_) {
      // fall through to fallback
    }
  }
  // If system tools present, use them
  if (hasBin('pdftoppm') && hasBin('tesseract')) {
    const tmpDir = fs.mkdtempSync(path.join(path.dirname(pdfPath), 'ocr-'));
    const prefix = path.join(tmpDir, 'page');
    run('pdftoppm', ['-r', '300', '-png', pdfPath, prefix]);
    const pages = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
    let all = '';
    for (const f of pages) {
      const p = path.join(tmpDir, f);
      all += run('tesseract', [p, 'stdout', '-l', 'eng']);
      all += '\n';
    }
    return all.trim();
  }

  // Pure JS fallback using pdfjs + canvas + tesseract.js (lazy loaded)
  try {
    const pdfjsLib = await import('pdfjs-dist');
    const Tesseract = await import('tesseract.js');
    const { createCanvas } = await import('canvas');
    
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    let all = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      const renderContext = { canvasContext: ctx, viewport };
      await page.render(renderContext).promise;
      const pngBuffer = canvas.toBuffer('image/png');
      const { data: ocr } = await Tesseract.recognize(pngBuffer, 'eng');
      all += (ocr && ocr.text) ? ocr.text + '\n' : '';
    }
    return all.trim();
  } catch (error) {
    console.log('OCR fallback failed:', error.message);
    return '';
  }
}
async function ocrImageText(imgPath) {
  if (!hasBin('tesseract')) throw new Error('tesseract not found');
  return run('tesseract', [imgPath, 'stdout', '-l', 'eng']);
}
function extOf(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

// ---------- PDF to PNG conversion for hybrid OCR ----------
async function convertPdfToPngPages(pdfPath) {
  try {
    // Try using system tools first (faster)
    if (hasBin('pdftoppm')) {
      const tmpDir = fs.mkdtempSync(path.join(path.dirname(pdfPath), 'pdf2png-'));
      const prefix = path.join(tmpDir, 'page');
      run('pdftoppm', ['-r', '300', '-png', pdfPath, prefix]);
      
      const pages = fs.readdirSync(tmpDir)
        .filter(f => f.startsWith('page') && f.endsWith('.png'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map(f => path.join(tmpDir, f));
      
      return pages;
    }
  } catch (e) {
    console.log('System pdftoppm failed, trying pure JS approach:', e.message);
  }

  // Fallback to pure JavaScript approach using pdf-lib and sharp
  try {
    const { PDFDocument } = await import('pdf-lib');
    const sharp = (await import('sharp')).default;
    const pdfjsLib = await import('pdfjs-dist');
    const { createCanvas } = await import('canvas');
    
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    const pageImages = [];
    const tmpDir = fs.mkdtempSync(path.join(path.dirname(pdfPath), 'pdf2png-'));
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      const renderContext = { canvasContext: ctx, viewport };
      await page.render(renderContext).promise;
      
      const pngBuffer = canvas.toBuffer('image/png');
      const outPath = path.join(tmpDir, `page_${pageNum}.png`);
      
      // Optionally enhance with sharp for better OCR
      await sharp(pngBuffer)
        .greyscale()
        .normalize()
        .toFile(outPath);
      
      pageImages.push(outPath);
    }
    
    return pageImages;
  } catch (error) {
    console.error('PDF to PNG conversion failed:', error.message);
    throw new Error('Failed to convert PDF to images: ' + error.message);
  }
}
function stripXml(xml) {
  return xml
    .replace(/<a:t[^>]*>(.*?)<\/a:t>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
async function pptxText(pptxPath) {
  const chunks = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(pptxPath)
      .pipe(unzipper.Parse())
      .on('entry', (e) => {
        const n = e.path;
        if (/^ppt\/slides\/slide\d+\.xml$/.test(n)) {
          let data = '';
          e.on('data', (d) => (data += d.toString('utf8')));
          e.on('end', () => chunks.push(stripXml(data)));
          e.autodrain();
        } else {
          e.autodrain();
        }
      })
      .on('error', reject)
      .on('close', resolve);
  });
  return chunks.join('\n');
}

// ---------- text normalize + parsing ----------
function normalizeText(t) {
  if (!t) return '';
  return String(t)
    .replace(/\r/g, '\n')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(/[·•▪◦●]/g, '•')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
function kvParse(text) {
  const fields = {};
  normalizeFields(fields);
  if (!text) return fields;

  const raw = String(text);
  const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();

  // Canonical -> synonyms
  const LABELS = [
    ['hotel_name',         ['hotel name','property name','name','hotel']],
    ['brand',              ['brand','flag','chain']],
    ['chain_code',         ['chain code','gds chain code','chaincode']],
    ['hotel_code',         ['hotel code','property code','property id','hotel id']],
    ['iata_code',          ['iata','iata code']],

    ['address',            ['address','street address','address line 1']],
    ['address2',           ['address 2','address line 2','suite','unit']],
    ['city',               ['city','town','locality']],
    ['state',              ['state','province','region','county']],
    ['postal_code',        ['zip','zip code','postal code','postcode']],
    ['country',            ['country']],

    ['website',            ['website','web site','url']],
    ['email',              ['email','e-mail','contact email','reservations email','sales email']],
    ['phone',              ['phone','telephone','tel','reservations phone','main phone']],
    ['fax',                ['fax']],

    ['check_in_time',      ['check in','check-in','check in time']],
    ['check_out_time',     ['check out','check-out','check out time']],

    ['rooms_total',        ['total rooms','guest rooms','guestrooms','rooms total','number of rooms','keys','accommodations']],
    ['suites',             ['suites','number of suites']],
    ['king_rooms',         ['king rooms','kings']],
    ['double_double_rooms',['double double rooms','double/double','two double rooms','queens','double rooms']],

    ['meeting_space_sqft', ['total meeting space','meeting space','function space','event space','total function space','meeting space (sq ft)','meeting space sqft','meeting space square feet','total event space']],
    ['largest_room_sqft',  ['largest room','largest meeting room','largest space','largest ballroom','largest venue']],
    ['largest_room_capacity',['largest room capacity','largest capacity','max capacity','maximum capacity']],
    ['ballroom_sqft',      ['ballroom','grand ballroom','ballroom size','ballroom sqft']],
    ['number_of_meeting_rooms',['meeting rooms','# of meeting rooms','number of meeting rooms','meeting venues','breakout rooms']]
  ];

  // Build label index
  const index = new Map();
  for (const [canon, syns] of LABELS) for (const s of syns) index.set(norm(s), canon);

  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // A) Labeled lines: "Label: value" or "Label - value"
  for (const ln of lines) {
    const m = ln.match(/^(.{2,80}?)[\s]*[:\-–—|]\s*(.+)$/);
    if (!m) continue;
    const label = norm(m[1]);
    const value = m[2].trim();
    for (const [syn, canon] of index.entries()) {
      if (label === syn || label.endsWith(` ${syn}`)) {
        if (!fields[canon]) fields[canon] = value;
      }
    }
  }

  // B) Label on one line, value on the next line
  for (let i = 0; i < lines.length - 1; i++) {
    const canon = index.get(norm(lines[i]));
    if (canon && !fields[canon] && !/[:\-–—|]$/.test(lines[i])) {
      const maybe = lines[i+1].trim();
      if (maybe && !index.has(norm(maybe))) fields[canon] = maybe;
    }
  }

  // C) Free-form patterns common in brochures
  const setIfEmpty = (k, v) => { if (v && !fields[k]) fields[k] = v; };

  // Total meeting space
  setIfEmpty('meeting_space_sqft',
    (raw.match(/\b(?:total\s+)?(?:meeting|event|function)\s*(?:space|area)\s*(?:of\s*)?[:\-]?\s*([\d,]+)\s*(?:sq\.?\s*ft|sf|square\s*feet)\b/i)?.[1]) ||
    (raw.match(/\b([\d,]+)\s*(?:sq\.?\s*ft|sf)\b[^.\n]{0,40}\b(?:meeting|event|function)\s*(?:space|area)\b/i)?.[1])
  );

  // # of meeting rooms (various phrasings)
  setIfEmpty('number_of_meeting_rooms',
    (raw.match(/\b(\d{1,3})\s+(?:meeting|breakout)\s+rooms?\b/i)?.[1]) ||
    (raw.match(/\b(?:meeting|breakout)\s+rooms?\s*[:\-]?\s*(\d{1,3})\b/i)?.[1])
  );

  // Ballroom sqft (capture the number close to 'ballroom')
  setIfEmpty('ballroom_sqft',
    (raw.match(/\bballroom\b[^0-9]{0,30}([\d,]+)\s*(?:sq\.?\s*ft|sf)\b/i)?.[1])
  );

  // Largest room sqft / capacity
  setIfEmpty('largest_room_sqft',
    (raw.match(/\blargest\b[^0-9]{0,30}([\d,]+)\s*(?:sq\.?\s*ft|sf)\b/i)?.[1])
  );
  setIfEmpty('largest_room_capacity',
    (raw.match(/\blargest\b[^0-9]{0,30}(\d{2,4})\s*(?:guests?|people|pax|capacity)\b/i)?.[1]) ||
    (raw.match(/\bmaximum\s+capacity\s*[:\-]?\s*(\d{2,4})\b/i)?.[1])
  );

  // Rooms totals in narrative ("X guest rooms/keys")
  setIfEmpty('rooms_total',
    (raw.match(/\b(\d{2,4})\s+(?:guest\s*rooms?|rooms|keys)\b/i)?.[1]) ||
    (raw.match(/\b(?:rooms?|guest\s*rooms?|keys)\s*[:\-]?\s*(\d{2,4})\b/i)?.[1])
  );

  // Suites / kings / doubles in narrative
  setIfEmpty('suites', (raw.match(/\b(\d{1,3})\s+suites?\b/i)?.[1]));
  setIfEmpty('king_rooms', (raw.match(/\b(\d{1,3})\s+king(?:\s+rooms?)?\b/i)?.[1]));
  setIfEmpty('double_double_rooms',
    (raw.match(/\b(\d{1,3})\s+(?:double\/double|double\s*double|queen(?:s)?|double(?:s)?)(?:\s+rooms?)?\b/i)?.[1])
  );

  // Check-in / check-out
  setIfEmpty('check_in_time',  (raw.match(/\bcheck[\s-]?in\b[^0-9]{0,10}(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)?.[1]));
  setIfEmpty('check_out_time', (raw.match(/\bcheck[\s-]?out\b[^0-9]{0,10}(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)?.[1]));

  // Email / phone / website if not labeled
  if (!fields.email) {
    const m = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (m) fields.email = m[0];
  }
  if (!fields.phone) {
    const m = raw.match(/\b(?:tel\.?|phone|t)\s*[:\-]?\s*([+()0-9.\-\s]{7,})/i) || raw.match(/\b(\+?\d[\d().\-\s]{7,})\b/);
    if (m) fields.phone = (m[1] || m[0]).trim();
  }
  if (!fields.website) {
    const m = raw.match(/\bhttps?:\/\/[^\s)]+/i) || raw.match(/\bwww\.[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?/i);
    if (m) fields.website = m[0].replace(/[\.,]$/, '');
  }

  // Normalize numerics
  const toInt = s => (s && (String(s).match(/-?\d[\d,]*/)?.[0] || '').replace(/,/g,'')) || '';
  const toNum = s => (s && (String(s).match(/-?\d[\d,\.]+/)?.[0] || '').replace(/,/g,'')) || '';

  if (fields.rooms_total)                     fields.rooms_total = toInt(fields.rooms_total);
  if (fields.suites)                          fields.suites = toInt(fields.suites);
  if (fields.king_rooms)                      fields.king_rooms = toInt(fields.king_rooms);
  if (fields.double_double_rooms)             fields.double_double_rooms = toInt(fields.double_double_rooms);
  if (fields.meeting_space_sqft)              fields.meeting_space_sqft = toInt(fields.meeting_space_sqft);
  if (fields.largest_room_sqft)               fields.largest_room_sqft = toInt(fields.largest_room_sqft);
  if (fields.largest_room_capacity)           fields.largest_room_capacity = toInt(fields.largest_room_capacity);
  if (fields.ballroom_sqft)                   fields.ballroom_sqft = toInt(fields.ballroom_sqft);
  if (fields.number_of_meeting_rooms)         fields.number_of_meeting_rooms = toInt(fields.number_of_meeting_rooms);
  if (fields.parking_fee)                     fields.parking_fee = toNum(fields.parking_fee);
  if (fields.airport_distance)                fields.airport_distance = toNum(fields.airport_distance);

  return fields;
}


function toIntLoose(s) {
  if (!s) return null;
  const m = String(s).match(/-?\d[\d,]*/);
  return m ? parseInt(m[0].replace(/,/g,''), 10) : null;
}
function toFloatFeet(s) {
  if (!s) return null;
  const str = String(s).replace(/feet|ft|'"/gi, "'").replace(/"/g, '"').trim();
  const m1 = str.match(/(\d+(?:\.\d+)?)\s*'?$/);
  if (m1) return parseFloat(m1[1]);
  const m2 = str.match(/(\d+)\s*'\s*(\d+)\s*"?/);
  if (m2) return parseInt(m2[1],10) + (parseInt(m2[2],10)/12);
  return toIntLoose(str);
}
function toInt(s) {
  if (!s) return null;
  const m = String(s).match(/-?\d[\d,]*/);
  return m ? parseInt(m[0].replace(/,/g,''), 10) : null;
}

// --- inserted helper above extractHotelFacts() ---
function extractHotelFacts(text) {
  const facts = {
    total_guestrooms: null,
    total_meeting_space_sqft: null,
    meeting_rooms: [] // { name, dimensions:{length_ft,width_ft}, sqft, ceiling_ft, capacities:{} }
  };

  const lines = normalizeText(text).split(/\n/).map(s => s.trim()).filter(Boolean);

  // overall stats
  for (const ln of lines) {
    if (facts.total_guestrooms == null) {
      const mG =
        ln.match(/\b(\d{2,4})\s*(?:guest\s*rooms|guestrooms|rooms)\b/i) ||
        ln.match(/\brooms?\s*[:\-]\s*(\d{2,4})\b/i);
      if (mG) facts.total_guestrooms = toInt(mG[1]);
    }
    if (facts.total_meeting_space_sqft == null) {
      const mM =
        ln.match(/\b([\d,]+)\s*(?:sq\.?\s*ft|square\s*feet|sf)\b.*\b(meeting|event)\b.*\b(space|area)\b/i) ||
        ln.match(/\btotal\s*(meeting|event)\s*(space|area)\s*[:\-]\s*([\d,]+)\s*(sq\.?\s*ft|sf)\b/i);
      if (mM) {
        const n = mM[1] || mM[3];
        facts.total_meeting_space_sqft = toInt(n);
      }
    }
  }

  // bullet-style: "• Grand Ballroom - 3,456 sq. ft."
  for (const ln of lines) {
    const m = ln.match(/^[•\-—*]?\s*([A-Za-z0-9 .&'()\/+-]+?)\s*[-–—]\s*([\d,]+)\s*(?:sq\.?\s*ft|sf)\b/i);
    if (m) {
      const name = m[1].trim().replace(/\s{2,}/g,' ');
      const sqft = toInt(m[2]);
      const existing = facts.meeting_rooms.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (existing) existing.sqft = existing.sqft || sqft;
      else facts.meeting_rooms.push({ name, dimensions:null, sqft, ceiling_ft:null, capacities:{} });
      continue;
    }
  }

  // table-like rows with dimensions + numbers (sometimes Height precedes Area)
  for (const ln of lines) {
    const dimMatch = ln.match(/(\d+(?:\.\d+)?\s*'?)[\s×xX]\s*(\d+(?:\.\d+)?\s*'?)/);
    if (!dimMatch) continue;

    const before = ln.slice(0, dimMatch.index).trim().replace(/\s{2,}/g,' ');
    if (!before || before.length < 3) continue;

    // Collect numeric tokens after dims; strip N/A and trailing "*..." (e.g., "8x10*")
    const after = ln.slice(dimMatch.index + dimMatch[0].length).trim();
    const tokens = (after
      .replace(/\bN\/A\b/gi,' ')
      .match(/\d[\d,\.*/-]*/g) || [])
      .map(v => v.replace(/,/g,''))
      .map(v => v.replace(/\*.*$/, ''))
      .filter(Boolean);

    if (tokens.length < 2) continue;

    // Heuristic: first token ~height (6–45 ft), second/third token area (>=200 sqft)
    const firstThree = tokens.slice(0, 3);
    let ceil = null, area = null;

    const v0 = toFloatFeet(firstThree[0]);
    if (v0 != null && v0 >= 6 && v0 <= 45) ceil = v0;
    for (const t of firstThree) {
      const vi = toInt(t);
      if (vi != null && vi >= 200) { area = vi; break; }
    }
    if (ceil == null && firstThree[0] != null) ceil = toFloatFeet(firstThree[0]);
    if (area == null && firstThree[1] != null) area = toInt(firstThree[1]);

    const length_ft = toFloatFeet(dimMatch[1]);
    const width_ft  = toFloatFeet(dimMatch[2]);

    const row = {
      name: before,
      dimensions: { length_ft, width_ft },
      sqft: area || null,
      ceiling_ft: ceil || null,
      capacities: {}
    };

    const capNums = tokens.slice(2);
    const labels = ['reception','banquet','theater','schoolroom','conference','u_shape','hollow_square'];
    for (let i = 0; i < labels.length; i++) {
      const v = toInt(capNums[i]);
      if (v != null) row.capacities[labels[i]] = v;
    }

    const existing = facts.meeting_rooms.find(r => r.name.toLowerCase() === row.name.toLowerCase());
    if (existing) {
      facts.meeting_rooms[facts.meeting_rooms.indexOf(existing)] =
        { ...existing, ...row, capacities: { ...existing.capacities, ...row.capacities } };
    } else {
      facts.meeting_rooms.push(row);
    }
  }

  // de-dup by name
  const dedup = new Map();
  for (const r of facts.meeting_rooms) {
    const key = r.name.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, r);
  }
  facts.meeting_rooms = Array.from(dedup.values());

  return facts;
}


// ---------- PATH for brew bins ----------
process.env.PATH = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  process.env.PATH || ''
].filter(Boolean).join(path.delimiter);

// ---------- dirs / app ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
// Create directories - handle both local development and Render deployment
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

console.log('Server directories initialized');
console.log('Current directory:', __dirname);
console.log('Public directory exists:', fs.existsSync(path.join(__dirname, 'public')));

const app = express();
app.use(cors());
app.use(express.json());
// --- Maintenance mode gate (enable with MAINTENANCE=1) ---
if (process.env.MAINTENANCE === '1' || process.env.MAINTENANCE === 'true') {
  const allowedStatic = new Set([
    '/maintenance.html',
    '/robots.txt',
    '/site.css',
    '/favicon.ico',
    '/flag-1200x400.jpg',
    '/flag-1200x400.mp4'
  ]);
  app.use((req, res, next) => {
    // Allow health checks
    if (req.path === '/health' || req.path === '/healthz' || req.path === '/readyz') {
      return res.status(200).json({ ok: true });
    }
    // Allow the maintenance page and essential assets
    if (req.method === 'GET' && (allowedStatic.has(req.path))) return next();
    // Serve maintenance page for all other GETs
    if (req.method === 'GET') {
      res.set('Retry-After', '3600');
      return res.status(503).sendFile(path.join(__dirname, 'public', 'maintenance.html'));
    }
    // Block mutating/API requests
    res.set('Retry-After', '3600');
    return res.status(503).json({ error: 'Service temporarily unavailable for maintenance' });
  });
}

// Root serves the main site (index.html)
// Prelaunch page is accessible at /prelaunch or /prelaunch.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Prelaunch shortcut (also accessible at /prelaunch.html via static files)
app.get('/prelaunch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prelaunch.html'));
});

// Serve static files from public directory with no cache
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ---------- uploads (moved earlier to ensure initialization before usage) ----------
const allowed = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

function sanitizeFilename(name) {
  const base = path.basename(name);
  const parsed = path.parse(base);
  const safeName = parsed.name.normalize('NFKD').replace(/[^\w.-]+/g, '_');
  const ext = (parsed.ext || '').toLowerCase();
  return `${safeName}${ext}`;
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
});
// Submit bid for final acceptance (locks the bid)
app.post('/api/hotel/contracts/:id/bid/submit', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'hotel' || !req.user.hotel_id) {
      return fail(res, 403, 'Hotel access required');
    }

    const contractId = req.params.id;

    const contract = db.prepare(`
      SELECT c.*
      FROM contracts c
      LEFT JOIN contract_access ca ON ca.contract_id = c.id AND ca.hotel_id = ?
      WHERE c.id = ? AND c.status = 'active' AND (
        c.visibility = 'PUBLIC' OR ca.id IS NOT NULL
      )
    `).get(req.user.hotel_id, contractId);
    if (!contract) {
      return fail(res, 404, 'Contract not found or no longer active');
    }

    // Deadline guard
    if (contract.bidding_deadline && new Date() > new Date(contract.bidding_deadline)) {
      return fail(res, 400, 'Bidding deadline has passed');
    }

    const bid = db.prepare(`
      SELECT * FROM contract_bids WHERE contract_id = ? AND hotel_id = ? ORDER BY id DESC
    `).get(contractId, req.user.hotel_id);

    if (!bid) {
      return fail(res, 400, 'No bid to submit');
    }

    // Only allow submit from editable states
    const submittable = new Set(['draft','clarification','bafo']);
    if (!submittable.has(bid.status)) {
      return fail(res, 400, 'Bid cannot be submitted from current status');
    }

    db.prepare(`
      UPDATE contract_bids 
      SET status = 'submitted',
          submitted_at = datetime('now'),
          updated_at = datetime('now'),
          auto_bid_active = 0
      WHERE id = ?
    `).run(bid.id);

    recalculateStandings(contractId, { updateDb: true, suppressEmail: true });

    return ok(res, { message: 'Bid submitted and locked' });
  } catch (error) {
    console.error('Submit final bid error:', error);
    return fail(res, 500, 'Failed to submit bid');
  }
});

// Upload a file attached to the current bid
app.post('/api/hotel/contracts/:id/bid/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (req.user.role !== 'hotel' || !req.user.hotel_id) {
      return fail(res, 403, 'Hotel access required');
    }

    const contractId = req.params.id;
    const contract = db.prepare(`
      SELECT c.*
      FROM contracts c
      LEFT JOIN contract_access ca ON ca.contract_id = c.id AND ca.hotel_id = ?
      WHERE c.id = ? AND c.status = 'active' AND (
        c.visibility = 'PUBLIC' OR ca.id IS NOT NULL
      )
    `).get(req.user.hotel_id, contractId);
    if (!contract) {
      return fail(res, 404, 'Contract not found or no longer active');
    }

    let bid = db.prepare(`
      SELECT * FROM contract_bids WHERE contract_id = ? AND hotel_id = ? ORDER BY id DESC
    `).get(contractId, req.user.hotel_id);

    if (!bid) {
      // Auto-create a draft bid to attach files to
      const ins = db.prepare(`
        INSERT INTO contract_bids (contract_id, hotel_id, contracted_rate, self_pay_rate, status)
        VALUES (?, ?, 0, 0, 'draft')
      `).run(contractId, req.user.hotel_id);
      bid = { id: ins.lastInsertRowid };
    }

    if (!req.file) {
      return fail(res, 400, 'No file uploaded');
    }

    db.prepare(`
      INSERT INTO bid_files (bid_id, contract_id, hotel_id, filename, original_name, mime_type, size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      bid.id,
      contractId,
      req.user.hotel_id,
      req.file.filename,
      req.file.originalname || null,
      req.file.mimetype || null,
      req.file.size || null
    );

    return ok(res, { message: 'File uploaded', bidId: bid.id });
  } catch (error) {
    console.error('Bid file upload error:', error);
    return fail(res, 500, 'Failed to upload file');
  }
});

// Q&A: list for a contract (both roles via appropriate auth)
app.get('/api/contracts/:id/qna', requireAuth, (req, res) => {
  try {
    const contractId = req.params.id;
    const rows = db.prepare(`
      SELECT q.*, h.name AS hotel_name
      FROM contract_qna q
      LEFT JOIN hotels h ON q.hotel_id = h.id
      WHERE q.contract_id = ?
      ORDER BY q.created_at DESC
    `).all(contractId);
    return ok(res, { qna: rows });
  } catch (error) {
    console.error('QnA list error:', error);
    return fail(res, 500, 'Failed to fetch Q&A');
  }
});

// Q&A: post a question (hotel) or answer (admin)
app.post('/api/contracts/:id/qna', requireAuth, (req, res) => {
  try {
    const contractId = req.params.id;
    const { question, answer, qid } = req.body;

    // resolve role and access
    if (req.user.role === 'hotel' && req.user.hotel_id) {
      // ensure access like other endpoints
      const hasAccess = db.prepare(`
        SELECT 1
        FROM contracts c
        LEFT JOIN contract_access ca ON ca.contract_id = c.id AND ca.hotel_id = ?
        WHERE c.id = ? AND c.status = 'active' AND (
          c.visibility = 'PUBLIC' OR ca.id IS NOT NULL
        )
      `).get(req.user.hotel_id, contractId);
      if (!hasAccess) {
        return fail(res, 403, 'Access denied');
      }
      if (!question) return fail(res, 400, 'Question required');
      const ins = db.prepare(`
        INSERT INTO contract_qna (contract_id, hotel_id, author_type, question)
        VALUES (?, ?, 'hotel', ?)
      `).run(contractId, req.user.hotel_id, question);
      return ok(res, { id: ins.lastInsertRowid });
    }

    if (req.user.role === 'admin') {
      if (!qid || !answer) return fail(res, 400, 'qid and answer required');
      db.prepare(`
        UPDATE contract_qna
        SET answer = ?, answered_at = datetime('now'), answered_by = ?
        WHERE id = ?
      `).run(answer, req.user.id, qid);
      return ok(res, { ok: true });
    }

    return fail(res, 403, 'Unauthorized');
  } catch (error) {
    console.error('QnA post error:', error);
    return fail(res, 500, 'Failed to post Q&A');
  }
});

// Serve hotel registration page
app.get('/hotel-registration.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hotel-registration.html'));
});

app.get('/hotel-signup.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hotel-signup.html'));
});

app.get('/hotel-profile-form.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hotel-profile-form.html'));
});

// Serve hotel profile page
app.get('/hotel-profile.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hotel-profile.html'));
});
// Serve SAM search page
app.get('/sam-search.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sam-search.html'));
});

// Serve Government Portal pages
app.get('/government-portal.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'government-portal.html'));
});

app.get('/government-login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'government-login.html'));
});

app.get('/government-registration.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'government-registration.html'));
});

app.get('/government-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'government-dashboard.html'));
});

app.get('/government-hotel-search.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'government-hotel-search.html'));
});


// Support ticket system endpoints

// Create a new support ticket
app.post('/api/support/tickets', upload.array('attachments', 5), (req, res) => {
  try {
    const { subject, description, category, priority, customer_email, customer_name, customer_phone } = req.body;
    
    // Generate unique ticket number
    const ticketNumber = 'TK-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    
    // Handle file attachments
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        filename: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
    }
    
    // Create ticket
    const stmt = db.prepare(`
      INSERT INTO support_tickets (
        ticket_number, subject, description, category, priority, 
        customer_email, customer_name, customer_phone, attachments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      ticketNumber, subject, description, category || 'general', 
      priority || 'medium', customer_email, customer_name, customer_phone,
      JSON.stringify(attachments)
    );
    
    const ticketId = result.lastInsertRowid;
    
    // Create initial message
    const messageStmt = db.prepare(`
      INSERT INTO support_ticket_messages (
        ticket_id, message, sender_type, sender_name, sender_email
      ) VALUES (?, ?, ?, ?, ?)
    `);
    
    messageStmt.run(
      ticketId, description, 'customer', customer_name, customer_email
    );
    
    // Send confirmation email to customer
    sendSupportTicketConfirmation(customer_email, ticketNumber, subject);
    
    // Send notification to admin
    sendSupportTicketNotification(ticketNumber, subject, customer_email, category, priority);
    
    return ok(res, { 
      message: 'Support ticket created successfully',
      ticket_number: ticketNumber,
      ticket_id: ticketId
    });
    
  } catch (error) {
    console.error('Create support ticket error:', error);
    return fail(res, 500, 'Failed to create support ticket');
  }
});

// Get support tickets (admin only)
app.get('/api/support/tickets', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return fail(res, 403, 'Admin access required');
    }
    
    const { status, category, priority, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT st.*, u.first_name, u.last_name, h.name as hotel_name
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN hotels h ON st.hotel_id = h.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (status) {
      conditions.push('st.status = ?');
      params.push(status);
    }
    
    if (category) {
      conditions.push('st.category = ?');
      params.push(category);
    }
    
    if (priority) {
      conditions.push('st.priority = ?');
      params.push(priority);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY st.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const tickets = db.prepare(query).all(...params);
    
    return ok(res, { tickets });
    
  } catch (error) {
    console.error('Get support tickets error:', error);
    return fail(res, 500, 'Failed to retrieve support tickets');
  }
});

// Get single ticket with messages
app.get('/api/support/tickets/:id', requireAuth, (req, res) => {
  try {
    const ticketId = req.params.id;
    
    // Get ticket details
    const ticket = db.prepare(`
      SELECT st.*, u.first_name, u.last_name, h.name as hotel_name
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN hotels h ON st.hotel_id = h.id
      WHERE st.id = ?
    `).get(ticketId);
    
    if (!ticket) {
      return fail(res, 404, 'Ticket not found');
    }
    
    // Check permissions (admin or ticket owner)
    if (req.user.role !== 'admin' && ticket.user_id !== req.user.id) {
      return fail(res, 403, 'Access denied');
    }
    
    // Get ticket messages
    const messages = db.prepare(`
      SELECT * FROM support_ticket_messages
      WHERE ticket_id = ? AND (is_internal = 0 OR ? = 1)
      ORDER BY created_at ASC
    `).all(ticketId, req.user.role === 'admin' ? 1 : 0);
    
    ticket.messages = messages;
    
    return ok(res, { ticket });
    
  } catch (error) {
    console.error('Get ticket error:', error);
    return fail(res, 500, 'Failed to retrieve ticket');
  }
});

// Add message to ticket
app.post('/api/support/tickets/:id/messages', requireAuth, upload.array('attachments', 5), (req, res) => {
  try {
    const ticketId = req.params.id;
    const { message, is_internal = false } = req.body;
    
    // Get ticket
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      return fail(res, 404, 'Ticket not found');
    }
    
    // Check permissions
    if (req.user.role !== 'admin' && ticket.user_id !== req.user.id) {
      return fail(res, 403, 'Access denied');
    }
    
    // Handle attachments
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        filename: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
    }
    
    // Add message
    const stmt = db.prepare(`
      INSERT INTO support_ticket_messages (
        ticket_id, message, sender_type, sender_name, sender_email, 
        is_internal, attachments
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const senderType = req.user.role === 'admin' ? 'admin' : 'customer';
    const senderName = req.user.role === 'admin' ? 'FEDEVENT Support' : req.user.first_name + ' ' + req.user.last_name;
    
    stmt.run(
      ticketId, message, senderType, senderName, req.user.email,
      is_internal ? 1 : 0, JSON.stringify(attachments)
    );
    
    // Update ticket timestamp
    db.prepare('UPDATE support_tickets SET updated_at = datetime("now") WHERE id = ?').run(ticketId);
    
    // Send email notification if customer message
    if (senderType === 'customer') {
      sendTicketUpdateNotification(ticket.customer_email, ticket.ticket_number, message);
    }
    
    return ok(res, { message: 'Message added successfully' });
    
  } catch (error) {
    console.error('Add message error:', error);
    return fail(res, 500, 'Failed to add message');
  }
});

// Update ticket status (admin only)
app.put('/api/support/tickets/:id/status', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return fail(res, 403, 'Admin access required');
    }
    
    const ticketId = req.params.id;
    const { status, resolution_notes } = req.body;
    
    const validStatuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return fail(res, 400, 'Invalid status');
    }
    
    const updateData = { status, updated_at: new Date().toISOString() };
    if (resolution_notes) {
      updateData.resolution_notes = resolution_notes;
    }
    if (status === 'resolved' || status === 'closed') {
      updateData.resolved_at = new Date().toISOString();
    }
    
    const stmt = db.prepare(`
      UPDATE support_tickets 
      SET status = ?, resolution_notes = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?
    `);
    
    stmt.run(status, resolution_notes, updateData.resolved_at, updateData.updated_at, ticketId);
    
    // Send status update notification
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);
    sendTicketStatusUpdate(ticket.customer_email, ticket.ticket_number, status);
    
    return ok(res, { message: 'Ticket status updated successfully' });
    
  } catch (error) {
    console.error('Update ticket status error:', error);
    return fail(res, 500, 'Failed to update ticket status');
  }
});

// Email notification functions
function sendSupportTicketConfirmation(customerEmail, ticketNumber, subject) {
  // Implementation for sending confirmation email
  console.log(`Sending confirmation email to ${customerEmail} for ticket ${ticketNumber}`);
}

function sendSupportTicketNotification(ticketNumber, subject, customerEmail, category, priority) {
  // Implementation for sending admin notification
  console.log(`Sending admin notification for ticket ${ticketNumber}`);
}

function sendTicketUpdateNotification(customerEmail, ticketNumber, message) {
  // Implementation for sending update notification
  console.log(`Sending update notification to ${customerEmail} for ticket ${ticketNumber}`);
}

function sendTicketStatusUpdate(customerEmail, ticketNumber, status) {
  // Implementation for sending status update
  console.log(`Sending status update to ${customerEmail} for ticket ${ticketNumber}`);
}

// Basic site pages (stubs if missing)
const staticPages = [
  'about.html',
  'contact.html',
  'search.html',
  'resources.html',
  'admin-login.html',
  'admin-dashboard.html',
  'admin-contracts.html',
  'admin-support.html',
  'hotel-login.html',
  'hotel-dashboard.html',
  'hotel-contracts.html',
  'reset-password.html',
  'support-ticket.html'
];
for (const p of staticPages) {
  app.get('/' + p, (req, res) => {
    const filePath = path.join(__dirname, 'public', p);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(200).send(`<!doctype html><meta charset="utf-8"><title>${p.replace('.html','')}</title><div style="font-family:system-ui;padding:24px"><h1>${p.replace('.html','')}</h1><p>Coming soon.</p><p><a href="/">Home</a></p></div>`);
  });
}
// ---------- Data dir & DB path ----------
const isRender = !!process.env.RENDER;
const DATA_DIR = process.env.DATA_DIR || (isRender ? '/app/data' : path.join(process.cwd(), 'data'));
const DB_PATH  = process.env.DB_PATH  || path.join(DATA_DIR, 'creata.db');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ensure data directory exists before opening SQLite
fs.mkdirSync(DATA_DIR, { recursive: true });

console.log('Resolved DATA_DIR:', DATA_DIR);
console.log('Resolved DB_PATH:', DB_PATH);

// ---------- database ----------
// Use local data directory (persists in Render's container filesystem)
const db = new Database(DB_PATH);

// ---------- Claude client (lazy loaded) ----------
let claude = null;
async function getClaude() {
  if (!claude && process.env.ANTHROPIC_API_KEY) {
    const Anthropic = await import('@anthropic-ai/sdk');
    claude = new Anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log('Claude client initialized');
  }
  return claude;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS hotels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'hotel',
    hotel_id INTEGER,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    job_title TEXT,
    fedevent_account_number TEXT UNIQUE,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT,
    FOREIGN KEY (hotel_id) REFERENCES hotels (id)
  );
`);

// Migration: Add fedevent_account_number column if it doesn't exist
try {
  db.exec(`ALTER TABLE users ADD COLUMN fedevent_account_number TEXT UNIQUE`);
  console.log('Added fedevent_account_number column to users table');
} catch (e) {
  // Column already exists, which is fine
  if (!e.message.includes('duplicate column name')) {
    console.log('fedevent_account_number column already exists');
  }
}

// Safe migrations for new bidding features
try { db.exec(`ALTER TABLE contracts ADD COLUMN visibility TEXT DEFAULT 'PUBLIC'`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS contract_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  hotel_id INTEGER NOT NULL,
  granted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(contract_id, hotel_id),
  FOREIGN KEY (contract_id) REFERENCES contracts (id),
  FOREIGN KEY (hotel_id) REFERENCES hotels (id)
)`); } catch (e) {}
try { db.exec(`ALTER TABLE contract_bids ADD COLUMN breakdown TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE contract_bids ADD COLUMN total_price REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE contract_bids ADD COLUMN status TEXT DEFAULT 'draft'`); } catch (e) {}
try { db.exec(`ALTER TABLE contracts ADD COLUMN bid_strategy TEXT DEFAULT 'FIRM_FIXED'`); } catch (e) {}
try { db.exec(`ALTER TABLE contracts ADD COLUMN target_bid_min INTEGER`); } catch (e) {}
try { db.exec(`ALTER TABLE contracts ADD COLUMN target_bid_max INTEGER`); } catch (e) {}
try { db.exec(`ALTER TABLE contract_bids ADD COLUMN auto_bid_active INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE contract_bids ADD COLUMN auto_bid_floor REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE contract_bids ADD COLUMN auto_bid_step REAL DEFAULT 1`); } catch (e) {}
try { db.exec(`ALTER TABLE contract_bids ADD COLUMN auto_bid_last_adjusted_at TEXT`); } catch (e) {}

// Payment tracking migrations for $49.99 setup fee
try { db.exec(`ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active'`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN setup_fee_paid INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  amount DECIMAL(10,2) NOT NULL DEFAULT 49.99,
  status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT 'quickbooks',
  quickbooks_invoice_id TEXT,
  quickbooks_payment_id TEXT,
  transaction_note TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)`); console.log('✅ Payments table created'); } catch (e) {
  if (!e.message.includes('already exists')) console.log('Payments table already exists');
}
// Hotel leads table for prelaunch waitlist
try { db.exec(`CREATE TABLE IF NOT EXISTS hotel_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_code TEXT UNIQUE NOT NULL,
  hotel_name TEXT NOT NULL,
  hotel_address TEXT,
  hotel_phone TEXT,
  hotel_place_id TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  title TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  interests TEXT,
  accepts_net30 TEXT,
  accepts_po TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notified INTEGER DEFAULT 0
)`); console.log('✅ Hotel leads table created'); } catch (e) {
  if (!e.message.includes('already exists')) console.log('Hotel leads table already exists');
}

// Add new columns if they don't exist (migrations)
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN user_code TEXT UNIQUE`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN hotel_address TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN hotel_phone TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN hotel_place_id TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN accepts_net30 TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN accepts_po TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN indoor_property TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN accepts_discount TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN country TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN zip_code TEXT`); } catch (e) {}

// Email contacts table - for invitation campaigns (separate from registered waitlist)
try { 
  db.exec(`CREATE TABLE IF NOT EXISTS email_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    hotel_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    country TEXT,
    phone TEXT,
    title TEXT,
    notes TEXT,
    priority_level TEXT DEFAULT 'normal',
    invitation_status TEXT DEFAULT 'not_invited',
    invited_at TEXT,
    invited_by INTEGER,
    registered TEXT DEFAULT 'No',
    registered_lead_id INTEGER,
    last_contacted_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invited_by) REFERENCES users (id),
    FOREIGN KEY (registered_lead_id) REFERENCES hotel_leads (id)
  )`);
  console.log('✅ Email contacts table created');
} catch (e) {
  if (!e.message.includes('already exists')) console.log('Email contacts table already exists');
}

// Add unsubscribe tracking columns to email_contacts
try { db.exec(`ALTER TABLE email_contacts ADD COLUMN unsubscribed INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE email_contacts ADD COLUMN unsubscribed_at TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE email_contacts ADD COLUMN unsubscribe_token TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE email_contacts ADD COLUMN prelaunch_sent INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE email_contacts ADD COLUMN prelaunch_sent_at TEXT`); } catch (e) {}

// Add unsubscribe tracking to hotel_leads as well
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN unsubscribed INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN unsubscribed_at TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN unsubscribe_token TEXT`); } catch (e) {}

// Link prelaunch codes to main hotel accounts (migration)
try {
  db.exec(`ALTER TABLE hotels ADD COLUMN prelaunch_code TEXT UNIQUE`);
  console.log('✅ Added prelaunch_code column to hotels table');
} catch (e) {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE hotels ADD COLUMN is_early_adopter INTEGER DEFAULT 0`);
  console.log('✅ Added is_early_adopter flag to hotels table');
} catch (e) {
  // Column already exists
}
try { db.exec(`ALTER TABLE contract_bids ADD COLUMN last_known_rank INTEGER`); } catch (e) {}
try { db.exec(`ALTER TABLE live_auctions ADD COLUMN requirement_summary TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE live_auctions ADD COLUMN sow_document TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE live_auctions ADD COLUMN sow_original_name TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE live_auctions ADD COLUMN sow_mime_type TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE live_auctions ADD COLUMN sow_size INTEGER`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS auction_clins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL,
  clin_number TEXT,
  title TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (auction_id) REFERENCES live_auctions (id) ON DELETE CASCADE
)`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS contract_qna (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  hotel_id INTEGER,
  author_type TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  answered_at TEXT,
  answered_by INTEGER,
  FOREIGN KEY (contract_id) REFERENCES contracts (id),
  FOREIGN KEY (hotel_id) REFERENCES hotels (id),
  FOREIGN KEY (answered_by) REFERENCES users (id)
)`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS bid_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bid_id INTEGER NOT NULL,
  contract_id INTEGER NOT NULL,
  hotel_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  uploaded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (bid_id) REFERENCES contract_bids (id),
  FOREIGN KEY (contract_id) REFERENCES contracts (id),
  FOREIGN KEY (hotel_id) REFERENCES hotels (id)
)`); } catch (e) {}

// Migration: Add is_priority column to hotels table if it doesn't exist
try {
  db.exec(`ALTER TABLE hotels ADD COLUMN is_priority INTEGER DEFAULT 0`);
  console.log('Added is_priority column to hotels table');
} catch (e) {
  // Column already exists, which is fine
  if (!e.message.includes('duplicate column name')) {
    console.log('is_priority column already exists');
  }
}
db.exec(`

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS government_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    agency TEXT NOT NULL,
    department TEXT,
    job_title TEXT NOT NULL,
    security_clearance TEXT,
    government_id TEXT,
    office_address TEXT,
    office_city TEXT,
    office_state TEXT,
    office_zip TEXT,
    supervisor_name TEXT,
    supervisor_email TEXT,
    supervisor_phone TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS government_sessions (
    id TEXT PRIMARY KEY,
    government_user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (government_user_id) REFERENCES government_users (id)
  );

  CREATE TABLE IF NOT EXISTS government_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    government_user_id INTEGER NOT NULL,
    document_type TEXT NOT NULL, -- SOW, PWS, SALIENT_FEATURES, OTHER
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    classification_level TEXT DEFAULT 'UNCLASSIFIED',
    description TEXT,
    project_name TEXT,
    uploaded_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'active', -- active, archived, deleted
    FOREIGN KEY (government_user_id) REFERENCES government_users (id)
  );

  CREATE TABLE IF NOT EXISTS government_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    government_user_id INTEGER NOT NULL,
    project_name TEXT NOT NULL,
    project_code TEXT,
    description TEXT,
    agency TEXT,
    start_date TEXT,
    end_date TEXT,
    budget_estimate REAL,
    status TEXT DEFAULT 'planning', -- planning, active, completed, cancelled
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (government_user_id) REFERENCES government_users (id)
  );

  CREATE TABLE IF NOT EXISTS government_quote_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    government_user_id INTEGER NOT NULL,
    hotel_id INTEGER NOT NULL,
    event_details TEXT,
    requirements TEXT,
    status TEXT DEFAULT 'pending', -- pending, quoted, accepted, declined
    hotel_response TEXT,
    quoted_rate REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (government_user_id) REFERENCES government_users (id),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id)
  );

  CREATE TABLE IF NOT EXISTS hotel_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_id INTEGER NOT NULL,
    profile_data TEXT NOT NULL,
    files_data TEXT,
    status TEXT DEFAULT 'pending',
    submitted_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id)
  );

  CREATE TABLE IF NOT EXISTS hotel_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    form_data TEXT NOT NULL,
    current_page INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS hotel_deletions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_id INTEGER NOT NULL,
    hotel_name TEXT NOT NULL,
    admin_user_id INTEGER NOT NULL,
    admin_name TEXT NOT NULL,
    deletion_reason TEXT NOT NULL,
    deleted_at TEXT DEFAULT (datetime('now')),
    is_retracted INTEGER DEFAULT 0,
    retracted_at TEXT,
    retraction_reason TEXT,
    hotel_data TEXT NOT NULL, -- JSON backup of hotel data
    users_data TEXT, -- JSON backup of associated users
    profiles_data TEXT, -- JSON backup of associated profiles
    FOREIGN KEY (admin_user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    location_city TEXT,
    location_state TEXT,
    location_country TEXT,
    start_date TEXT,
    end_date TEXT,
    room_count INTEGER,
    per_diem_rate REAL,
    max_contracted_rate REAL,
    max_self_pay_rate REAL,
    requirements TEXT,
    sow_document TEXT,
    status TEXT DEFAULT 'active',
    visibility TEXT DEFAULT 'PUBLIC', -- PUBLIC or PRIVATE
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    bidding_deadline TEXT,
    decision_date TEXT,
    awarded_hotel_id INTEGER,
    FOREIGN KEY (created_by) REFERENCES users (id),
    FOREIGN KEY (awarded_hotel_id) REFERENCES hotels (id)
  );

  -- Access control: map non-PUBLIC contracts to specific hotels
  CREATE TABLE IF NOT EXISTS contract_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    hotel_id INTEGER NOT NULL,
    granted_at TEXT DEFAULT (datetime('now')),
    UNIQUE(contract_id, hotel_id),
    FOREIGN KEY (contract_id) REFERENCES contracts (id),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id)
  );

  CREATE TABLE IF NOT EXISTS contract_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    hotel_id INTEGER NOT NULL,
    email_sent INTEGER DEFAULT 0,
    email_sent_at TEXT,
    response TEXT,
    responded_at TEXT,
    FOREIGN KEY (contract_id) REFERENCES contracts (id),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id)
  );

  CREATE TABLE IF NOT EXISTS contract_bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    hotel_id INTEGER NOT NULL,
    contracted_rate REAL NOT NULL,
    self_pay_rate REAL NOT NULL,
    additional_notes TEXT,
    status TEXT DEFAULT 'draft', -- draft, clarification, bafo, submitted, archived
    breakdown TEXT, -- JSON of line items
    total_price REAL,
    submitted_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contract_id) REFERENCES contracts (id),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id)
  );

  CREATE TABLE IF NOT EXISTS team_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_id INTEGER NOT NULL,
    inviter_user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    job_title TEXT,
    permissions TEXT, -- JSON string of permissions
    invitation_token TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, accepted, expired
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    accepted_at TEXT,
    FOREIGN KEY (hotel_id) REFERENCES hotels (id),
    FOREIGN KEY (inviter_user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS live_auctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    location_city TEXT,
    location_state TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    bidding_start TEXT NOT NULL,
    bidding_end TEXT NOT NULL,
    base_rate REAL,
    room_count INTEGER,
    requirements TEXT,
    status TEXT DEFAULT 'upcoming', -- upcoming, active, closed, cancelled
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auction_bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    hotel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    bid_amount REAL NOT NULL,
    bid_type TEXT DEFAULT 'standard', -- standard, auto_bid
    max_bid REAL, -- for auto bidding
    notes TEXT,
    status TEXT DEFAULT 'active', -- active, outbid, winning, withdrawn
    submitted_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (auction_id) REFERENCES live_auctions (id),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS contract_qna (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    hotel_id INTEGER,
    author_type TEXT NOT NULL, -- 'hotel' or 'admin'
    question TEXT NOT NULL,
    answer TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    answered_at TEXT,
    answered_by INTEGER,
    FOREIGN KEY (contract_id) REFERENCES contracts (id),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id),
    FOREIGN KEY (answered_by) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS bid_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bid_id INTEGER NOT NULL,
    contract_id INTEGER NOT NULL,
    hotel_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    uploaded_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bid_id) REFERENCES contract_bids (id),
    FOREIGN KEY (contract_id) REFERENCES contracts (id),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id)
  );

  -- Signed agreements (hotel participation one-pager)
  CREATE TABLE IF NOT EXISTS signed_agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_name TEXT NOT NULL,
    rep_name TEXT NOT NULL,
    title TEXT,
    email TEXT,
    agreement_version TEXT,
    agreement_effective TEXT,
    signed_at TEXT DEFAULT (datetime('now')),
    user_agent TEXT,
    ip_address TEXT,
    signature_path TEXT
  );

  -- Approval workflow for second signature
  CREATE TABLE IF NOT EXISTS agreement_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agreement_id INTEGER NOT NULL,
    approver_name TEXT,
    approver_email TEXT,
    status TEXT DEFAULT 'pending', -- pending, signed
    token TEXT UNIQUE,
    signed_at TEXT,
    signature_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agreement_id) REFERENCES signed_agreements (id)
  );

  -- Support ticket system
  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- technical, billing, general, feature_request
    priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
    status TEXT DEFAULT 'open', -- open, in_progress, waiting_customer, resolved, closed
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    user_id INTEGER, -- if logged in user
    hotel_id INTEGER, -- if hotel user
    assigned_to INTEGER, -- admin user ID
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    resolution_notes TEXT,
    attachments TEXT, -- JSON array of file paths
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (hotel_id) REFERENCES hotels (id),
    FOREIGN KEY (assigned_to) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    sender_type TEXT NOT NULL, -- customer, admin, system
    sender_name TEXT,
    sender_email TEXT,
    is_internal INTEGER DEFAULT 0, -- internal notes vs customer-visible
    attachments TEXT, -- JSON array of file paths
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ticket_id) REFERENCES support_tickets (id)
  );

  -- (Migrations handled in JS after DB init)
`);

// Create default admin user if it doesn't exist
function createDefaultAdmin() {
  const adminExists = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();
  
  if (!adminExists) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@fedevent.com';
    const adminPassword = process.env.ADMIN_PASSWORD || generateSecurePassword();
    
    console.log('Creating default admin user...');
    console.log(`Admin Email: ${adminEmail}`);
    console.log(`Admin Password: ${adminPassword}`);
    
    const passwordHash = hashPassword(adminPassword);
    
    db.prepare(`
      INSERT INTO users (email, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, 'admin')
    `).run(adminEmail, passwordHash, 'Admin', 'User');
    
    console.log('Default admin user created successfully!');
  }
}

// Initialize default admin
createDefaultAdmin();

// Ensure all tables exist with proper schema
try {
  // Check if hotel_profiles table exists and has correct columns
  const tableInfo = db.prepare("PRAGMA table_info(hotel_profiles)").all();
  console.log('Hotel profiles table info:', tableInfo);
  
  if (tableInfo.length === 0) {
    console.log('Creating hotel_profiles table...');
    db.exec(`
      CREATE TABLE hotel_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hotel_id INTEGER NOT NULL,
        profile_data TEXT NOT NULL,
        files_data TEXT,
        status TEXT DEFAULT 'pending',
        submitted_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id)
      );
    `);
  }
} catch (e) {
  console.log('Database table check/creation completed');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT UNIQUE NOT NULL,
    request_type TEXT DEFAULT 'mission',
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    organization TEXT NOT NULL,
    event_title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    location TEXT NOT NULL,
    attendees INTEGER NOT NULL,
    services TEXT,
    budget_range TEXT,
    requirements TEXT NOT NULL,
    urgency_level TEXT,
    emergency_phone TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// --- lightweight migrations for existing databases ---
function ensureColumn(table, column, definition) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const has = cols.some(c => String(c.name).toLowerCase() === String(column).toLowerCase());
    if (!has) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
      console.log(`[migrate] added ${table}.${column}`);
    }
  } catch (e) {
    console.warn(`[migrate] failed adding ${table}.${column}:`, e?.message || e);
  }
}

ensureColumn('signed_agreements', 'signature_path', 'signature_path TEXT');
db.exec(`
  CREATE TABLE IF NOT EXISTS user_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    form_data TEXT NOT NULL,
    current_page INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
// ---------- SAM.gov integration ----------
app.get('/api/sam/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const naics = String(req.query.naics || '721110');
    const limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 1000); // SAM API max is 1000
    const apiKey = process.env.SAM_API_KEY;

    if (!apiKey) {
      // Enhanced demo data with proper SAM.gov structure
      const demoResults = [
        {
          title: 'Hotel and Conference Center Services - Multi-Year BPA',
          solicitationNumber: 'W52P1J-25-R-0001',
          fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.US ARMY CONTRACTING COMMAND',
          department: 'Department of Defense',
          postedDate: '2025-09-15T00:00:00.000Z',
          responseDeadline: '2025-10-15T23:59:59.000Z',
          naicsCode: '721110',
          type: 'Solicitation',
          active: 'Yes',
          setAside: 'Total Small Business Set-Aside',
          description: 'https://api.sam.gov/opportunities/v2/search/description?noticeid=demo1',
          uiLink: 'https://sam.gov/opp/demo1'
        },
        {
          title: 'Extended Stay Lodging Services - OCONUS',
          solicitationNumber: 'HQ0034-25-R-0123',
          fullParentPathName: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY',
          department: 'Department of Defense',
          postedDate: '2025-09-10T00:00:00.000Z',
          responseDeadline: '2025-10-20T23:59:59.000Z',
          naicsCode: '721110',
          type: 'Solicitation',
          active: 'Yes',
          setAside: 'None',
          description: 'https://api.sam.gov/opportunities/v2/search/description?noticeid=demo2',
          uiLink: 'https://sam.gov/opp/demo2'
        },
        {
          title: 'Conference and Meeting Facility Services',
          solicitationNumber: 'VA-262-25-R-0456',
          fullParentPathName: 'DEPT OF VETERANS AFFAIRS.VETERANS HEALTH ADMINISTRATION',
          department: 'Department of Veterans Affairs',
          postedDate: '2025-09-05T00:00:00.000Z',
          responseDeadline: '2025-10-05T23:59:59.000Z',
          naicsCode: '721110',
          type: 'Sources Sought',
          active: 'Yes',
          setAside: 'Service-Disabled Veteran-Owned Small Business Set-Aside',
          description: 'https://api.sam.gov/opportunities/v2/search/description?noticeid=demo3',
          uiLink: 'https://sam.gov/opp/demo3'
        }
      ];

      return ok(res, {
        totalRecords: demoResults.length,
        limit: limit,
        offset: 0,
        opportunitiesData: demoResults,
        query: { q, naics, limit },
        note: 'Demo data - Configure SAM_API_KEY for live SAM.gov search results'
      });
    }

    // Real SAM.gov API call using correct v2 endpoint
    const samUrl = 'https://api.sam.gov/opportunities/v2/search';
    
    // Calculate and validate date range (REQUIRED by SAM API - MM/dd/yyyy format)
    const formatDate = (date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };

    const mmddyyyy = /^\d{2}\/\d{2}\/\d{4}$/;
    const parseMmddyyyy = (s) => {
      if (!s || !mmddyyyy.test(s)) return null;
      const [m, d, y] = s.split('/').map(Number);
      const dt = new Date(y, m - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
      return dt;
    };

    const today = new Date();
    const defaultFrom = new Date();
    defaultFrom.setDate(today.getDate() - 60);

    const fromDt = parseMmddyyyy(String(req.query.postedFrom || '').trim()) || defaultFrom;
    const toDt = parseMmddyyyy(String(req.query.postedTo || '').trim()) || today;

    // Enforce max 60-day range per SAM constraints
    const diffMs = toDt - fromDt;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 60) {
      return fail(res, 400, 'Date range must be 60 days or less');
    }

    const postedFrom = formatDate(fromDt);
    const postedTo = formatDate(toDt);
    
    // Cap limit at 1000 to avoid SAM blocking
    const safeLimit = Math.min(Number.isFinite(limit) ? limit : 10, 1000);
    const params = new URLSearchParams({
      api_key: apiKey,
      postedFrom: postedFrom, // REQUIRED - MM/dd/yyyy format
      postedTo: postedTo, // REQUIRED - MM/dd/yyyy format
      limit: String(safeLimit),
      offset: String(parseInt(req.query.offset || '0', 10) || 0)
    });
    
    // Add optional parameters only if they have values
    if (q && q.trim()) {
      params.append('title', q.trim());
    }
    if (naics && naics.trim()) {
      params.append('ncode', naics.trim());
    }
    // Default to solicitations if no specific type requested
    params.append('ptype', 'o');

    console.log(`SAM API URL: ${samUrl}?${params}`);
    let response;
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
      
      response = await fetch(`${samUrl}?${params}`, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log(`SAM API response status: ${response.status} ${response.statusText}`);
    } catch (error) {
      console.log(`SAM API network error: ${error.message} - falling back to demo data`);
      // Network error - fall back to demo data
      const demoResults = [
        {
          title: 'Hotel and Conference Center Services - Multi-Year BPA',
          solicitationNumber: 'W52P1J-25-R-0001',
          fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.US ARMY CONTRACTING COMMAND',
          department: 'Department of Defense',
          postedDate: '2025-09-15T00:00:00.000Z',
          responseDeadline: '2025-10-15T23:59:59.000Z',
          naicsCode: '721110',
          type: 'Solicitation',
          active: 'Yes',
          setAside: 'Total Small Business Set-Aside'
        }
      ];

      return ok(res, {
        totalRecords: demoResults.length,
        limit: limit,
        offset: 0,
        results: demoResults.map(opp => ({
          id: opp.solicitationNumber,
          title: opp.title,
          agency: opp.fullParentPathName || opp.department,
          postedDate: opp.postedDate ? opp.postedDate.split('T')[0] : null,
          responseDeadline: opp.responseDeadLine ? opp.responseDeadLine.split('T')[0] : null,
          naics: opp.naicsCode,
          type: opp.type,
          setAside: opp.setAside,
          solicitationNumber: opp.solicitationNumber,
          active: opp.active,
          description: 'View full details on SAM.gov'
        })),
        query: { q, naics, limit, postedFrom, postedTo },
        note: 'Demo data - SAM API network error. Configure SAM_API_KEY and check connectivity.'
      });
    }

    if (!response.ok) {
      console.log(`SAM API error: ${response.status} ${response.statusText} - falling back to demo data`);
      const errorText = await response.text();
      console.log(`SAM API error details: ${errorText}`);
      
      // Fall back to demo data if API fails
      const demoResults = [
        {
          title: 'Hotel and Conference Center Services - Multi-Year BPA',
          solicitationNumber: 'W52P1J-25-R-0001',
          fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.US ARMY CONTRACTING COMMAND',
          department: 'Department of Defense',
          postedDate: '2025-09-15T00:00:00.000Z',
          responseDeadline: '2025-10-15T23:59:59.000Z',
          naicsCode: '721110',
          type: 'Solicitation',
          active: 'Yes',
          setAside: 'Total Small Business Set-Aside',
          description: 'https://api.sam.gov/opportunities/v2/search/description?noticeid=demo1',
          uiLink: 'https://sam.gov/opp/demo1'
        },
        {
          title: 'Extended Stay Lodging Services - OCONUS',
          solicitationNumber: 'HQ0034-25-R-0123',
          fullParentPathName: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY',
          department: 'Department of Defense',
          postedDate: '2025-09-10T00:00:00.000Z',
          responseDeadline: '2025-10-20T23:59:59.000Z',
          naicsCode: '721110',
          type: 'Solicitation',
          active: 'Yes',
          setAside: 'None',
          description: 'https://api.sam.gov/opportunities/v2/search/description?noticeid=demo2',
          uiLink: 'https://sam.gov/opp/demo2'
        }
      ];

      return ok(res, {
        totalRecords: demoResults.length,
        limit: limit,
        offset: 0,
        results: demoResults.map(opp => ({
          id: opp.solicitationNumber,
          title: opp.title,
          agency: opp.fullParentPathName || opp.department,
          postedDate: opp.postedDate ? opp.postedDate.split('T')[0] : null,
          responseDeadline: opp.responseDeadLine ? opp.responseDeadLine.split('T')[0] : null,
          naics: opp.naicsCode,
          type: opp.type,
          setAside: opp.setAside,
          solicitationNumber: opp.solicitationNumber,
          active: opp.active,
          uiLink: opp.uiLink,
          description: opp.description || 'View full details on SAM.gov'
        })),
        query: { q, naics, limit, postedFrom, postedTo },
        note: `Demo data - SAM API error ${response.status}: ${response.statusText}. Check API key and parameters.`
      });
    }

    const data = await response.json();
    console.log('SAM API response structure:', Object.keys(data));
    console.log('SAM API total records:', data.totalRecords);
    console.log('SAM API opportunitiesData length:', (data.opportunitiesData || []).length);
    
    const opportunities = data.opportunitiesData || [];
    console.log('Processing', opportunities.length, 'opportunities');

    const results = opportunities.map(opp => ({
      id: opp.solicitationNumber || opp.noticeId,
      title: opp.title || 'Untitled',
      agency: opp.fullParentPathName || opp.department || 'Unknown Agency',
      postedDate: opp.postedDate ? opp.postedDate.split('T')[0] : null,
      responseDeadline: opp.responseDeadLine ? opp.responseDeadLine.split('T')[0] : null, // Note: API uses 'responseDeadLine'
      naics: opp.naicsCode,
      type: opp.type,
      setAside: opp.setAside || opp.typeOfSetAsideDescription,
      setAsideCode: opp.setAsideCode || opp.typeOfSetAside,
      solicitationNumber: opp.solicitationNumber,
      active: opp.active,
      uiLink: opp.uiLink,
      description: opp.description || 'View full details on SAM.gov',
      resourceLinks: Array.isArray(opp.resourceLinks) ? opp.resourceLinks : [],
      organizationType: opp.organizationType,
      classificationCode: opp.classificationCode,
      lastUpdatedDate: opp.lastUpdatedDate ? opp.lastUpdatedDate.split('T')[0] : null,
      publishedDate: opp.publishedDate ? opp.publishedDate.split('T')[0] : null,
      officeAddress: opp.officeAddress,
      pointOfContact: opp.pointOfContact
    }));

    console.log('Mapped', results.length, 'results');
    console.log('First result:', results[0]);

    return ok(res, {
      totalRecords: data.totalRecords || results.length,
      limit: data.limit || limit,
      offset: data.offset || 0,
      results,
      query: { q, naics, limit, postedFrom, postedTo },
      source: 'SAM.gov Official API'
    });
  } catch (e) {
    console.error('SAM search error:', e);
    return fail(res, 500, 'SAM search failed', { detail: String(e.message || e) });
  }
});

// QR Code generation endpoint
app.get('/api/qr/:data', async (req, res) => {
  try {
    const data = decodeURIComponent(req.params.data);
    const qrCodeDataURL = await QRCode.toDataURL(data, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(qrCodeDataURL.split(',')[1], 'base64'));
  } catch (error) {
    console.error('QR Code generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});
// Unified SAM.gov proxy matching Next.js example
app.get('/api/opps', async (req, res) => {
  try {
    const API_BASE = process.env.SAM_API_BASE || 'https://api.sam.gov/opportunities/v2/search';
    const API_KEY = process.env.SAM_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({ error: 'Missing SAM_API_KEY on server' });
    }

    const extractNoticeId = (v) => {
      const m = String(v || '').match(/[0-9a-fA-F]{32}/);
      return m ? m[0].toLowerCase() : '';
    };
    const pick = (k) => {
      const v = req.query[k];
      if (Array.isArray(v)) return (v[0] || '').trim();
      return (String(v || '')).trim();
    };

    const postedFrom = pick('postedFrom') || '08/24/2025';
    const postedTo   = pick('postedTo')   || '09/23/2025';

    const p = new URLSearchParams();
    p.set('postedFrom', postedFrom);
    p.set('postedTo', postedTo);
    p.set('api_key', API_KEY);

    const allow = ['ptype','limit','offset','ncode','ccode','state','zip','organizationName','solnum','noticeid','noticeId','solicitationNumber','title','rdlfrom','rdlto'];
    for (const k of allow) {
      const v = pick(k);
      if (v) p.set(k, v);
    }

    const rawNotice = pick('noticeid') || pick('noticeId');
    const noticeid = extractNoticeId(rawNotice);
    if (noticeid) {
      p.set('noticeid', noticeid);
      p.set('noticeId', noticeid);
      ['title','ncode','ccode','state','zip','organizationName','ptype'].forEach(k => p.delete(k));
    }

    if (!p.has('limit'))  p.set('limit', '100');
    if (!p.has('offset')) p.set('offset', '0');

    const samUrl = `${API_BASE}?${p.toString()}`;
    const r = await fetch(samUrl, { headers: { Accept: 'application/json' } });
    const text = await r.text();

    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: 'SAM.gov lookup error', status: r.status, url: samUrl, body: text });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Internal error', details: String(e) });
  }
});

// Lookup a single SAM.gov notice (solicitation) by ID
app.get('/api/sam/notice/:id', async (req, res) => {
  try {
    const noticeId = String(req.params.id || '').trim().toLowerCase();
    if (!noticeId) return fail(res, 400, 'Notice ID is required');

    const apiKey = process.env.SAM_API_KEY;
    if (!apiKey) {
      // Demo fallback
      const demo = {
        id: noticeId,
        solicitationNumber: noticeId,
        title: 'Demo Solicitation Title',
        agency: 'Demo Agency',
        postedDate: '2025-09-10',
        responseDeadline: '2025-10-10',
        naics: '721110',
        type: 'Solicitation',
        setAside: 'Total Small Business',
        description: 'Demo description. Configure SAM_API_KEY for live data.',
        uiLink: `https://sam.gov/opp/${encodeURIComponent(noticeId)}`
      };
      return ok(res, { ok: true, notice: demo, source: 'demo' });
    }

    // Build a search query filtered to a wide date window (≤ 1 year) and specific notice ID
    const samUrl = 'https://api.sam.gov/opportunities/v2/search';
    const today = new Date();
    const yearAgo = new Date();
    yearAgo.setFullYear(today.getFullYear() - 1);
    const formatDate = (d) => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    const postedFrom = formatDate(yearAgo);
    const postedTo = formatDate(today);

    const params = new URLSearchParams({
      api_key: apiKey,
      postedFrom,
      postedTo,
      limit: '1',
      offset: '0'
    });
    // Many SAM environments allow noticeid query; include both common keys
    params.append('noticeid', noticeId);

    let response;
    try {
      response = await fetch(`${samUrl}?${params}`, { headers: { 'Accept': 'application/json' }, timeout: 10000 });
    } catch (err) {
      return fail(res, 502, 'SAM.gov lookup failed', { detail: String(err.message || err) });
    }

    if (!response.ok) {
      let raw = '';
      try { raw = await response.text(); } catch {}
      return fail(res, response.status, 'SAM.gov lookup error', { statusText: response.statusText, raw });
    }

    const data = await response.json();
    const opp = (data.opportunitiesData || [])[0];
    if (!opp) return fail(res, 404, 'Notice not found');

    const notice = {
      id: opp.solicitationNumber || opp.noticeId || noticeId,
      solicitationNumber: opp.solicitationNumber || opp.noticeId || noticeId,
      title: opp.title || 'Untitled',
      agency: opp.fullParentPathName || opp.department || 'Unknown Agency',
      postedDate: opp.postedDate ? opp.postedDate.split('T')[0] : null,
      responseDeadline: opp.responseDeadLine ? opp.responseDeadLine.split('T')[0] : null,
      naics: opp.naicsCode,
      type: opp.type,
      setAside: opp.setAside,
      setAsideCode: opp.setAsideCode,
      active: opp.active,
      uiLink: opp.uiLink,
      description: opp.description || 'View full details on SAM.gov',
      organizationType: opp.organizationType,
      classificationCode: opp.classificationCode
    };

    return ok(res, { ok: true, notice, source: 'SAM.gov Official API' });
  } catch (e) {
    return fail(res, 500, 'Notice lookup failed', { detail: String(e.message || e) });
  }
});

// Admin convenience endpoints for frontend pages expecting admin-style routes
app.get('/api/admin/solicitation/:id', async (req, res) => {
  // Delegate to the SAM notice endpoint
  try {
    const r = await fetch(`http://localhost:${process.env.PORT || 7070}/api/sam/notice/${encodeURIComponent(req.params.id)}`);
    const data = await r.json();
    if (!data || data.error) return fail(res, 404, data?.error || 'Not found');

    // Adapt shape to what admin UI expects
    const s = data.notice;
    return ok(res, {
      ok: true,
      solicitation: {
        solicitation_number: s.solicitationNumber,
        title: s.title,
        agency: s.agency,
        location: '',
        naics_code: s.naics,
        response_deadline: s.responseDeadline,
        set_aside: s.setAside,
        description: s.description,
        requirements: ''
      }
    });
  } catch (e) {
    return fail(res, 500, 'Admin solicitation lookup failed', { detail: String(e.message || e) });
  }
});

// Stub: Create a contract from a solicitation ID (can be expanded later)
app.post('/api/admin/solicitation/:id/create-contract', async (req, res) => {
  try {
    // In a fuller implementation, we would persist a new contract row here using the solicitation data
    return ok(res, { ok: true, message: 'Contract created from solicitation (stub)' });
  } catch (e) {
    return fail(res, 500, 'Create from solicitation failed', { detail: String(e.message || e) });
  }
});

// Compatibility endpoint: /api/opps?noticeid=...&postedFrom=MM/dd/yyyy&postedTo=MM/dd/yyyy&limit=1
// This mirrors common SAM starter samples and forwards to our existing logic
app.get('/api/opps', async (req, res) => {
  try {
    const noticeid = String(req.query.noticeid || '').trim().toLowerCase();
    const postedFrom = String(req.query.postedFrom || '').trim();
    const postedTo = String(req.query.postedTo || '').trim();
    const limit = String(req.query.limit || '1');

    if (noticeid) {
      // Delegate to our notice lookup
      const r = await fetch(`http://localhost:${process.env.PORT || 7070}/api/sam/notice/${encodeURIComponent(noticeid)}`);
      const data = await r.json();
      if (!data || data.error) return fail(res, 404, data?.error || 'Not found', { detail: data?.detail, raw: data?.raw });
      return ok(res, { ok: true, totalRecords: 1, results: [data.notice] });
    }

    // Otherwise, perform a search with provided window (SAM requires a window)
    const params = new URLSearchParams();
    if (postedFrom) params.set('postedFrom', postedFrom);
    if (postedTo) params.set('postedTo', postedTo);
    params.set('limit', limit);

    const r = await fetch(`http://localhost:${process.env.PORT || 7070}/api/sam/search?${params.toString()}`);
    const data = await r.json();
    if (!data || data.error) return fail(res, 400, data?.error || 'Search failed', { detail: data?.detail });
    return ok(res, data);
  } catch (e) {
    return fail(res, 500, 'Opps endpoint failed', { detail: String(e.message || e) });
  }
});

app.post('/api/sam/search-and-email', async (req, res) => {
  try {
    const { email, keywords = [], naics = '721110' } = req.body || {};
    if (!email) return fail(res, 400, 'Email is required');

    const q = (Array.isArray(keywords) ? keywords : String(keywords||'').split(',')).map(s=>String(s||'').trim()).filter(Boolean).join(' OR ') || 'lodging OR hotel OR conference';

    // Fetch real results via our search endpoint
    const searchResponse = await fetch(`http://localhost:${process.env.PORT || 7070}/api/sam/search?${new URLSearchParams({ q, naics, limit: '20' })}`);
    const searchData = await searchResponse.json();
    const results = searchData.results || [];

    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
        <h2>SAM.gov Search Results</h2>
        <p><b>Query:</b> ${q} | <b>NAICS:</b> ${naics}</p>
        <ol>${results.slice(0, 10).map(r=>`<li><b>${r.title}</b> – ${r.agency}<br><small>Posted: ${r.postedDate || 'N/A'} | Deadline: ${r.responseDeadline || 'N/A'}</small></li>`).join('')}</ol>
        <p style="color:#6b7280">Found ${results.length} opportunities. Visit <a href="https://sam.gov">sam.gov</a> for full details.</p>
      </div>`;

    try {
      await sendMail({ to: email, subject: 'SAM.gov search results', html });
    } catch (mailErr) {
      return fail(res, 500, 'Email send failed', { detail: String(mailErr?.message || mailErr) });
    }
    return ok(res, { message: 'Results emailed.' });
  } catch (e) {
    return fail(res, 500, 'Search-and-email failed', { detail: String(e.message || e) });
  }
});
// ---------- Enhanced Per Diem API ----------
app.get('/api/perdiem', async (req, res) => {
  try {
    const city  = (req.query.city  || '').trim();
    const state = (req.query.state || '').trim();
    const zip   = (req.query.zip   || '').trim();
    const month = (req.query.month || '').trim(); // "01"-"12"
    const year  = (req.query.year  || '').trim(); // "2025"

    // Mock data for demonstration (replace with real GSA API when key is available)
    const mockData = {
      'AL': [
        { location: 'Birmingham, AL', lodging: 110, mie: 74 },
        { location: 'Montgomery, AL', lodging: 100, mie: 74 },
        { location: 'Mobile, AL', lodging: 105, mie: 74 },
        { location: 'Huntsville, AL', lodging: 115, mie: 74 }
      ],
      'AK': [
        { location: 'Anchorage, AK', lodging: 150, mie: 74 },
        { location: 'Fairbanks, AK', lodging: 140, mie: 74 },
        { location: 'Juneau, AK', lodging: 160, mie: 74 }
      ],
      'AZ': [
        { location: 'Phoenix, AZ', lodging: 130, mie: 74 },
        { location: 'Tucson, AZ', lodging: 120, mie: 74 },
        { location: 'Scottsdale, AZ', lodging: 180, mie: 74 },
        { location: 'Flagstaff, AZ', lodging: 110, mie: 74 }
      ],
      'AR': [
        { location: 'Little Rock, AR', lodging: 110, mie: 74 },
        { location: 'Fayetteville, AR', lodging: 105, mie: 74 },
        { location: 'Hot Springs, AR', lodging: 100, mie: 74 }
      ],
      'CA': [
        { location: 'Los Angeles, CA', lodging: 180, mie: 74 },
        { location: 'San Francisco, CA', lodging: 220, mie: 74 },
        { location: 'San Diego, CA', lodging: 160, mie: 74 },
        { location: 'Sacramento, CA', lodging: 120, mie: 74 },
        { location: 'San Jose, CA', lodging: 200, mie: 74 },
        { location: 'Oakland, CA', lodging: 170, mie: 74 },
        { location: 'Fresno, CA', lodging: 110, mie: 74 },
        { location: 'Long Beach, CA', lodging: 150, mie: 74 }
      ],
      'CO': [
        { location: 'Denver, CO', lodging: 140, mie: 74 },
        { location: 'Colorado Springs, CO', lodging: 120, mie: 74 },
        { location: 'Boulder, CO', lodging: 150, mie: 74 },
        { location: 'Aspen, CO', lodging: 250, mie: 74 }
      ],
      'CT': [
        { location: 'Hartford, CT', lodging: 130, mie: 74 },
        { location: 'New Haven, CT', lodging: 140, mie: 74 },
        { location: 'Stamford, CT', lodging: 180, mie: 74 },
        { location: 'Bridgeport, CT', lodging: 120, mie: 74 }
      ],
      'DE': [
        { location: 'Wilmington, DE', lodging: 120, mie: 74 },
        { location: 'Dover, DE', lodging: 110, mie: 74 }
      ],
      'DC': [
        { location: 'Washington, DC', lodging: 200, mie: 74 }
      ],
      'FL': [
        { location: 'Miami, FL', lodging: 180, mie: 74 },
        { location: 'Orlando, FL', lodging: 120, mie: 74 },
        { location: 'Tampa, FL', lodging: 110, mie: 74 },
        { location: 'Jacksonville, FL', lodging: 105, mie: 74 },
        { location: 'Fort Lauderdale, FL', lodging: 160, mie: 74 },
        { location: 'Tallahassee, FL', lodging: 100, mie: 74 },
        { location: 'Key West, FL', lodging: 200, mie: 74 }
      ],
      'GA': [
        { location: 'Atlanta, GA', lodging: 130, mie: 74 },
        { location: 'Savannah, GA', lodging: 120, mie: 74 },
        { location: 'Augusta, GA', lodging: 110, mie: 74 },
        { location: 'Columbus, GA', lodging: 105, mie: 74 }
      ],
      'HI': [
        { location: 'Honolulu, HI', lodging: 200, mie: 74 },
        { location: 'Maui, HI', lodging: 220, mie: 74 },
        { location: 'Kauai, HI', lodging: 180, mie: 74 }
      ],
      'ID': [
        { location: 'Boise, ID', lodging: 110, mie: 74 },
        { location: 'Coeur d\'Alene, ID', lodging: 120, mie: 74 }
      ],
      'IL': [
        { location: 'Chicago, IL', lodging: 180, mie: 74 },
        { location: 'Springfield, IL', lodging: 110, mie: 74 },
        { location: 'Rockford, IL', lodging: 105, mie: 74 },
        { location: 'Peoria, IL', lodging: 100, mie: 74 }
      ],
      'IN': [
        { location: 'Indianapolis, IN', lodging: 120, mie: 74 },
        { location: 'Fort Wayne, IN', lodging: 110, mie: 74 },
        { location: 'Evansville, IN', lodging: 105, mie: 74 }
      ],
      'IA': [
        { location: 'Des Moines, IA', lodging: 110, mie: 74 },
        { location: 'Cedar Rapids, IA', lodging: 105, mie: 74 },
        { location: 'Davenport, IA', lodging: 100, mie: 74 }
      ],
      'KS': [
        { location: 'Wichita, KS', lodging: 110, mie: 74 },
        { location: 'Kansas City, KS', lodging: 120, mie: 74 },
        { location: 'Topeka, KS', lodging: 105, mie: 74 }
      ],
      'KY': [
        { location: 'Louisville, KY', lodging: 120, mie: 74 },
        { location: 'Lexington, KY', lodging: 110, mie: 74 },
        { location: 'Bowling Green, KY', lodging: 105, mie: 74 }
      ],
      'LA': [
        { location: 'New Orleans, LA', lodging: 150, mie: 74 },
        { location: 'Baton Rouge, LA', lodging: 120, mie: 74 },
        { location: 'Shreveport, LA', lodging: 110, mie: 74 }
      ],
      'ME': [
        { location: 'Portland, ME', lodging: 130, mie: 74 },
        { location: 'Bangor, ME', lodging: 110, mie: 74 }
      ],
      'MD': [
        { location: 'Baltimore, MD', lodging: 140, mie: 74 },
        { location: 'Annapolis, MD', lodging: 130, mie: 74 },
        { location: 'Frederick, MD', lodging: 120, mie: 74 }
      ],
      'MA': [
        { location: 'Boston, MA', lodging: 200, mie: 74 },
        { location: 'Worcester, MA', lodging: 130, mie: 74 },
        { location: 'Springfield, MA', lodging: 120, mie: 74 },
        { location: 'Cambridge, MA', lodging: 180, mie: 74 }
      ],
      'MI': [
        { location: 'Detroit, MI', lodging: 130, mie: 74 },
        { location: 'Grand Rapids, MI', lodging: 120, mie: 74 },
        { location: 'Ann Arbor, MI', lodging: 140, mie: 74 },
        { location: 'Lansing, MI', lodging: 110, mie: 74 }
      ],
      'MN': [
        { location: 'Minneapolis, MN', lodging: 140, mie: 74 },
        { location: 'Saint Paul, MN', lodging: 130, mie: 74 },
        { location: 'Rochester, MN', lodging: 120, mie: 74 }
      ],
      'MS': [
        { location: 'Jackson, MS', lodging: 110, mie: 74 },
        { location: 'Gulfport, MS', lodging: 120, mie: 74 },
        { location: 'Biloxi, MS', lodging: 130, mie: 74 }
      ],
      'MO': [
        { location: 'Kansas City, MO', lodging: 120, mie: 74 },
        { location: 'Saint Louis, MO', lodging: 130, mie: 74 },
        { location: 'Springfield, MO', lodging: 110, mie: 74 }
      ],
      'MT': [
        { location: 'Billings, MT', lodging: 110, mie: 74 },
        { location: 'Missoula, MT', lodging: 120, mie: 74 },
        { location: 'Bozeman, MT', lodging: 130, mie: 74 }
      ],
      'NE': [
        { location: 'Omaha, NE', lodging: 120, mie: 74 },
        { location: 'Lincoln, NE', lodging: 110, mie: 74 }
      ],
      'NV': [
        { location: 'Las Vegas, NV', lodging: 150, mie: 74 },
        { location: 'Reno, NV', lodging: 120, mie: 74 },
        { location: 'Carson City, NV', lodging: 110, mie: 74 }
      ],
      'NH': [
        { location: 'Manchester, NH', lodging: 120, mie: 74 },
        { location: 'Concord, NH', lodging: 110, mie: 74 }
      ],
      'NJ': [
        { location: 'Newark, NJ', lodging: 150, mie: 74 },
        { location: 'Jersey City, NJ', lodging: 160, mie: 74 },
        { location: 'Trenton, NJ', lodging: 130, mie: 74 }
      ],
      'NM': [
        { location: 'Albuquerque, NM', lodging: 120, mie: 74 },
        { location: 'Santa Fe, NM', lodging: 140, mie: 74 },
        { location: 'Las Cruces, NM', lodging: 110, mie: 74 }
      ],
      'NY': [
        { location: 'New York, NY', lodging: 280, mie: 74 },
        { location: 'Albany, NY', lodging: 120, mie: 74 },
        { location: 'Buffalo, NY', lodging: 100, mie: 74 },
        { location: 'Rochester, NY', lodging: 110, mie: 74 },
        { location: 'Syracuse, NY', lodging: 105, mie: 74 },
        { location: 'Yonkers, NY', lodging: 150, mie: 74 }
      ],
      'NC': [
        { location: 'Charlotte, NC', lodging: 130, mie: 74 },
        { location: 'Raleigh, NC', lodging: 120, mie: 74 },
        { location: 'Greensboro, NC', lodging: 110, mie: 74 },
        { location: 'Durham, NC', lodging: 125, mie: 74 }
      ],
      'ND': [
        { location: 'Fargo, ND', lodging: 110, mie: 74 },
        { location: 'Bismarck, ND', lodging: 105, mie: 74 }
      ],
      'OH': [
        { location: 'Columbus, OH', lodging: 120, mie: 74 },
        { location: 'Cleveland, OH', lodging: 130, mie: 74 },
        { location: 'Cincinnati, OH', lodging: 125, mie: 74 },
        { location: 'Toledo, OH', lodging: 110, mie: 74 }
      ],
      'OK': [
        { location: 'Oklahoma City, OK', lodging: 110, mie: 74 },
        { location: 'Tulsa, OK', lodging: 115, mie: 74 }
      ],
      'OR': [
        { location: 'Portland, OR', lodging: 140, mie: 74 },
        { location: 'Eugene, OR', lodging: 120, mie: 74 },
        { location: 'Salem, OR', lodging: 110, mie: 74 }
      ],
      'PA': [
        { location: 'Philadelphia, PA', lodging: 150, mie: 74 },
        { location: 'Pittsburgh, PA', lodging: 130, mie: 74 },
        { location: 'Harrisburg, PA', lodging: 120, mie: 74 },
        { location: 'Allentown, PA', lodging: 110, mie: 74 }
      ],
      'RI': [
        { location: 'Providence, RI', lodging: 130, mie: 74 }
      ],
      'SC': [
        { location: 'Columbia, SC', lodging: 110, mie: 74 },
        { location: 'Charleston, SC', lodging: 140, mie: 74 },
        { location: 'Greenville, SC', lodging: 120, mie: 74 }
      ],
      'SD': [
        { location: 'Sioux Falls, SD', lodging: 110, mie: 74 },
        { location: 'Rapid City, SD', lodging: 115, mie: 74 }
      ],
      'TN': [
        { location: 'Nashville, TN', lodging: 130, mie: 74 },
        { location: 'Memphis, TN', lodging: 120, mie: 74 },
        { location: 'Knoxville, TN', lodging: 110, mie: 74 },
        { location: 'Chattanooga, TN', lodging: 115, mie: 74 }
      ],
      'TX': [
        { location: 'Houston, TX', lodging: 140, mie: 74 },
        { location: 'Dallas, TX', lodging: 130, mie: 74 },
        { location: 'Austin, TX', lodging: 150, mie: 74 },
        { location: 'San Antonio, TX', lodging: 120, mie: 74 },
        { location: 'Fort Worth, TX', lodging: 125, mie: 74 },
        { location: 'El Paso, TX', lodging: 110, mie: 74 },
        { location: 'Corpus Christi, TX', lodging: 115, mie: 74 }
      ],
      'UT': [
        { location: 'Salt Lake City, UT', lodging: 120, mie: 74 },
        { location: 'Provo, UT', lodging: 110, mie: 74 },
        { location: 'Park City, UT', lodging: 180, mie: 74 }
      ],
      'VT': [
        { location: 'Burlington, VT', lodging: 130, mie: 74 },
        { location: 'Montpelier, VT', lodging: 120, mie: 74 }
      ],
      'VA': [
        { location: 'Richmond, VA', lodging: 120, mie: 74 },
        { location: 'Virginia Beach, VA', lodging: 130, mie: 74 },
        { location: 'Norfolk, VA', lodging: 125, mie: 74 },
        { location: 'Arlington, VA', lodging: 180, mie: 74 }
      ],
      'WA': [
        { location: 'Seattle, WA', lodging: 180, mie: 74 },
        { location: 'Spokane, WA', lodging: 120, mie: 74 },
        { location: 'Tacoma, WA', lodging: 130, mie: 74 },
        { location: 'Vancouver, WA', lodging: 125, mie: 74 }
      ],
      'WV': [
        { location: 'Charleston, WV', lodging: 110, mie: 74 },
        { location: 'Huntington, WV', lodging: 105, mie: 74 }
      ],
      'WI': [
        { location: 'Milwaukee, WI', lodging: 130, mie: 74 },
        { location: 'Madison, WI', lodging: 120, mie: 74 },
        { location: 'Green Bay, WI', lodging: 110, mie: 74 }
      ],
      'WY': [
        { location: 'Cheyenne, WY', lodging: 110, mie: 74 },
        { location: 'Jackson, WY', lodging: 200, mie: 74 }
      ]
    };

    // Real GSA API integration
    const apiKey = process.env.GSA_API_KEY;
    if (!apiKey) {
      // Fallback to mock data if no API key
      console.log('No GSA_API_KEY found, using mock data');
      const monthNum = month ? parseInt(String(month).padStart(2,'0'), 10) : null;
      const applyMonthVariation = (baseLodging) => {
        if (!monthNum || Number.isNaN(monthNum)) return baseLodging;
        // Deterministic month-based variation: peak in summer/fall, dip in winter
        const monthAdjust = [0, 0, 2, 4, 6, 8, 10, 12, 8, 4, 2, 0]; // Jan..Dec
        const idx = Math.min(Math.max(monthNum, 1), 12) - 1;
        return Math.max(0, Math.round(baseLodging + monthAdjust[idx]));
      };

      if (state && mockData[state]) {
        const rows = mockData[state].map(r => ({
          location: r.location,
          lodging: applyMonthVariation(r.lodging),
          mie: r.mie
        }));
        return res.json({ rows });
      } else if (zip) {
        const base = 120;
        return res.json({ rows: [{ location: `ZIP ${zip}`, lodging: applyMonthVariation(base), mie: 74 }] });
      } else if (city) {
        const base = 120;
        return res.json({ rows: [{ location: `${city}, ${state || 'US'}`, lodging: applyMonthVariation(base), mie: 74 }] });
      } else {
        return res.json({ rows: [] });
      }
    }

    console.log('Using GSA API with key:', apiKey.substring(0, 10) + '...');

    const base = "https://api.gsa.gov/travel/perdiem/v2/rates";
    let url;

    if (zip) {
      url = `${base}/zip/${encodeURIComponent(zip)}/year/${year || new Date().getFullYear()}`;
    } else if (city && state) {
      const cleanCity = city.replace(/[.']/g, '').replace(/[-]/g, ' ');
      url = `${base}/city/${encodeURIComponent(cleanCity)}/state/${encodeURIComponent(state)}/year/${year || new Date().getFullYear()}`;
    } else if (state) {
      url = `${base}/state/${encodeURIComponent(state)}/year/${year || new Date().getFullYear()}`;
    } else {
      return res.json({ rows: [] }); // nothing to query
    }

    console.log('GSA API URL:', url);

    const r = await fetch(url, { 
      headers: { 
        'X-API-KEY': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'FEDEVENT/1.0'
      },
      timeout: 15000
    });

    if (!r.ok) {
      console.error('GSA API error:', r.status, r.statusText);
      const errorText = await r.text();
      console.error('Error details:', errorText);
      
      // Fallback to mock data on API error
      if (state && mockData[state]) {
        return res.json({ rows: mockData[state], note: 'Using mock data due to API error' });
      } else {
        return res.status(502).json({ error: "GSA API error", detail: errorText });
      }
    }

    const data = await r.json();
    console.log('GSA API response:', JSON.stringify(data, null, 2));

    // --- Normalize into rows[] ---
    let rows = [];

    const maybePush = (loc) => {
      const location = String(loc?.location || loc?.city || loc?.name || "").trim();
      const lodging  = Number(loc?.lodging ?? loc?.lodging_rate ?? loc?.rates?.lodging ?? 0);
      const mie      = Number(loc?.mie ?? loc?.mie_rate ?? loc?.rates?.mie ?? 0);
      if (location || lodging || mie) {
        rows.push({ location: location || "—", lodging, mie });
      }
    };

    // Handle GSA API response format
    if (Array.isArray(data?.rates)) {
      for (const rate of data.rates) {
        if (rate?.rate && Array.isArray(rate.rate)) {
          for (const rateInfo of rate.rate) {
            const city = rateInfo.city;
            const meals = rateInfo.meals;
            
            // Select lodging rate for requested month (fallback to current month, then first available)
            const requestedMonthNum = (month && /^\d{2}$/.test(month)) ? parseInt(month, 10) : (new Date().getMonth() + 1);
            const monthlyRates = rateInfo.months?.month || [];
            
            // Find the specific month rate
            let lodging = 0;
            if (monthlyRates.length > 0) {
              // Try to find the exact month
              const monthData = monthlyRates.find(m => m.number === requestedMonthNum) || 
                               monthlyRates.find(m => m.short === String(requestedMonthNum).padStart(2,'0')) || 
                               monthlyRates[0];
              lodging = parseFloat(monthData?.value) || 0;
            }
            
            if (city && (lodging > 0 || meals > 0)) {
              rows.push({ 
                location: city, 
                lodging: lodging, 
                mie: meals 
              });
            }
          }
        }
      }
    } else if (Array.isArray(data?.results)) {
      for (const loc of data.results) maybePush(loc);
    } else if (data) {
      maybePush(data);
    }

    return res.json({ rows, raw: data, source: 'GSA_API' });


  } catch (e) {
    console.error('Per diem lookup error:', e);
    return res.status(500).json({ error: 'Per diem lookup failed', detail: String(e.message||e) });
  }
});

// Get all available cities and states for per diem lookup
app.get('/api/perdiem/locations', async (req, res) => {
  try {
    const year = String(req.query.year || new Date().getFullYear());
    const apiKey = process.env.GSA_API_KEY;
    
    if (!apiKey) {
      // Return fallback data if API key not configured
      const fallbackStates = {
        'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
        'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
        'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
        'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
        'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
        'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
        'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
        'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
        'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
        'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
        'DC': 'Washington DC'
      };
      
      const internationalCountries = [
        'Germany', 'United Kingdom', 'France', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland',
        'Austria', 'Poland', 'Czech Republic', 'Hungary', 'Portugal', 'Greece', 'Norway', 'Sweden',
        'Denmark', 'Finland', 'Ireland', 'Luxembourg', 'Japan', 'South Korea', 'China', 'Singapore',
        'Australia', 'New Zealand', 'Thailand', 'Malaysia', 'Philippines', 'Indonesia', 'Vietnam',
        'India', 'Taiwan', 'Hong Kong', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait',
        'Israel', 'Turkey', 'Egypt', 'South Africa', 'Kenya', 'Morocco', 'Canada', 'Mexico',
        'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Costa Rica', 'Panama', 'Jamaica',
        'Bahamas', 'Barbados'
      ];
      
      return ok(res, {
        countries: ['United States', ...internationalCountries.sort()],
        states: fallbackStates,
        cities: {}, // Will be populated dynamically
        source: 'fallback',
        note: 'Configure PERDIEM_API_KEY for complete GSA data'
      });
    }
    
    try {
      const url = `https://api.gsa.gov/travel/perdiem/v2/rates/conus/lodging/${year}`;
      console.log(`Fetching all CONUS locations: ${url}`);
      
      const rsp = await fetch(url, { 
        headers: { 
          'X-API-KEY': apiKey, 
          'Accept': 'application/json',
          'User-Agent': 'FEDEVENT/1.0'
        },
        timeout: 20000
      });
      
      if (rsp.ok) {
        const responseText = await rsp.text();
        const data = JSON.parse(responseText);
        
        if (data && Array.isArray(data)) {
          // Extract unique states and cities (GSA lodging endpoint format)
          const stateMap = new Map();
          
          data.forEach(rate => {
            const state = rate.State;
            const city = rate.City;
            
            if (state && city && state !== '' && city !== 'Standard Rate') {
              if (!stateMap.has(state)) {
                stateMap.set(state, new Set());
              }
              stateMap.get(state).add(city);
            }
          });
          
          // Convert to object with arrays
          const cities = {};
          stateMap.forEach((citySet, state) => {
            cities[state] = Array.from(citySet).sort();
          });
          
          // International countries
          const internationalCountries = [
            'Germany', 'United Kingdom', 'France', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland',
            'Austria', 'Poland', 'Czech Republic', 'Hungary', 'Portugal', 'Greece', 'Norway', 'Sweden',
            'Denmark', 'Finland', 'Ireland', 'Luxembourg', 'Japan', 'South Korea', 'China', 'Singapore',
            'Australia', 'New Zealand', 'Thailand', 'Malaysia', 'Philippines', 'Indonesia', 'Vietnam',
            'India', 'Taiwan', 'Hong Kong', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait',
            'Israel', 'Turkey', 'Egypt', 'South Africa', 'Kenya', 'Morocco', 'Canada', 'Mexico',
            'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Costa Rica', 'Panama', 'Jamaica',
            'Bahamas', 'Barbados'
          ];
          
          return ok(res, {
            countries: ['United States', ...internationalCountries.sort()],
            states: Array.from(stateMap.keys()).sort(),
            cities,
            total_locations: data.length,
            year,
            source: 'GSA'
          });
        }
      } else {
        console.error(`GSA locations API failed: ${rsp.status} ${rsp.statusText}`);
        return fail(res, 500, 'Failed to fetch location data from GSA');
      }
    } catch (e) {
      console.error('Locations lookup failed:', e.message);
      return fail(res, 500, 'Failed to fetch per diem locations: ' + e.message);
    }
  } catch (e) {
    console.error('Per diem locations error:', e);
    return fail(res, 500, 'Per diem locations lookup failed');
  }
});
// ---------- GSA Per Diem API Integration - All 6 Endpoints ----------

// Helper function to parse GSA API response structure
function parseGSAResponse(data) {
  if (!data || !data.rates || !Array.isArray(data.rates) || data.rates.length === 0) {
    return null;
  }

  const gsaRate = data.rates[0];
  const rateInfo = gsaRate.rate && gsaRate.rate[0];
  
  if (!rateInfo) {
    return null;
  }

  const monthlyRates = rateInfo.months?.month || [];
  
  return {
    state: gsaRate.state,
    year: gsaRate.year,
    isOconus: gsaRate.isOconus,
    city: rateInfo.city,
    county: rateInfo.county,
    standardRate: rateInfo.standardRate,
    meals: rateInfo.meals,
    zip: rateInfo.zip,
    monthlyRates: monthlyRates,
    // Helper methods
    getRateForMonth: (monthNumber) => {
      const month = monthlyRates.find(m => m.number === parseInt(monthNumber));
      return month ? {
        lodging: month.value,
        meals: rateInfo.meals,
        month: month.long,
        monthShort: month.short
      } : null;
    },
    getCurrentRate: () => {
      const currentMonth = new Date().getMonth() + 1;
      return monthlyRates.find(m => m.number === currentMonth) || monthlyRates[0];
    }
  };
}

// Helper function for GSA API calls with rate limiting awareness
async function callGSAAPI(endpoint, apiKey, timeout = 10000) {
  try {
    console.log(`GSA API call: ${endpoint}`);
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Ensure api_key is passed in query string to match GSA docs behavior
    const url = new URL(endpoint);
    if (!url.searchParams.has('api_key')) {
      url.searchParams.set('api_key', apiKey);
    }
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FEDEVENT/1.0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('GSA API key is invalid or not provided');
      } else if (response.status === 429) {
        throw new Error('GSA API rate limit exceeded (1,000 requests/hour)');
      } else {
        throw new Error(`GSA API error: ${response.status} ${response.statusText}`);
      }
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse GSA response:', text.substring(0, 500));
      throw new Error('Invalid JSON response from GSA API');
    }
  } catch (error) {
    console.error('GSA API call failed:', error.message);
    throw error;
  }
}
// Endpoint 1: Get per diem rates by city/state/year
app.get('/api/gsa/rates/city/:city/state/:state/year/:year', async (req, res) => {
  try {
    const { city, state, year } = req.params;
    const apiKey = process.env.GSA_API_KEY;

    if (!apiKey) {
      return fail(res, 500, 'GSA API key not configured');
    }

    // Handle special characters in city names as per GSA documentation
    const cleanCity = city.replace(/[.']/g, '').replace(/[-]/g, ' ');
    const encodedCity = encodeURIComponent(cleanCity);
    const encodedState = encodeURIComponent(state);

    const endpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/city/${encodedCity}/state/${encodedState}/year/${year}`;
    const rawData = await callGSAAPI(endpoint, apiKey);
    const parsedData = parseGSAResponse(rawData);

    if (!parsedData) {
      return fail(res, 404, `No per diem rates found for ${cleanCity}, ${state} in ${year}`);
    }

    const currentRate = parsedData.getCurrentRate();
    
    return ok(res, {
      rate: {
        lodging: currentRate?.value || null,
        meals: parsedData.meals || null
      },
      location: {
        city: parsedData.city,
        state: parsedData.state,
        county: parsedData.county
      },
      monthlyRates: parsedData.monthlyRates,
      standardRate: parsedData.standardRate === 'true',
      endpoint: 'city/state/year',
      query: { city: cleanCity, state, year },
      source: 'GSA Official API',
      rawData: rawData
    });
  } catch (error) {
    console.error('GSA city/state lookup error:', error);
    return fail(res, 500, 'GSA city/state lookup failed', { error: error.message });
  }
});

// Endpoint 2: Get per diem rates by state/year
app.get('/api/gsa/rates/state/:state/year/:year', async (req, res) => {
  try {
    const { state, year } = req.params;
    const apiKey = process.env.GSA_API_KEY;

    if (!apiKey) {
      return fail(res, 500, 'GSA API key not configured');
    }

    const endpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/state/${encodeURIComponent(state)}/year/${year}`;
    const data = await callGSAAPI(endpoint, apiKey);

    return ok(res, {
      data,
      endpoint: 'state/year',
      query: { state, year },
      source: 'GSA Official API'
    });
  } catch (error) {
    console.error('GSA state lookup error:', error);
    return fail(res, 500, 'GSA state lookup failed', { error: error.message });
  }
});

// Endpoint 3: Get per diem rates by ZIP code/year
app.get('/api/gsa/rates/zip/:zip/year/:year', async (req, res) => {
  try {
    const { zip, year } = req.params;
    const apiKey = process.env.GSA_API_KEY;

    if (!apiKey) {
      return fail(res, 500, 'GSA API key not configured');
    }

    const endpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/zip/${encodeURIComponent(zip)}/year/${year}`;
    const data = await callGSAAPI(endpoint, apiKey);

    return ok(res, {
      data,
      endpoint: 'zip/year',
      query: { zip, year },
      source: 'GSA Official API'
    });
  } catch (error) {
    console.error('GSA ZIP lookup error:', error);
    return fail(res, 500, 'GSA ZIP lookup failed', { error: error.message });
  }
});

// Endpoint 4: Get CONUS lodging rates by year
app.get('/api/gsa/rates/conus/lodging/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const { state, did } = req.query; // Optional filters
    const apiKey = process.env.GSA_API_KEY;

    if (!apiKey) {
      return fail(res, 500, 'GSA API key not configured');
    }

    const endpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/conus/lodging/${year}`;
    const data = await callGSAAPI(endpoint, apiKey, 15000); // Longer timeout for large dataset

    let filteredData = data;
    
    // Apply filters if provided
    if (state && Array.isArray(data)) {
      filteredData = data.filter(rate => rate.State === state.toUpperCase());
    }
    
    if (did && Array.isArray(filteredData)) {
      filteredData = filteredData.filter(rate => rate.DID === did);
    }

    return ok(res, {
      data: filteredData,
      endpoint: 'conus/lodging',
      query: { year, state, did },
      source: 'GSA Official API',
      totalRecords: Array.isArray(data) ? data.length : 0,
      filteredRecords: Array.isArray(filteredData) ? filteredData.length : 0
    });
  } catch (error) {
    console.error('GSA CONUS lodging lookup error:', error);
    return fail(res, 500, 'GSA CONUS lodging lookup failed', { error: error.message });
  }
});

// Endpoint 5: Get CONUS M&IE rates by year
app.get('/api/gsa/rates/conus/mie/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const apiKey = process.env.GSA_API_KEY;

    if (!apiKey) {
      return fail(res, 500, 'GSA API key not configured');
    }

    const endpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/conus/mie/${year}`;
    const data = await callGSAAPI(endpoint, apiKey);

    return ok(res, {
      data,
      endpoint: 'conus/mie',
      query: { year },
      source: 'GSA Official API',
      note: 'M&IE = Meals and Incidental Expenses breakdown'
    });
  } catch (error) {
    console.error('GSA CONUS M&IE lookup error:', error);
    return fail(res, 500, 'GSA CONUS M&IE lookup failed', { error: error.message });
  }
});

// Endpoint 6: Get CONUS ZIP codes by year
app.get('/api/gsa/rates/conus/zipcodes/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const { zip, state, did } = req.query; // Optional filters
    const apiKey = process.env.GSA_API_KEY;

    if (!apiKey) {
      return fail(res, 500, 'GSA API key not configured');
    }

    const endpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/conus/zipcodes/${year}`;
    const data = await callGSAAPI(endpoint, apiKey, 15000); // Longer timeout for large dataset

    let filteredData = data;
    
    // Apply filters if provided
    if (zip && Array.isArray(data)) {
      filteredData = data.filter(item => item.Zip === zip);
    }
    
    if (state && Array.isArray(filteredData)) {
      filteredData = filteredData.filter(item => item.ST === state.toUpperCase());
    }
    
    if (did && Array.isArray(filteredData)) {
      filteredData = filteredData.filter(item => item.DID === did);
    }

    return ok(res, {
      data: filteredData,
      endpoint: 'conus/zipcodes',
      query: { year, zip, state, did },
      source: 'GSA Official API',
      totalRecords: Array.isArray(data) ? data.length : 0,
      filteredRecords: Array.isArray(filteredData) ? filteredData.length : 0
    });
  } catch (error) {
    console.error('GSA CONUS zipcodes lookup error:', error);
    return fail(res, 500, 'GSA CONUS zipcodes lookup failed', { error: error.message });
  }
});

// Enhanced lookup using the sensitive API process (Endpoint 6 + Endpoint 4)
app.get('/api/gsa/lookup/sensitive/:zip/:year', async (req, res) => {
  try {
    const { zip, year } = req.params;
    const apiKey = process.env.GSA_API_KEY;

    if (!apiKey) {
      return fail(res, 500, 'GSA API key not configured');
    }

    // Step 1: Get DID for ZIP code using endpoint 6
    const zipEndpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/conus/zipcodes/${year}`;
    const zipData = await callGSAAPI(zipEndpoint, apiKey, 15000);
    
    if (!Array.isArray(zipData)) {
      return fail(res, 500, 'Invalid ZIP codes data from GSA API');
    }

    const zipInfo = zipData.find(item => item.Zip === zip);
    if (!zipInfo) {
      return fail(res, 404, `ZIP code ${zip} not found in GSA database for ${year}`);
    }

    // Step 2: Get lodging rates using the DID from endpoint 4
    const lodgingEndpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/conus/lodging/${year}`;
    const lodgingData = await callGSAAPI(lodgingEndpoint, apiKey, 15000);
    
    if (!Array.isArray(lodgingData)) {
      return fail(res, 500, 'Invalid lodging data from GSA API');
    }

    const lodgingInfo = lodgingData.find(item => 
      item.ST === zipInfo.ST && item.DID === zipInfo.DID
    );

    if (!lodgingInfo) {
      return fail(res, 404, `Lodging rates not found for DID ${zipInfo.DID} in ${zipInfo.ST}`);
    }

    return ok(res, {
      zipInfo,
      lodgingInfo,
      endpoint: 'sensitive-lookup',
      query: { zip, year },
      source: 'GSA Official API (Sensitive Process)',
      note: 'This uses the GSA recommended sensitive API process: ZIP lookup + DID-based lodging rates'
    });
  } catch (error) {
    console.error('GSA sensitive lookup error:', error);
    return fail(res, 500, 'GSA sensitive lookup failed', { error: error.message });
  }
});

// GSA API status and rate limit info
app.get('/api/gsa/status', async (req, res) => {
  try {
    const apiKey = process.env.GSA_API_KEY;

    if (!apiKey) {
      return fail(res, 500, 'GSA API key not configured');
    }

    // Test API connectivity with a simple call
    const currentYear = new Date().getFullYear();
    const testEndpoint = `https://api.gsa.gov/travel/perdiem/v2/rates/conus/mie/${currentYear}`;
    
    const startTime = Date.now();
    await callGSAAPI(testEndpoint, apiKey, 5000);
    const responseTime = Date.now() - startTime;

    return ok(res, {
      status: 'connected',
      apiKey: `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}`,
      responseTime: `${responseTime}ms`,
      rateLimit: '1,000 requests per hour',
      endpoints: [
        'GET /api/gsa/rates/city/:city/state/:state/year/:year',
        'GET /api/gsa/rates/state/:state/year/:year',
        'GET /api/gsa/rates/zip/:zip/year/:year',
        'GET /api/gsa/rates/conus/lodging/:year',
        'GET /api/gsa/rates/conus/mie/:year',
        'GET /api/gsa/rates/conus/zipcodes/:year',
        'GET /api/gsa/lookup/sensitive/:zip/:year'
      ],
      documentation: 'https://open.gsa.gov/api/travel-perdiem/',
      account: {
        email: 'info@creataglobal.com',
        id: 'a550a2f6-e8c1-4777-978f-f463dd200b6c'
      }
    });
  } catch (error) {
    console.error('GSA API status check failed:', error);
    return fail(res, 500, 'GSA API connectivity failed', { 
      error: error.message,
      suggestion: 'Check API key configuration and network connectivity'
    });
  }
});

// ---------- Support Request endpoints ----------
app.post('/api/support-request', async (req, res) => {
  try {
    const {
      contact_name, email, phone, organization, event_title,
      start_date, end_date, location, attendees, services,
      budget_range, requirements, request_type, urgency_level, emergency_phone
    } = req.body;

    if (!contact_name || !email || !organization || !event_title || !start_date || !end_date || !location || !attendees || !requirements) {
      return fail(res, 400, 'Required fields missing');
    }

    // Generate request ID
    const requestId = `${request_type?.toUpperCase() || 'REQ'}-${Date.now()}`;

    // Store in database
    const result = db.prepare(`
      INSERT INTO support_requests (
        request_id, request_type, contact_name, email, phone, organization,
        event_title, start_date, end_date, location, attendees, services,
        budget_range, requirements, urgency_level, emergency_phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      requestId, request_type || 'mission', contact_name, email, phone || '', organization,
      event_title, start_date, end_date, location, attendees, JSON.stringify(services || []),
      budget_range || '', requirements, urgency_level || '', emergency_phone || ''
    );

    // Send notification email if configured
    if (process.env.NOTIFY_TO && process.env.SMTP_HOST) {
      const subject = request_type === 'emergency' 
        ? `🚨 EMERGENCY Support Request - ${event_title}` 
        : `📋 Mission Support Request - ${event_title}`;
      
      const html = `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${request_type === 'emergency' ? '#dc2626' : '#1e40af'};">
            ${request_type === 'emergency' ? '🚨 Emergency' : '📋 Mission'} Support Request
          </h2>
          
          <div style="background: #f8fafc; padding: 1.5rem; border-radius: 8px; margin: 1rem 0;">
            <p><strong>Request ID:</strong> ${requestId}</p>
            <p><strong>Contact:</strong> ${contact_name} (${email})</p>
            <p><strong>Organization:</strong> ${organization}</p>
            <p><strong>Event:</strong> ${event_title}</p>
            <p><strong>Dates:</strong> ${start_date} to ${end_date}</p>
            <p><strong>Location:</strong> ${location}</p>
            <p><strong>Attendees:</strong> ${attendees}</p>
            ${budget_range ? `<p><strong>Budget:</strong> ${budget_range}</p>` : ''}
            ${urgency_level ? `<p><strong>Urgency:</strong> ${urgency_level}</p>` : ''}
            ${emergency_phone ? `<p><strong>Emergency Phone:</strong> ${emergency_phone}</p>` : ''}
          </div>
          
          <div style="background: #fff; padding: 1.5rem; border-radius: 8px; border: 1px solid #e5e7eb;">
            <h3>Services Requested:</h3>
            <ul>${(services || []).map(service => `<li>${service.replace('_', ' ').toUpperCase()}</li>`).join('')}</ul>
            
            <h3>Requirements:</h3>
            <p style="white-space: pre-wrap;">${requirements}</p>
          </div>
        </div>
      `;

      try {
        await sendMail({
          to: process.env.NOTIFY_TO,
          subject,
          html
        });
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
      }
    }

    return ok(res, { 
      requestId,
      message: request_type === 'emergency' 
        ? 'Emergency request received - we will contact you immediately' 
        : 'Request submitted successfully - we will respond within 24 hours'
    });

  } catch (error) {
    console.error('Support request error:', error);
    return fail(res, 500, 'Failed to submit support request');
  }
});

// ---------- Chat widget endpoints ----------
app.post('/api/chat', async (req, res) => {
  try {
    const { name = '', email = '', message = '' } = req.body || {};
    if (!message || String(message).trim().length < 2) return fail(res, 400, 'Message is required');
    const ins = db.prepare(`INSERT INTO chats (name, email, message) VALUES (?,?,?)`);
    const info = ins.run(String(name).trim(), String(email).trim(), String(message).trim());

    // Optional email notify
    if (process.env.NOTIFY_TO && process.env.SMTP_HOST) {
      try {
        await sendMail({
          to: process.env.NOTIFY_TO,
          subject: 'New chat message on FEDEVENT',
          html: `<div style="font-family:system-ui,Segoe UI,Roboto,Arial">
                  <p><b>From:</b> ${name || '(anonymous)'} &lt;${email || 'no email'}&gt;</p>
                  <pre style="white-space:pre-wrap;background:#f7f9fc;padding:10px;border-radius:8px">${String(message).replace(/</g,'&lt;')}</pre>
                  <p style="color:#6b7280">Chat ID: ${Number(info.lastInsertRowid)}</p>
                </div>`
        });
      } catch (_) { /* ignore mail errors */ }
    }
    return ok(res, { id: Number(info.lastInsertRowid) });
  } catch (e) {
    return fail(res, 500, 'Chat failed');
  }
});
// ---------- Hotel Prelaunch Waitlist API ----------
app.post('/api/leads', async (req, res) => {
  try {
    const {
      hotelName, hotelAddress, hotelPhone, hotelPlaceId,
      city, state, zipCode, country, contactName, title, email, phone, interests,
      indoorProperty, acceptsNet30, acceptsPo, acceptsDiscount
    } = req.body;

    // Validate required fields (state is optional for international addresses)
    if (!hotelName || !city || !contactName || !title || !email) {
      return fail(res, 400, 'Required fields missing');
    }
    
    // Validate eligibility questions
    if (!indoorProperty || !acceptsNet30 || !acceptsPo) {
      return fail(res, 400, 'Please answer all required Property Eligibility and Policy questions');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return fail(res, 400, 'Invalid email address');
    }

    // Generate unique user code (FEV-XXXXX format)
    let userCode = '';
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      // Generate 5-digit code
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      userCode = `FEV-${randomNum}`;
      
      // Check if it already exists
      const existing = db.prepare(`SELECT id FROM hotel_leads WHERE user_code = ?`).get(userCode);
      if (!existing) break;
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return fail(res, 500, 'Failed to generate unique user code');
    }

    // Insert into database with all fields
    const result = db.prepare(`
      INSERT INTO hotel_leads (
        user_code, hotel_name, hotel_address, hotel_phone, hotel_place_id,
        city, state, zip_code, country, contact_name, title, email, phone, interests,
        indoor_property, accepts_net30, accepts_po, accepts_discount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userCode, hotelName, hotelAddress || '', hotelPhone || '', hotelPlaceId || '',
      city, state || '', zipCode || '', country || '', contactName, title, email, phone || '', interests || '',
      indoorProperty, acceptsNet30, acceptsPo, acceptsDiscount || 'No'
    );

    const leadId = Number(result.lastInsertRowid);
    
    console.log(`✅ New prelaunch lead: ${userCode} - ${hotelName} (${city}, ${state})`);

    // Check if this email was in email_contacts (invitation campaign)
    // If yes, mark them as registered and link to this lead
    try {
      const emailContact = db.prepare('SELECT id FROM email_contacts WHERE email = ?').get(email);
      if (emailContact) {
        db.prepare(`
          UPDATE email_contacts
          SET registered = 'Yes',
              registered_lead_id = ?
          WHERE id = ?
        `).run(leadId, emailContact.id);
        console.log(`✅ Linked email contact ${email} to waitlist lead ${leadId}`);
      }
    } catch (linkError) {
      console.error('Error linking email contact to lead:', linkError);
      // Continue anyway - lead is saved
    }

    // Send notification email if configured
    if (process.env.NOTIFY_TO && process.env.SMTP_HOST) {
      const subject = '🎯 New FEDEVENT Hotel Waitlist Signup';
      
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #0071e3 0%, #8e44ad 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800;">FEDEVENT</h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px;">New Waitlist Registration</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <div style="background: #ffffff; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px;">Hotel Information</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563; width: 40%;">Hotel Name:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${hotelName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Location:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${city}, ${state}, ${country}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Contact Name:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${contactName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Title:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${title}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Email:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">
                    <a href="mailto:${email}" style="color: #0071e3; text-decoration: none;">${email}</a>
                  </td>
                </tr>
                ${phone ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Phone:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">
                    <a href="tel:${phone}" style="color: #0071e3; text-decoration: none;">${phone}</a>
                  </td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563; vertical-align: top;">Interests:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${interests || 'Not specified'}</td>
                </tr>
                ${hotelAddress ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Hotel Address:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${hotelAddress}</td>
                </tr>
                ` : ''}
                ${hotelPhone ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Hotel Phone:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${hotelPhone}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Indoor Property:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;"><strong>${indoorProperty === 'Yes' ? '✅ Yes' : '❌ No'}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Accepts NET30:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;"><strong>${acceptsNet30 === 'Yes' ? '✅ Yes' : '❌ No'}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Government PO:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;"><strong>${acceptsPo === 'Acceptable' ? '✅ Acceptable' : '❌ Unacceptable'}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; font-weight: 600; color: #4b5563;">30% Discount:</td>
                  <td style="padding: 12px 0; color: #1a1a1a;"><strong>${acceptsDiscount === 'Yes' ? '✅ Yes' : '❌ No'}</strong></td>
                </tr>
              </table>
            </div>
            
            <div style="margin-top: 20px; padding: 20px; background: #f0f9ff; border-left: 4px solid #0071e3; border-radius: 8px;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">
                <strong>User Code:</strong> <span style="font-size: 18px; font-weight: 700; color: #0071e3;">${userCode}</span><br>
                <strong>Lead ID:</strong> #${leadId}<br>
                <strong>Submitted:</strong> ${new Date().toLocaleString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric', 
                  hour: '2-digit', 
                  minute: '2-digit',
                  timeZoneName: 'short'
                })}
              </p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; background: #f8f9fa; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              CREATA Global Event Agency LLC | UEI: CNN2T3673V51 | CAGE: 8D4P1
            </p>
          </div>
        </div>
      `;

      try {
        await sendMail({
          to: process.env.NOTIFY_TO,
          subject,
          html,
          replyTo: email
        });
        
        // Mark as notified
        db.prepare(`UPDATE hotel_leads SET notified = 1 WHERE id = ?`).run(leadId);
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
        // Continue anyway - lead is saved
      }
    }

    // Send confirmation email to the hotel contact
    if (process.env.SMTP_HOST) {
      const confirmationHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #0071e3 0%, #8e44ad 100%); padding: 40px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 800;">FEDEVENT</h1>
            <p style="color: #ffffff; margin: 15px 0 0 0; font-size: 16px; opacity: 0.95;">Government Contracts Simplified</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <div style="text-align: center; font-size: 60px; margin-bottom: 20px;">✅</div>
            
            <h2 style="color: #1a1a1a; margin: 0 0 15px 0; font-size: 28px; text-align: center;">Welcome to the Waitlist!</h2>
            
            <div style="background: linear-gradient(135deg, #0071e3 0%, #8e44ad 100%); padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
              <p style="color: #ffffff; margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">Your Unique User Code</p>
              <p style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 2px;">${userCode}</p>
              <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 12px; opacity: 0.8;">Save this code for future reference</p>
            </div>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              Dear ${contactName},
            </p>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              Thank you for joining the FEDEVENT waitlist! <strong>${hotelName}</strong> will be among the first hotels invited when our platform launches in <strong>2026</strong>.
            </p>
            
            <div style="background: linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%); padding: 25px; border-radius: 12px; margin: 30px 0;">
              <h3 style="color: #1a1a1a; margin: 0 0 15px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>You'll receive priority access when FEDEVENT launches</li>
                <li>Free featured placement as one of the first 1,000 hotels</li>
                <li>Early invitations to RFPs from U.S. Government agencies</li>
                <li>Dedicated onboarding support from our team</li>
              </ul>
            </div>
            
            <div style="background: #ffffff; padding: 20px; border: 2px solid #e5e7eb; border-radius: 12px; margin: 30px 0;">
              <h3 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 18px;">Your Registration Details</h3>
              <p style="color: #6b7280; margin: 0; line-height: 1.6;">
                <strong>User Code:</strong> <span style="color: #0071e3; font-weight: 700; font-size: 16px;">${userCode}</span><br>
                <strong>Hotel:</strong> ${hotelName}<br>
                <strong>Location:</strong> ${city}, ${state}, ${country}<br>
                <strong>Contact:</strong> ${contactName} (${title})<br>
                <strong>Email:</strong> ${email}
                ${phone ? `<br><strong>Phone:</strong> ${phone}` : ''}
              </p>
            </div>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
              If you have any questions in the meantime, please don't hesitate to reach out to us at 
              <a href="mailto:info@Fedevent.com" style="color: #0071e3; text-decoration: none;">info@Fedevent.com</a>.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #4b5563; font-size: 14px; margin: 0 0 10px 0;">Follow us for updates:</p>
              <p style="margin: 0;">
                <a href="#" style="color: #0071e3; text-decoration: none; margin: 0 10px;">LinkedIn</a>
                <span style="color: #d1d5db;">|</span>
                <a href="#" style="color: #0071e3; text-decoration: none; margin: 0 10px;">Instagram</a>
              </p>
            </div>
          </div>
          
          <div style="padding: 30px; text-align: center; background: #f8f9fa; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 10px 0; color: #1a1a1a; font-weight: 600;">CREATA Global Event Agency LLC</p>
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              UEI: CNN2T3673V51 | CAGE: 8D4P1<br>
              © 2025 CREATA Global Event Agency LLC. All rights reserved.
            </p>
          </div>
        </div>
      `;

      try {
        await sendMail({
          to: email,
          subject: '✅ Welcome to FEDEVENT - You\'re on the Waitlist!',
          html: confirmationHtml
        });
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Continue anyway - lead is saved
      }
    }

    return ok(res, { 
      success: true,
      message: 'Thank you for joining the waitlist!',
      leadId,
      userCode
    });

  } catch (error) {
    console.error('Lead submission error:', error);
    return fail(res, 500, 'Failed to submit waitlist registration');
  }
});

// ---------- simple hotel search (stubbed from stored hotels table) ----------
app.get('/api/search', (req, res) => {
  try {
    const q = String(req.query.q||'').toLowerCase();
    const rows = db.prepare(`SELECT name, email, city, state, country, tags FROM hotels ORDER BY id DESC LIMIT 100`).all();
    const results = rows.filter(r => !q || [r.name,r.city,r.state,r.country].join(' ').toLowerCase().includes(q)).map(r => ({
      name: r.name,
      city: r.city,
      state: r.state,
      country: r.country,
      tags: { net30: true, directbill: true, perdiem_discount: true, preferred: true }
    }));
    return ok(res, { results });
  } catch (e) {
    return fail(res, 500, 'Search failed');
  }
});

// ---------- Email test endpoint (configure GoDaddy SMTP in env) ----------
app.post('/api/test-email', async (req, res) => {
  try {
    const to = (req.body && req.body.to) || process.env.NOTIFY_TO || process.env.SMTP_USER;
    if (!to) return fail(res, 400, 'Missing recipient');
    if (!process.env.SMTP_HOST) return fail(res, 400, 'SMTP not configured');
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
        <h2>FEDEVENT SMTP Test</h2>
        <p>If you received this, SMTP is working.</p>
        <ul>
          <li>Host: ${process.env.SMTP_HOST}</li>
          <li>Port: ${process.env.SMTP_PORT || 587}</li>
          <li>From: ${process.env.NOTIFY_FROM || process.env.SMTP_USER}</li>
        </ul>
      </div>`;
    await sendMail({ to, subject: 'FEDEVENT SMTP Test', html });
    return ok(res, { message: `Test email sent to ${to}` });
  } catch (e) {
    return fail(res, 500, 'Test email failed', { detail: String(e.message || e) });
  }
});

// ---------- utils ----------
function ok(res, data={}) { return res.json({ ok: true, ...data }); }
function fail(res, code=400, error='Bad request', extra={}) { return res.status(code).json({ ok:false, error, ...extra }); }

// ---------- Input validation and sanitization helpers ----------
const validation = {
  // Email validation
  isValidEmail: (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim()) && email.length <= 254;
  },
  
  // Password validation
  isValidPassword: (password) => {
    if (!password || typeof password !== 'string') return false;
    return password.length >= 8 && password.length <= 128;
  },
  
  // Phone validation
  isValidPhone: (phone) => {
    if (!phone || typeof phone !== 'string') return true; // Optional field
    const phoneRegex = /^[+]?[\d\s\(\)\-\.]{10,20}$/;
    return phoneRegex.test(phone.trim());
  },
  
  // General text validation
  sanitizeText: (text, maxLength = 255) => {
    if (!text || typeof text !== 'string') return '';
    return text.trim().substring(0, maxLength);
  },
  
  
  // Number validation
  isValidNumber: (num, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = parseFloat(num);
    return !isNaN(parsed) && parsed >= min && parsed <= max;
  },
  
  // Date validation
  isValidDate: (dateStr) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date.getTime());
  },
  
  // SQL injection prevention
  sanitizeForDB: (input) => {
    if (!input || typeof input !== 'string') return input;
    // Basic SQL injection prevention - prepared statements are the main defense
    return input.replace(/[';"\\]/g, '');
  },
  
  // XSS prevention
  sanitizeHTML: (input) => {
    if (!input || typeof input !== 'string') return input;
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },
  
  // Rate validation
  isValidRate: (rate) => {
    const parsed = parseFloat(rate);
    return !isNaN(parsed) && parsed >= 0 && parsed <= 10000; // Max $10,000 per night
  },
  
  // State/Country validation
  isValidState: (state) => {
    if (!state || typeof state !== 'string') return true; // Optional
    return state.length >= 2 && state.length <= 50;
  },
  
  // Validate required fields
  validateRequired: (fields, data) => {
    const missing = [];
    for (const field of fields) {
      if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
        missing.push(field);
      }
    }
    return missing;
  }
};

// ========== QUICKBOOKS OAUTH & PAYMENT INTEGRATION ==========

// Create table to store QuickBooks OAuth tokens
try {
  db.exec(`CREATE TABLE IF NOT EXISTS quickbooks_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    realm_id TEXT,
    token_expires_at INTEGER,
    refresh_expires_at INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  console.log('✅ QuickBooks tokens table ready');
} catch (e) {
  if (!e.message.includes('already exists')) console.log('QB tokens table exists');
}

// Initialize QuickBooks OAuth Client (commented out - using payment link instead)
// const qbOAuthClient = process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET ? new OAuthClient({
//   clientId: process.env.QB_CLIENT_ID,
//   clientSecret: process.env.QB_CLIENT_SECRET,
//   environment: process.env.QB_ENVIRONMENT || 'production',
//   redirectUri: process.env.QB_REDIRECT_URI || 'https://fedevent.com/api/quickbooks/callback',
// }) : null;

const qbOAuthClient = null; // Using payment link approach

// if (qbOAuthClient) {
//   console.log('✅ QuickBooks OAuth client initialized');
// } else {
//   console.log('⚠️  QuickBooks not configured - set QB_CLIENT_ID and QB_CLIENT_SECRET in .env');
// }
console.log('💳 QuickBooks Payment Link configured');

// Get stored QB tokens from database
function getQuickBooksTokens() {
  try {
    const tokens = db.prepare('SELECT * FROM quickbooks_tokens WHERE id = 1').get();
    if (!tokens) return null;
    
    // Check if tokens are expired
    const now = Math.floor(Date.now() / 1000);
    if (tokens.token_expires_at && tokens.token_expires_at < now) {
      console.log('⚠️  QuickBooks access token expired, needs refresh');
      return null;
    }
    
    return tokens;
  } catch (error) {
    console.error('Error getting QB tokens:', error);
    return null;
  }
}

// Save QB tokens to database
function saveQuickBooksTokens(tokenData) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = tokenData.expires_in || 3600; // 1 hour default
    const refreshExpiresIn = tokenData.x_refresh_token_expires_in || 8726400; // 101 days default
    
    db.prepare(`
      INSERT OR REPLACE INTO quickbooks_tokens (
        id, access_token, refresh_token, realm_id, 
        token_expires_at, refresh_expires_at, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.realmId || process.env.QB_REALM_ID,
      now + expiresIn,
      now + refreshExpiresIn
    );
    
    console.log('✅ QuickBooks tokens saved');
    return true;
  } catch (error) {
    console.error('Error saving QB tokens:', error);
    return false;
  }
}

// Refresh QB access token if needed
async function ensureFreshQuickBooksToken() {
  const tokens = getQuickBooksTokens();
  if (!tokens) return null;
  
  const now = Math.floor(Date.now() / 1000);
  
  // If token expires in less than 10 minutes, refresh it
  if (tokens.token_expires_at - now < 600) {
    try {
      console.log('🔄 Refreshing QuickBooks token...');
      qbOAuthClient.setToken({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        realmId: tokens.realm_id,
      });
      
      const authResponse = await qbOAuthClient.refresh();
      const newTokens = authResponse.getJson();
      saveQuickBooksTokens(newTokens);
      
      return newTokens.access_token;
    } catch (error) {
      console.error('❌ Failed to refresh QB token:', error);
      return null;
    }
  }
  
  return tokens.access_token;
}
// Create QuickBooks invoice for hotel registration
async function createQuickBooksInvoice(email, name, amount, accountNumber, userId) {
  try {
    if (!qbOAuthClient) {
      console.log('⚠️  QuickBooks not configured, skipping invoice creation');
      return null;
    }
    
    const accessToken = await ensureFreshQuickBooksToken();
    if (!accessToken) {
      console.log('⚠️  No valid QuickBooks token, skipping invoice creation');
      return null;
    }
    
    const tokens = getQuickBooksTokens();
    const realmId = tokens.realm_id || process.env.QB_REALM_ID;
    
    if (!realmId) {
      console.error('❌ QuickBooks Realm ID not found');
      return null;
    }
    
    const qbo = new QuickBooks(
      process.env.QB_CLIENT_ID,
      process.env.QB_CLIENT_SECRET,
      accessToken,
      false,
      realmId,
      process.env.QB_ENVIRONMENT !== 'production',
      true,
      null,
      '2.0'
    );
    
    console.log(`📝 Creating QuickBooks customer for ${name}...`);
    
    // Create customer first
    const customer = await new Promise((resolve, reject) => {
      qbo.createCustomer({
        DisplayName: `${name} (${accountNumber})`,
        PrimaryEmailAddr: { Address: email },
        Notes: `FEDEVENT Account: ${accountNumber}\nUser ID: ${userId}`,
        CompanyName: name,
      }, (err, customer) => {
        if (err) {
          console.error('QB Customer creation error:', err);
          reject(err);
        } else {
          console.log(`✅ QB Customer created: ${customer.Id}`);
          resolve(customer);
        }
      });
    });
    
    console.log(`📄 Creating QuickBooks invoice...`);
    
    // Get item ID from env or use default
    const itemId = process.env.QB_ITEM_ID || '1';
    
    // Create invoice
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days
    
    const invoice = await new Promise((resolve, reject) => {
      qbo.createInvoice({
        CustomerRef: { value: customer.Id },
        Line: [{
          Amount: amount,
          DetailType: 'SalesItemLineDetail',
          Description: 'FEDEVENT Hotel Registration - One-time setup fee for platform access and government contract opportunities',
          SalesItemLineDetail: {
            ItemRef: { value: itemId },
            UnitPrice: amount,
            Qty: 1,
          },
        }],
        BillEmail: { Address: email },
        CustomerMemo: { value: `Thank you for joining FEDEVENT! Account: ${accountNumber}` },
        TxnDate: new Date().toISOString().split('T')[0],
        DueDate: dueDate.toISOString().split('T')[0],
      }, (err, invoice) => {
        if (err) {
          console.error('QB Invoice creation error:', err);
          reject(err);
        } else {
          console.log(`✅ QB Invoice created: ${invoice.Id}`);
          resolve(invoice);
        }
      });
    });
    
    // Send invoice email
    console.log(`📧 Sending QuickBooks invoice to ${email}...`);
    await new Promise((resolve, reject) => {
      qbo.sendInvoicePdf(invoice.Id, email, (err) => {
        if (err) {
          console.error('QB Invoice send error:', err);
          reject(err);
        } else {
          console.log(`✅ QB Invoice emailed to ${email}`);
          resolve();
        }
      });
    });
    
    return invoice.Id;
    
  } catch (error) {
    console.error('❌ QuickBooks invoice creation failed:', error);
    return null;
  }
}

// ---------- Authentication helpers ----------
function generateSessionId() {
  return randomBytes(32).toString('hex');
}

function generateSecurePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// Optimize database queries with prepared statements and connection reuse
const preparedQueries = {
  // User and session management
  findUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ? AND is_active = 1`),
  findUserByUsername: db.prepare(`SELECT * FROM users WHERE first_name = ? AND is_active = 1`),
  createSession: db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`),
  getSessionUser: db.prepare(`
    SELECT s.*, u.* FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
  `),
  updateLastLogin: db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`),
  
  // Hotel operations
  findHotelsByLocation: db.prepare(`
    SELECT h.*, 
           COUNT(u.id) as user_count,
           MAX(u.last_login) as last_activity
    FROM hotels h
    LEFT JOIN users u ON h.id = u.hotel_id
    WHERE h.city LIKE ? AND h.state = ? AND h.country = ?
    GROUP BY h.id
    ORDER BY h.created_at DESC
    LIMIT 50
  `),
  
  // Contract management
  getAllContracts: db.prepare(`
    SELECT c.*, 
           COUNT(DISTINCT cn.hotel_id) as notified_hotels,
           COUNT(DISTINCT cb.hotel_id) as bidding_hotels,
           MIN(cb.contracted_rate) as lowest_bid,
           h.name as awarded_hotel_name
    FROM contracts c
    LEFT JOIN contract_notifications cn ON c.id = cn.contract_id
    LEFT JOIN contract_bids cb ON c.id = cb.contract_id AND cb.status = 'active'
    LEFT JOIN hotels h ON c.awarded_hotel_id = h.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `)
};

// Database connection optimization
db.pragma('journal_mode = WAL'); // Better concurrency
db.pragma('synchronous = NORMAL'); // Better performance
db.pragma('cache_size = 1000'); // Increase cache
db.pragma('temp_store = MEMORY'); // Use memory for temp tables

// Optimized authentication helper functions
function createSession(userId) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  
  preparedQueries.createSession.run(sessionId, userId, expiresAt);
  return sessionId;
}

function getSessionUser(sessionId) {
  if (!sessionId) return null;
  return preparedQueries.getSessionUser.get(sessionId);
}

function requireAuth(req, res, next) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session;
  const user = getSessionUser(sessionId);
  
  if (!user) {
    return res.status(401).json({ 
      ok: false, 
      error: 'Your session has expired. Please log in again.' 
    });
  }
  
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return fail(res, 403, 'Admin access required');
  }
  next();
}
// Generate prelaunch invitation email template
function generatePrelaunchInvitationEmail({ hotelName, contactName, unsubscribeToken }) {
  const baseUrl = process.env.BASE_URL || 'https://fedevent.com';
  const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${unsubscribeToken}`;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Exclusive Early Access to Government Contracts</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f8fafc;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%); padding: 40px 40px 30px 40px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">FEDEVENT</h1>
                  <p style="color: #e0e7ff; margin: 0; font-size: 16px; font-weight: 500;">Government Contracts Simplified</p>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px;">
                  <p style="color: #1f2937; font-size: 18px; font-weight: 600; margin: 0 0 20px 0;">Dear ${contactName || 'Hotel Partner'},</p>
                  
                  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    Thank you for your previous interest in government contract opportunities. We're excited to introduce you to <strong>FEDEVENT</strong> – a revolutionary platform that makes winning government hotel contracts easier than ever before.
                  </p>
                  
                  <div style="background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%); border-left: 4px solid #1e40af; padding: 20px; margin: 30px 0; border-radius: 8px;">
                    <h2 style="color: #1e40af; font-size: 20px; font-weight: 700; margin: 0 0 15px 0;">🎯 Why FEDEVENT?</h2>
                    <ul style="color: #374151; font-size: 15px; line-height: 1.8; margin: 0; padding-left: 20px;">
                      <li><strong>Direct Access</strong> to federal government hotel contracts</li>
                      <li><strong>Competitive Bidding</strong> with real-time notifications</li>
                      <li><strong>Streamlined Process</strong> – no more complex paperwork</li>
                      <li><strong>Guaranteed Payments</strong> from government agencies</li>
                      <li><strong>Exclusive Opportunities</strong> for registered hotels</li>
                    </ul>
                  </div>
                  
                  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                    As an <strong>early access member</strong>, ${hotelName} can join our platform before the official launch and gain a competitive advantage in securing lucrative government contracts.
                  </p>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding: 10px 0 30px 0;">
                        <a href="${baseUrl}/prelaunch.html" style="display: inline-block; background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: 700; box-shadow: 0 4px 12px rgba(30, 64, 175, 0.3);">
                          🚀 Join Early Access Now
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 8px;">
                    <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">
                      <strong>⚡ Limited Time:</strong> Early access members receive priority notifications for all new government contracts and exclusive onboarding support.
                    </p>
                  </div>
                  
                  <h3 style="color: #1f2937; font-size: 18px; font-weight: 700; margin: 30px 0 15px 0;">What Happens Next?</h3>
                  <ol style="color: #374151; font-size: 15px; line-height: 1.8; margin: 0 0 20px 0; padding-left: 20px;">
                    <li>Click the button above to register your hotel</li>
                    <li>Complete your property profile (takes 5 minutes)</li>
                    <li>Get instant access to active government contracts</li>
                    <li>Start bidding and winning contracts immediately</li>
                  </ol>
                  
                  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                    Our team is here to support you every step of the way. If you have any questions, simply reply to this email or visit our help center.
                  </p>
                  
                  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 30px 0 10px 0;">
                    Looking forward to partnering with you,
                  </p>
                  <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0;">
                    The FEDEVENT Team
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
                  <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0 0 15px 0; text-align: center;">
                    FEDEVENT - Connecting Hotels with Government Travel Opportunities<br>
                    Trusted by hotels nationwide for government contract management
                  </p>
                  
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <a href="${baseUrl}" style="color: #1e40af; text-decoration: none; font-size: 13px; margin: 0 10px;">Visit Website</a>
                        <span style="color: #d1d5db;">|</span>
                        <a href="${baseUrl}/help-center.html" style="color: #1e40af; text-decoration: none; font-size: 13px; margin: 0 10px;">Help Center</a>
                        <span style="color: #d1d5db;">|</span>
                        <a href="${baseUrl}/prelaunch.html" style="color: #1e40af; text-decoration: none; font-size: 13px; margin: 0 10px;">Sign Up</a>
                      </td>
                    </tr>
                  </table>
                  
                  <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0 0 10px 0; text-align: center;">
                      <strong>Important:</strong> If you no longer wish to receive emails about government contract opportunities from FEDEVENT, you can unsubscribe below. Please note that unsubscribing means you will <strong>NOT receive notifications</strong> about upcoming government contracts that could benefit your property.
                    </p>
                    <p style="text-align: center; margin: 15px 0 0 0;">
                      <a href="${unsubscribeUrl}" style="color: #9ca3af; text-decoration: underline; font-size: 12px;">Unsubscribe from future emails</a>
                    </p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

async function sendMail({ to, subject, html, attachments = [], replyTo, from }) {
  try {
    if (!process.env.SMTP_HOST || !to) {
      console.warn('Email skipped: Missing SMTP_HOST or recipient');
      return { skipped: true, reason: 'Missing configuration' };
    }
    
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const secure = (String(process.env.SMTP_SECURE||'').toLowerCase()==='true') || smtpPort === 465;
    
    const tx = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure,
      requireTLS: !secure, // enforce STARTTLS on 587
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 5000,    // 5 seconds
      socketTimeout: 10000      // 10 seconds
    });
    
    const mailOptions = {
      from: from || process.env.NOTIFY_FROM || 'noreply@fedevent.com',
      to, subject, html, attachments
    };
    
    if (replyTo) {
      mailOptions.replyTo = replyTo;
    }
    
    const result = await tx.sendMail(mailOptions);
    console.log(`Email sent successfully to ${to}: ${result.messageId}`);
    return { ok: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Email send failed:', {
      to,
      subject,
      error: error.message,
      code: error.code,
      response: error.response
    });
    
    // Return structured error for better handling
    return { 
      ok: false, 
      error: error.message,
      code: error.code,
      skipped: false
    };
  }
}

// ---------- endpoints ----------
app.get('/api/health', (_req, res) => ok(res, { scope: 'hotel-reg-form', ts: new Date().toISOString() }));

// Routing number lookup endpoint
app.get('/api/routing/:routingNumber', async (req, res) => {
  const routingNumber = req.params.routingNumber;
  
  if (!routingNumber || routingNumber.length !== 9 || !/^\d{9}$/.test(routingNumber)) {
    return fail(res, 400, 'Invalid routing number. Must be 9 digits.');
  }

  try {
    // First try the API with your key
    const apiEndpoints = [
      {
        url: `https://www.routingnumbers.info/api/data.json?rn=${routingNumber}`,
        headers: { 'Authorization': 'RIO7bxfcWfLKbY2Qh6NRYz3SROLYMQioqz1XBUeW' }
      },
      {
        url: `https://api.routingnumbers.info/v1/routing/${routingNumber}`,
        headers: { 'X-API-Key': 'RIO7bxfcWfLKbY2Qh6NRYz3SROLYMQioqz1XBUeW' }
      }
    ];

    for (const endpoint of apiEndpoints) {
      try {
        console.log(`Trying routing API: ${endpoint.url}`);
        const response = await fetch(endpoint.url, {
          method: 'GET',
          headers: endpoint.headers
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('Routing API Response:', data);
          
          const bankName = data.bank_name || data.customer_name || data.name || 
                         data.bankName || data.customerName || data.institution_name ||
                         data.institutionName || data.bank || data.institution;
          
          if (bankName) {
            return ok(res, { bankName: bankName.trim() });
          }
        }
      } catch (endpointError) {
        console.log(`Routing API endpoint failed: ${endpointError.message}`);
        continue;
      }
    }

    // Comprehensive bank routing numbers database
    const knownRoutingNumbers = {
      // Major National Banks
      '021000021': 'WELLS FARGO BANK NA',
      '111000025': 'BANK OF AMERICA N.A.',
      '026009593': 'BANK OF AMERICA N.A.',
      '121000248': 'WELLS FARGO BANK NA',
      '122000247': 'WELLS FARGO BANK NA',
      '053000196': 'BANK OF AMERICA N.A.',
      '011401533': 'CITIZENS BANK N.A.',
      '021001088': 'JPMORGAN CHASE BANK N.A.',
      '021200025': 'JPMORGAN CHASE BANK N.A.',
      '267084131': 'CAPITAL ONE N.A.',
      '031176110': 'ALLY BANK',
      '124003116': 'USAA FEDERAL SAVINGS BANK',
      '071000013': 'JPMORGAN CHASE BANK N.A.',
      '021000322': 'BANK OF AMERICA N.A.',
      '113000023': 'JPMORGAN CHASE BANK N.A.',
      '044000024': 'JPMORGAN CHASE BANK N.A.',
      '322271627': 'JPMORGAN CHASE BANK N.A.',
      '011103093': 'SANTANDER BANK N.A.',
      '011075150': 'WEBSTER BANK N.A.',
      '021302567': 'CITIZENS BANK N.A.',
      
      // Additional Major Banks
      '036001808': 'USAA FEDERAL SAVINGS BANK',
      '114000093': 'JPMORGAN CHASE BANK N.A.',
      '021100361': 'CITIBANK N.A.',
      '021000089': 'CITIBANK N.A.',
      '063000047': 'CAPITAL ONE N.A.',
      '051000017': 'BANK OF AMERICA N.A.',
      '111000046': 'BANK OF AMERICA N.A.',
      '054001204': 'BANK OF AMERICA N.A.',
      '063000047': 'CAPITAL ONE N.A.',
      '031000503': 'U.S. BANK NATIONAL ASSOCIATION',
      '123103716': 'U.S. BANK NATIONAL ASSOCIATION',
      '091000019': 'U.S. BANK NATIONAL ASSOCIATION',
      '041000124': 'WELLS FARGO BANK NA',
      '091300010': 'WELLS FARGO BANK NA',
      '102000076': 'WELLS FARGO BANK NA',
      
      // Regional and Community Banks
      '091905489': 'VALLEY NATIONAL BANK',
      '021201383': 'VALLEY NATIONAL BANK',
      '221371415': 'VALLEY NATIONAL BANK',
      '021300077': 'VALLEY NATIONAL BANK',
      '011600033': 'FIRST NATIONAL BANK OF PENNSYLVANIA',
      '031302955': 'REGIONS BANK',
      '062000080': 'REGIONS BANK',
      '083900363': 'REGIONS BANK',
      '062203751': 'REGIONS BANK',
      '053207766': 'FIFTH THIRD BANK',
      '042000314': 'FIFTH THIRD BANK',
      '072000805': 'FIFTH THIRD BANK',
      '011000138': 'CITIZENS BANK N.A.',
      '021302567': 'CITIZENS BANK N.A.',
      '261071315': 'CITIZENS BANK N.A.',
      '066010057': 'CITIZENS BANK N.A.',
      '311992904': 'NAVY FEDERAL CREDIT UNION',
      '256074974': 'NAVY FEDERAL CREDIT UNION',
      '331303518': 'NAVY FEDERAL CREDIT UNION',
      
      // Credit Unions
      '302075319': 'PENFED CREDIT UNION',
      '253177049': 'PENFED CREDIT UNION',
      '061091311': 'ALLIANT CREDIT UNION',
      '271981528': 'ALLIANT CREDIT UNION',
      '322271724': 'SPACE COAST CREDIT UNION',
      '263182794': 'SCHOOL FIRST FEDERAL CREDIT UNION',
      '272471548': 'BECU',
      '125000024': 'BECU',
      
      // State and Local Banks
      '021400524': 'TD BANK N.A.',
      '031101169': 'TD BANK N.A.',
      '054001725': 'TD BANK N.A.',
      '011103093': 'SANTANDER BANK N.A.',
      '231372691': 'SANTANDER BANK N.A.',
      '061000052': 'SUNTRUST BANK',
      '053000196': 'SUNTRUST BANK',
      '063000047': 'CAPITAL ONE N.A.',
      '051000020': 'CAPITAL ONE N.A.',
      '065000090': 'CAPITAL ONE N.A.',
      
      // Online Banks
      '124303065': 'ALLY BANK',
      '031176110': 'ALLY BANK',
      '321180379': 'DISCOVER BANK',
      '011075150': 'WEBSTER BANK N.A.',
      '211274450': 'FIRST INTERNET BANK OF INDIANA',
      '271081528': 'AXOS BANK',
      '322271627': 'JPMORGAN CHASE BANK N.A.',
      
      // Investment and Specialty Banks
      '021000089': 'CITIBANK N.A.',
      '021001486': 'CITIBANK N.A.',
      '322271627': 'JPMORGAN CHASE BANK N.A.',
      '111000025': 'BANK OF AMERICA N.A.',
      '325081403': 'COMPASS BANK',
      '111319694': 'PNC BANK N.A.',
      '043000096': 'PNC BANK N.A.',
      '054000030': 'PNC BANK N.A.',
      '083000137': 'PNC BANK N.A.',
      
      // Additional Valley Bank routing numbers
      '091905489': 'VALLEY NATIONAL BANK',
      '021201383': 'VALLEY NATIONAL BANK',
      '221371415': 'VALLEY NATIONAL BANK', 
      '021300077': 'VALLEY NATIONAL BANK',
      '091900533': 'VALLEY NATIONAL BANK',
      '211274450': 'VALLEY NATIONAL BANK'
    };

    if (knownRoutingNumbers[routingNumber]) {
      console.log(`Using fallback for routing ${routingNumber}: ${knownRoutingNumbers[routingNumber]}`);
      return ok(res, { bankName: knownRoutingNumbers[routingNumber] });
    }

    return fail(res, 404, 'Bank not found for this routing number');
    
  } catch (error) {
    console.error('Routing lookup error:', error);
    return fail(res, 500, 'Error looking up routing number');
  }
});

// ---------- Authentication API endpoints ----------

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return fail(res, 400, 'Email and password required');
    }
    
    // Try to find user by email first, then by username (first_name)
    let user = preparedQueries.findUserByEmail.get(email);
    if (!user) {
      user = preparedQueries.findUserByUsername.get(email);
    }
    
    if (!user || !verifyPassword(password, user.password_hash)) {
      return fail(res, 401, 'Invalid email/username or password');
    }
    
    const sessionId = createSession(user.id);
    
    // Update last login
    preparedQueries.updateLastLogin.run(user.id);
    
    // Get hotel info if user is hotel staff
    let hotelInfo = null;
    if (user.hotel_id) {
      hotelInfo = db.prepare(`SELECT * FROM hotels WHERE id = ?`).get(user.hotel_id);
    }
    
    return ok(res, {
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        hotel_id: user.hotel_id
      },
      hotel: hotelInfo
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return fail(res, 500, 'Login failed');
  }
});
// Register endpoint (for hotel users)
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('🔐 Registration attempt:', { 
      email: req.body.email, 
      hasPassword: !!req.body.password, 
      username: req.body.username, 
      hotelName: req.body.hotelName, 
      contactName: req.body.contactName 
    });
    
    const { email, password, username, hotelName, contactName } = req.body;
    
    // Use contactName as username if provided, otherwise fall back to username
    const displayName = contactName || username || hotelName;
    
    if (!email || !password || !displayName) {
      console.log('❌ Registration failed: Missing required fields', { email: !!email, password: !!password, displayName: !!displayName });
      return fail(res, 400, 'Email, password, and contact name are required');
    }
    
    // Check if user already exists
    console.log('🔍 Checking if user exists for email:', email);
    const existingUser = db.prepare(`SELECT id, email FROM users WHERE email = ?`).get(email);
    if (existingUser) {
      console.log('❌ Registration failed: User already exists', { id: existingUser.id, email: existingUser.email });
      return fail(res, 400, 'This email is already registered. Please sign in instead or use a different email address.');
    }
    console.log('✅ Email is available for registration');
    
    // Generate FEDEVENT account number (State+Year+Sequence)
    const currentYear = new Date().getFullYear();
    const yearSuffix = currentYear.toString().slice(-2); // Last 2 digits of year
    
    // For now, use default state code FL. Later this can be determined from hotel location
    const stateCode = 'FL'; // Default to Florida, can be updated when hotel completes profile
    
    // Get next sequence number for this state+year combination
    const existingCount = db.prepare(`
      SELECT COUNT(*) as count FROM users 
      WHERE fedevent_account_number LIKE ? AND role = 'hotel'
    `).get(`${stateCode}${yearSuffix}%`);
    
    const sequenceNumber = String(existingCount.count + 1).padStart(3, '0');
    const fedeventAccountNumber = `${stateCode}${yearSuffix}${sequenceNumber}`;

    // Create user with FEDEVENT account number
    console.log('🔐 Creating user with account number:', fedeventAccountNumber);
    const passwordHash = hashPassword(password);
    
    let userResult;
    let sessionId;
    
    try {
      userResult = db.prepare(`
        INSERT INTO users (email, password_hash, first_name, last_name, role, fedevent_account_number, account_status, setup_fee_paid)
        VALUES (?, ?, ?, ?, 'hotel', ?, 'pending', 0)
      `).run(email, passwordHash, displayName, '', fedeventAccountNumber);
      
      console.log('✅ User created successfully (PENDING payment):', { 
        id: userResult.lastInsertRowid, 
        email, 
        accountNumber: fedeventAccountNumber 
      });
      
      // Create payment record for $49.99 setup fee
      const paymentResult = db.prepare(`
        INSERT INTO payments (user_id, amount, status, payment_method)
        VALUES (?, 49.99, 'pending', 'quickbooks')
      `).run(userResult.lastInsertRowid);
      
      console.log('✅ Payment record created:', { paymentId: paymentResult.lastInsertRowid });
      
      // Create QuickBooks invoice and send automatically
      try {
        const qbInvoiceId = await createQuickBooksInvoice(
          email,
          hotelName || displayName,
          49.99,
          fedeventAccountNumber,
          userResult.lastInsertRowid
        );
        
        if (qbInvoiceId) {
          // Update payment record with QB invoice ID
          db.prepare(`
            UPDATE payments 
            SET quickbooks_invoice_id = ? 
            WHERE id = ?
          `).run(qbInvoiceId, paymentResult.lastInsertRowid);
          
          console.log(`✅ QuickBooks invoice ${qbInvoiceId} created and emailed to ${email}`);
        }
      } catch (qbError) {
        console.error('⚠️  QuickBooks invoice creation failed, but registration continues:', qbError.message);
        // Don't fail registration if QB fails - hotel can still pay manually
      }
      
      sessionId = createSession(userResult.lastInsertRowid);
      console.log('✅ Session created:', sessionId);
    } catch (dbError) {
      console.error('❌ Database error during user creation:', dbError);
      return fail(res, 500, 'Failed to create user account. Please try again.');
    }
    
    // Send welcome email if SMTP is configured
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const welcomeSubject = 'Complete Your FEDEVENT Registration - $49.99 Setup Fee Required';
      const welcomeHtml = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial; max-width:600px; margin:0 auto;">
          <div style="background:#1f2937; padding:2rem; text-align:center;">
            <h1 style="color:white; margin:0;">Welcome to FEDEVENT</h1>
            <p style="color:#d1d5db; margin:0.5rem 0 0;">Professional Government Event Solutions</p>
          </div>
          
          <div style="padding:2rem; background:#ffffff;">
            <h2 style="color:#1f2937; margin-top:0;">Hello ${displayName}!</h2>
            
            <p>Thank you for registering with FEDEVENT! Your account has been created and is pending activation.</p>
            
            <div style="margin:2rem 0; padding:1.5rem; background:#f0f9ff; border:2px solid #3b82f6; border-radius:8px;">
              <h3 style="color:#1e40af; margin:0 0 1rem 0; font-size:1.1rem;">⚠️ Action Required: Setup Fee Payment</h3>
              <p style="margin:0 0 1rem 0; color:#1f2937; font-size:1.1rem;">
                <strong style="font-size:1.3rem; color:#1e40af;">$49.99</strong> one-time setup fee
              </p>
              <p style="margin:0 0 1rem 0; color:#374151; line-height:1.6;">
                This fee covers account activation, profile optimization, and access to government contract opportunities.
              </p>
              
              <div style="background:#fff; padding:1.5rem; border-radius:6px; margin-top:1.5rem; text-align:center;">
                <a href="https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-0cc3965f22444bd9af8bf6e2e2929bc8bcc1f3c6a2934617a3b81e48133f74bc9f6279559efa43f79e3adb5b1a2954d7?locale=EN_US" 
                   style="background:#10b981; color:white; padding:16px 32px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:700; font-size:1.1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom:1rem;">
                  💳 Pay $49.99 Now →
                </a>
                
                <div style="margin:1rem 0; padding:1rem; border:2px dashed #e5e7eb; border-radius:8px; background:#f9fafb;">
                  <p style="margin:0 0 0.5rem 0; color:#374151; font-size:0.875rem; font-weight:600;">
                    📱 Or scan QR code to pay:
                  </p>
                  <img src="http://${req.get('host')}/api/qr/https%3A%2F%2Fconnect.intuit.com%2Fportal%2Fapp%2FCommerceNetwork%2Fview%2Fscs-v1-0cc3965f22444bd9af8bf6e2e2929bc8bcc1f3c6a2934617a3b81e48133f74bc9f6279559efa43f79e3adb5b1a2954d7%3Flocale%3DEN_US" 
                       alt="Payment QR Code" 
                       style="width:150px; height:150px; border:1px solid #e5e7eb; border-radius:8px;">
                  <p style="margin:0.5rem 0 0; color:#6b7280; font-size:0.75rem;">
                    Scan with your phone camera
                  </p>
                </div>
                
                <p style="margin:1rem 0 0; color:#6b7280; font-size:0.875rem;">
                  Secure payment via QuickBooks
                </p>
              </div>
              
              <div style="background:#fff; padding:1rem; border-radius:6px; margin-top:1rem; border-top:1px solid #e5e7eb;">
                <p style="margin:0 0 0.5rem 0; color:#6b7280; font-size:0.875rem; text-align:center;">Or contact us:</p>
                <p style="margin:0; color:#6b7280; font-size:0.875rem; text-align:center;">
                  📧 <a href="mailto:billing@fedevent.com">billing@fedevent.com</a> | 
                  📞 (305) 850-7848
                </p>
              </div>
            </div>
            
            <div style="background:#d1fae5; border-left:4px solid #10b981; padding:1rem; margin:1.5rem 0; border-radius:4px;">
              <p style="margin:0; color:#065f46; line-height:1.6;">
                <strong>✓ Your account will be activated within 24 hours</strong> of payment receipt. You'll receive a confirmation email with dashboard access.
              </p>
            </div>
            
            <div style="margin:2rem 0; padding:1rem; background:#f3f4f6; border-radius:8px;">
              <p style="margin:0; color:#374151;"><strong>Your Account Details:</strong></p>
              <p style="margin:0.5rem 0 0; color:#6b7280;">Email: ${email}</p>
              <p style="margin:0.5rem 0 0; color:#6b7280;">Contact Name: ${displayName}</p>
              <p style="margin:0.5rem 0 0; color:#1f2937; font-weight:600;">FEDEVENT Account #: ${fedeventAccountNumber}</p>
              <p style="margin:0.5rem 0 0; color:#dc2626; font-weight:600;">Status: PENDING PAYMENT</p>
            </div>
            
            <h3 style="color:#1f2937; font-size:1rem; margin:1.5rem 0 0.5rem;">What Happens Next:</h3>
            <ol style="color:#374151; line-height:1.8; padding-left:1.5rem;">
              <li>Complete your $49.99 setup fee payment</li>
              <li>Receive account activation confirmation within 24 hours</li>
              <li>Complete your hotel profile in the dashboard</li>
              <li>Start receiving government contract opportunities</li>
            </ol>
            
            <p style="color:#6b7280; font-size:0.875rem; margin-top:2rem;">
              <strong>Questions?</strong> Contact us at <a href="mailto:info@fedevent.com">info@fedevent.com</a> or call (305) 850-7848.
            </p>
          </div>
          
          <div style="background:#f9fafb; padding:1rem; text-align:center; color:#6b7280; font-size:0.875rem;">
            <p style="margin:0;">
              This email was sent because you registered on FEDEVENT.
              <br>FEDEVENT - A service of CREATA Global Event Agency LLC
            </p>
          </div>
        </div>
      `;
      
      try {
        await sendMail({
          to: email,
          subject: welcomeSubject,
          html: welcomeHtml
        });
        console.log(`Welcome email sent successfully to ${email}`);
      } catch (emailError) {
        console.error('Welcome email failed:', emailError?.message || emailError);
        // Don't fail the registration if email fails, but log the issue
      }
      
      // Send admin notification email about new registration
      const adminEmail = process.env.ADMIN_EMAIL || 'info@fedevent.com';
      const adminSubject = `🔔 New Hotel Registration - Payment Required: ${hotelName || displayName}`;
      const adminHtml = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial; max-width:600px; margin:0 auto;">
          <div style="background:#dc2626; padding:1.5rem; text-align:center;">
            <h1 style="color:white; margin:0; font-size:1.3rem;">⚠️ ACTION REQUIRED</h1>
            <p style="color:#fee2e2; margin:0.5rem 0 0;">New Hotel Registration - Setup Fee Payment Needed</p>
          </div>
          
          <div style="padding:2rem; background:#ffffff;">
            <h2 style="color:#1f2937; margin-top:0;">New Hotel Registration</h2>
            
            <div style="background:#fef2f2; border-left:4px solid #dc2626; padding:1rem; margin:1rem 0;">
              <p style="margin:0; color:#991b1b; font-weight:600;">⚠️ COLLECT $49.99 SETUP FEE</p>
            </div>
            
            <div style="background:#f9fafb; padding:1.5rem; border-radius:8px; margin:1.5rem 0;">
              <h3 style="margin:0 0 1rem 0; color:#1f2937;">Hotel Information:</h3>
              <table style="width:100%; border-collapse: collapse;">
                <tr>
                  <td style="padding:0.5rem 0; color:#6b7280; font-weight:600;">Hotel Name:</td>
                  <td style="padding:0.5rem 0; color:#1f2937;">${hotelName || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding:0.5rem 0; color:#6b7280; font-weight:600;">Contact Person:</td>
                  <td style="padding:0.5rem 0; color:#1f2937;">${displayName}</td>
                </tr>
                <tr>
                  <td style="padding:0.5rem 0; color:#6b7280; font-weight:600;">Email:</td>
                  <td style="padding:0.5rem 0; color:#1f2937;"><a href="mailto:${email}">${email}</a></td>
                </tr>
                <tr>
                  <td style="padding:0.5rem 0; color:#6b7280; font-weight:600;">Phone:</td>
                  <td style="padding:0.5rem 0; color:#1f2937;">${req.body.phone || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="padding:0.5rem 0; color:#6b7280; font-weight:600;">Account Number:</td>
                  <td style="padding:0.5rem 0; color:#1f2937; font-weight:600;">${fedeventAccountNumber}</td>
                </tr>
                <tr>
                  <td style="padding:0.5rem 0; color:#6b7280; font-weight:600;">Registered:</td>
                  <td style="padding:0.5rem 0; color:#1f2937;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>
            
            <div style="background:#f0f9ff; border:2px solid #3b82f6; padding:1.5rem; border-radius:8px; margin:1.5rem 0;">
              <h3 style="margin:0 0 1rem 0; color:#1e40af;">📋 Next Steps:</h3>
              <ol style="margin:0; padding-left:1.5rem; color:#374151; line-height:1.8;">
                <li><strong>Contact the hotel</strong> to collect $49.99 setup fee</li>
                <li><strong>Process payment</strong> via QuickBooks</li>
                <li><strong>Mark as paid</strong> in admin dashboard</li>
                <li>System will <strong>automatically activate</strong> the account and send confirmation</li>
              </ol>
            </div>
            
            <div style="text-align:center; margin:2rem 0;">
              <a href="https://fedevent.com/admin-dashboard.html" 
                 style="background:#3b82f6; color:white; padding:12px 24px; text-decoration:none; border-radius:8px; display:inline-block;">
                Open Admin Dashboard
              </a>
            </div>
            
            <div style="background:#d1fae5; padding:1rem; border-radius:6px; margin-top:1.5rem;">
              <p style="margin:0; color:#065f46; font-size:0.9rem;">
                <strong>✓ Customer has been notified</strong> about payment requirements and will expect contact within 24 hours.
              </p>
            </div>
          </div>
          
          <div style="background:#f9fafb; padding:1rem; text-align:center; color:#6b7280; font-size:0.875rem;">
            <p style="margin:0;">
              FEDEVENT Admin Notification System
              <br>CREATA Global Event Agency LLC
            </p>
          </div>
        </div>
      `;
      
      try {
        await sendMail({
          to: adminEmail,
          subject: adminSubject,
          html: adminHtml
        });
        console.log(`Admin notification sent successfully to ${adminEmail}`);
      } catch (emailError) {
        console.error('Admin notification email failed:', emailError?.message || emailError);
        // Don't fail the registration if admin email fails
      }
    } else {
      console.warn('SMTP not configured - welcome emails disabled. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables to enable.');
    }
    
    return ok(res, {
      sessionId,
      user: {
        id: userResult.lastInsertRowid,
        email,
        role: 'hotel',
        username: displayName,
        fedevent_account_number: fedeventAccountNumber
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    return fail(res, 500, 'Registration failed');
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session;
  
  if (sessionId) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  }
  
  return ok(res, { message: 'Logged out successfully' });
});

// Get current user endpoint
app.get('/api/auth/me', requireAuth, (req, res) => {
  let hotelInfo = null;
  if (req.user.hotel_id) {
    hotelInfo = db.prepare(`SELECT * FROM hotels WHERE id = ?`).get(req.user.hotel_id);
  }
  
  return ok(res, {
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      phone: req.user.phone,
      job_title: req.user.job_title,
      hotel_id: req.user.hotel_id
    },
    hotel: hotelInfo
  });
});

// ========== QUICKBOOKS OAUTH ENDPOINTS ==========

// Step 1: Initiate QuickBooks OAuth (Admin only)
app.get('/quickbooks/auth', requireAuth, requireAdmin, (req, res) => {
  try {
    if (!qbOAuthClient) {
      return res.status(500).send('QuickBooks not configured. Set QB_CLIENT_ID and QB_CLIENT_SECRET in .env');
    }
    
    const authUri = qbOAuthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.Payment],
      state: 'FEDEVENT-QB-Connect',
    });
    
    console.log('🔐 Redirecting to QuickBooks OAuth...');
    res.redirect(authUri);
  } catch (error) {
    console.error('QB OAuth initiation error:', error);
    res.status(500).send('Failed to initiate QuickBooks connection');
  }
});
// Step 2: OAuth Callback from QuickBooks
app.get('/api/quickbooks/callback', async (req, res) => {
  try {
    if (!qbOAuthClient) {
      return res.status(500).send('QuickBooks not configured');
    }
    
    console.log('📥 Received QuickBooks OAuth callback');
    
    const authResponse = await qbOAuthClient.createToken(req.url);
    const tokenData = authResponse.getJson();
    
    // Save tokens to database
    saveQuickBooksTokens(tokenData);
    
    console.log('✅ QuickBooks connected successfully!');
    console.log(`   Realm ID: ${tokenData.realmId}`);
    console.log(`   Token expires in: ${tokenData.expires_in} seconds`);
    
    res.send(`
      <html>
        <head>
          <title>QuickBooks Connected</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .success { background: #d1fae5; color: #065f46; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .btn { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>✅ QuickBooks Connected!</h1>
          <div class="success">
            <p><strong>Your FEDEVENT system is now connected to QuickBooks!</strong></p>
            <p>Realm ID: ${tokenData.realmId}</p>
            <p>Invoices will now be created automatically when hotels register.</p>
          </div>
          <a href="/admin-payments.html" class="btn">Go to Admin Dashboard</a>
          <p style="color: #6b7280; margin-top: 30px;">You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ QuickBooks OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center;">
          <h1>❌ Connection Failed</h1>
          <p style="color: #ef4444;">${error.message}</p>
          <p>Please try again or contact support.</p>
        </body>
      </html>
    `);
  }
});

// QuickBooks Webhook - Receive payment notifications
app.post('/api/quickbooks/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    console.log('📥 QuickBooks webhook received');
    
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const events = payload.eventNotifications || [];
    
    for (const event of events) {
      const entities = event.dataChangeEvent?.entities || [];
      
      for (const entity of entities) {
        if (entity.name === 'Payment' && entity.operation === 'Create') {
          console.log(`💰 Payment received notification: ${entity.id}`);
          
          try {
            // Get payment details from QuickBooks to find the invoice
            const accessToken = await ensureFreshQuickBooksToken();
            if (!accessToken) continue;
            
            const tokens = getQuickBooksTokens();
            const qbo = new QuickBooks(
              process.env.QB_CLIENT_ID,
              process.env.QB_CLIENT_SECRET,
              accessToken,
              false,
              tokens.realm_id,
              process.env.QB_ENVIRONMENT !== 'production',
              true,
              null,
              '2.0'
            );
            
            // Get payment details
            const payment = await new Promise((resolve, reject) => {
              qbo.getPayment(entity.id, (err, payment) => {
                if (err) reject(err);
                else resolve(payment);
              });
            });
            
            console.log(`✅ QB Payment details retrieved: ${payment.Id}`);
            
            // Find associated invoice
            if (payment.Line && payment.Line.length > 0) {
              for (const line of payment.Line) {
                if (line.LinkedTxn && line.LinkedTxn.length > 0) {
                  for (const linkedTxn of line.LinkedTxn) {
                    if (linkedTxn.TxnType === 'Invoice') {
                      const invoiceId = linkedTxn.TxnId;
                      console.log(`📄 Found linked invoice: ${invoiceId}`);
                      
                      // Find payment record in our database
                      const dbPayment = db.prepare(`
                        SELECT p.*, u.email, u.first_name, u.last_name
                        FROM payments p
                        JOIN users u ON p.user_id = u.id
                        WHERE p.quickbooks_invoice_id = ?
                        AND p.status = 'pending'
                      `).get(invoiceId);
                      
                      if (dbPayment) {
                        console.log(`🎯 Found matching payment record for ${dbPayment.email}`);
                        
                        // Mark as paid
                        db.prepare(`
                          UPDATE payments
                          SET status = 'paid',
                              paid_at = datetime('now'),
                              quickbooks_payment_id = ?,
                              transaction_note = 'Paid via QuickBooks (auto-detected)'
                          WHERE id = ?
                        `).run(payment.Id, dbPayment.id);
                        
                        // Activate account
                        db.prepare(`
                          UPDATE users
                          SET account_status = 'active',
                              setup_fee_paid = 1
                          WHERE id = ?
                        `).run(dbPayment.user_id);
                        
                        console.log(`✅ Account auto-activated for ${dbPayment.email}`);
                        
                        // Send activation email
                        if (process.env.SMTP_HOST) {
                          const activationHtml = `
                            <div style="font-family:system-ui; max-width:600px; margin:0 auto;">
                              <div style="background:#10b981; padding:2rem; text-align:center;">
                                <h1 style="color:white; margin:0;">🎉 Payment Received!</h1>
                                <p style="color:#d1fae5; margin:0.5rem 0 0;">Your FEDEVENT account is now active</p>
                              </div>
                              
                              <div style="padding:2rem; background:#ffffff;">
                                <h2 style="color:#1f2937; margin-top:0;">Hello ${dbPayment.first_name}!</h2>
                                
                                <div style="background:#d1fae5; border-left:4px solid #10b981; padding:1rem; margin:1.5rem 0; border-radius:4px;">
                                  <p style="margin:0; color:#065f46; line-height:1.6;">
                                    <strong>✓ Payment confirmed!</strong> Your $49.99 setup fee has been processed and your account is now fully active.
                                  </p>
                                </div>
                                
                                <p>You can now access your dashboard and complete your hotel profile.</p>
                                
                                <div style="text-align:center; margin:2rem 0;">
                                  <a href="https://fedevent.com/hotel-dashboard.html" 
                                     style="background:#3b82f6; color:white; padding:14px 28px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:600;">
                                    Access Your Dashboard →
                                  </a>
                                </div>
                              </div>
                            </div>
                          `;
                          
                          try {
                            await sendMail({
                              to: dbPayment.email,
                              subject: '🎉 Payment Confirmed - Your FEDEVENT Account is Active!',
                              html: activationHtml
                            });
                            console.log(`✅ Activation email sent to ${dbPayment.email}`);
                          } catch (emailErr) {
                            console.error('Email send failed:', emailErr);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (paymentError) {
            console.error('Error processing payment notification:', paymentError);
          }
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.sendStatus(500);
  }
});

// Check QuickBooks connection status (Admin only)
app.get('/api/quickbooks/status', requireAuth, requireAdmin, (req, res) => {
  try {
    const tokens = getQuickBooksTokens();
    
    if (!tokens) {
      return ok(res, {
        connected: false,
        message: 'Not connected to QuickBooks'
      });
    }
    
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = tokens.token_expires_at - now;
    
    return ok(res, {
      connected: true,
      realmId: tokens.realm_id,
      tokenExpiresIn: expiresIn > 0 ? expiresIn : 0,
      tokenExpired: expiresIn <= 0,
      lastUpdated: tokens.updated_at
    });
  } catch (error) {
    return fail(res, 500, 'Failed to check QuickBooks status');
  }
});

// ========== PAYMENT MANAGEMENT ENDPOINTS ==========

// Get pending payments (Admin only)
app.get('/api/admin/payments/pending', requireAuth, requireAdmin, (req, res) => {
  try {
    const pendingPayments = db.prepare(`
      SELECT 
        p.*,
        u.email,
        u.first_name,
        u.last_name,
        u.fedevent_account_number,
        h.hotel_name
      FROM payments p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN hotels h ON u.hotel_id = h.id
      WHERE p.status = 'pending'
      ORDER BY p.created_at DESC
    `).all();
    
    return ok(res, { payments: pendingPayments });
  } catch (error) {
    console.error('Error fetching pending payments:', error);
    return fail(res, 500, 'Failed to fetch pending payments');
  }
});

// Get hotel waitlist data (Admin only)
app.get('/api/admin/waitlist', requireAuth, requireAdmin, (req, res) => {
  try {
    const leads = db.prepare(`
      SELECT * FROM hotel_leads
      ORDER BY created_at DESC
    `).all();
    
    return ok(res, { leads });
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    return fail(res, 500, 'Failed to fetch waitlist data');
  }
});
// Export hotel waitlist to Excel (Admin only)
app.get('/api/admin/waitlist/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const leads = db.prepare(`
      SELECT * FROM hotel_leads
      ORDER BY created_at DESC
    `).all();
    
    // Import ExcelJS
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Hotel Waitlist');
    
    // Define columns with CRM tracking fields
    worksheet.columns = [
      { header: 'User Code', key: 'user_code', width: 15 },
      { header: 'Hotel Name', key: 'hotel_name', width: 30 },
      { header: 'Address', key: 'hotel_address', width: 40 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Zip Code', key: 'zip_code', width: 12 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Contact Name', key: 'contact_name', width: 25 },
      { header: 'Title', key: 'title', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Hotel Phone', key: 'hotel_phone', width: 15 },
      { header: 'Indoor Property', key: 'indoor_property', width: 15 },
      { header: 'Accepts NET30', key: 'accepts_net30', width: 15 },
      { header: 'Accepts Direct Bill (No App)', key: 'accepts_po', width: 20 },
      { header: '30% Discount', key: 'accepts_discount', width: 15 },
      { header: 'Interests', key: 'interests', width: 40 },
      { header: 'Priority Level', key: 'priority_level', width: 15 },
      { header: 'Invitation Status', key: 'invitation_status', width: 18 },
      { header: 'Invited Date', key: 'invited_at', width: 20 },
      { header: 'Registration Status', key: 'registration_status', width: 20 },
      { header: 'Last Contacted', key: 'last_contacted_at', width: 20 },
      { header: 'Notes', key: 'notes', width: 40 },
      { header: 'Signed Up Date', key: 'created_at', width: 20 }
    ];
    
    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // Add data rows with CRM tracking fields
    leads.forEach(lead => {
      const row = worksheet.addRow({
        user_code: lead.user_code,
        hotel_name: lead.hotel_name,
        hotel_address: lead.hotel_address,
        city: lead.city,
        state: lead.state,
        zip_code: lead.zip_code,
        country: lead.country,
        contact_name: lead.contact_name,
        title: lead.title,
        email: lead.email,
        phone: lead.phone,
        hotel_phone: lead.hotel_phone,
        indoor_property: lead.indoor_property,
        accepts_net30: lead.accepts_net30,
        accepts_po: lead.accepts_po,
        accepts_discount: lead.accepts_discount || 'No',
        interests: lead.interests,
        priority_level: lead.priority_level || 'normal',
        invitation_status: lead.invitation_status || 'not_invited',
        invited_at: lead.invited_at || '',
        registration_status: lead.registration_status || 'waitlist',
        last_contacted_at: lead.last_contacted_at || '',
        notes: lead.notes || '',
        created_at: lead.created_at
      });
      
      // Color code registration status
      const statusCell = row.getCell('registration_status');
      if (lead.registration_status === 'registered') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
      } else if (lead.registration_status === 'active') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } };
      } else if (lead.invitation_status === 'invited') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      }
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=hotel-waitlist-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    // Write to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Error exporting waitlist:', error);
    return fail(res, 500, 'Failed to export waitlist data');
  }
});

// Get all email contacts (Admin only) - for invitation campaigns
app.get('/api/admin/email-contacts', requireAuth, requireAdmin, (req, res) => {
  try {
    const contacts = db.prepare(`
      SELECT * FROM email_contacts
      ORDER BY created_at DESC
    `).all();
    
    return ok(res, { contacts });
  } catch (error) {
    console.error('Error fetching email contacts:', error);
    return fail(res, 500, 'Failed to fetch email contacts');
  }
});

// Bulk send invitations to email contacts (Admin only)
app.post('/api/admin/email-contacts/bulk-invite', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { contactIds, emailSubject, emailBody, sendEmail = true } = req.body;
    
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return fail(res, 400, 'Contact IDs array is required');
    }
    
    const adminUserId = req.user.id;
    const invitedAt = new Date().toISOString();
    let successCount = 0;
    let failedEmails = [];
    
    for (const contactId of contactIds) {
      try {
        const contact = db.prepare('SELECT * FROM email_contacts WHERE id = ?').get(contactId);
        if (!contact) continue;
        
        // Update invitation status
        db.prepare(`
          UPDATE email_contacts 
          SET invitation_status = 'invited',
              invited_at = ?,
              invited_by = ?,
              last_contacted_at = ?
          WHERE id = ?
        `).run(invitedAt, adminUserId, invitedAt, contactId);
        
        // Send invitation email if enabled
        if (sendEmail && process.env.SMTP_HOST) {
          try {
            const subject = emailSubject || `🏛️ Join FEDEVENT - Federal Hotel Network Invitation`;
            const body = emailBody || `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>FEDEVENT Invitation</title>
              </head>
              <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  
                  <!-- Header -->
                  <div style="background: #ffffff; padding: 40px 30px; text-align: center; border-bottom: 3px solid #dc2626;">
                    <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">
                      <span style="color: #dc2626;">FED</span><span style="color: #1e40af;">EVENT</span>
                    </div>
                    <div style="color: #6b7280; font-size: 18px; font-weight: 500;">
                      The Premier Federal Hotel Network
                    </div>
                  </div>
                  
                  <!-- Main Content -->
                  <div style="padding: 40px 30px;">
                    <h1 style="color: #1e40af; font-size: 28px; margin: 0 0 20px 0; text-align: center; font-weight: 700;">
                      🎯 Exclusive Invitation for ${contact.hotel_name}
                    </h1>
                    
                    <p style="color: #374151; font-size: 18px; line-height: 1.6; margin: 0 0 25px 0;">
                      Dear <strong>${contact.contact_name}</strong>,
                    </p>
                    
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                      We're thrilled to invite <strong>${contact.hotel_name}</strong> to join FEDEVENT, the most exclusive network connecting premium hotels with federal government travelers.
                    </p>
                    
                    <!-- Benefits Section -->
                    <div style="background: #f0f9ff; border-left: 4px solid #dc2626; padding: 25px; margin: 30px 0; border-radius: 8px;">
                      <h3 style="color: #dc2626; font-size: 20px; margin: 0 0 15px 0; font-weight: 600;">
                        🚀 Why Join FEDEVENT?
                      </h3>
                      <ul style="color: #374151; font-size: 16px; line-height: 1.8; margin: 0; padding-left: 20px;">
                        <li><strong>💰 Revenue Opportunity:</strong> Access to $2.3B+ in annual federal travel spending</li>
                        <li><strong>🏛️ Government Events:</strong> Connect with federal agencies through our platform</li>
                        <li><strong>⭐ Global Network:</strong> Join our worldwide network of partner hotels</li>
                        <li><strong>📈 Growth Opportunity:</strong> Expand your business through our platform</li>
                        <li><strong>🛡️ Verified Process:</strong> Secure, compliant booking system</li>
                      </ul>
                    </div>
                    
                    <!-- CTA Section -->
                    <div style="text-align: center; margin: 35px 0;">
                      <a href="${process.env.BASE_URL || 'https://fedevent.com'}/prelaunch.html" 
                         style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); 
                                color: white; text-decoration: none; padding: 18px 40px; 
                                border-radius: 12px; font-size: 18px; font-weight: 600; 
                                box-shadow: 0 4px 14px rgba(5, 150, 105, 0.3); 
                                transition: all 0.3s ease;">
                        🎯 Join FEDEVENT Now - It's Free!
                      </a>
                    </div>
                    
                    <!-- Stats Section -->
                    <div style="background: #f8fafc; padding: 25px; border-radius: 12px; margin: 30px 0; text-align: center;">
                      <h3 style="color: #dc2626; font-size: 18px; margin: 0 0 15px 0; font-weight: 600;">
                        📊 FEDEVENT by the Numbers
                      </h3>
                      <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 20px;">
                        <div style="text-align: center;">
                          <div style="color: #dc2626; font-size: 24px; font-weight: bold;">$2.3B+</div>
                          <div style="color: #6b7280; font-size: 14px;">Annual Federal Travel</div>
                        </div>
                        <div style="text-align: center;">
                          <div style="color: #dc2626; font-size: 24px; font-weight: bold;">Global</div>
                          <div style="color: #6b7280; font-size: 14px;">Partner Network</div>
                        </div>
                        <div style="text-align: center;">
                          <div style="color: #dc2626; font-size: 24px; font-weight: bold;">50+</div>
                          <div style="color: #6b7280; font-size: 14px;">Federal Agencies</div>
                        </div>
                      </div>
                    </div>
                    
                    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; text-align: center;">
                      <strong>Limited Time:</strong> Join now and get priority placement in our federal agency directory.
                    </p>
                  </div>
                  
                  <!-- Footer -->
                  <div style="background: #1f2937; color: #d1d5db; padding: 30px; text-align: center;">
                    <div style="font-size: 16px; font-weight: 600; margin-bottom: 10px;">
                      Ready to grow your government business?
                    </div>
                    <div style="font-size: 14px; margin-bottom: 20px;">
                      Join FEDEVENT today and start serving federal travelers tomorrow.
                    </div>
                    <div style="font-size: 12px; color: #9ca3af;">
                      FEDEVENT Team | Federal Hotel Network<br>
                      This invitation is exclusive to ${contact.hotel_name}
                    </div>
                  </div>
                  
                </div>
              </body>
              </html>
            `;
            
            await sendMail({
              from: process.env.SMTP_FROM || 'noreply@fedevent.com',
              to: contact.email,
              subject: subject,
              html: body
            });
            successCount++;
          } catch (emailError) {
            console.error(`Failed to send email to ${contact.email}:`, emailError);
            failedEmails.push({ email: contact.email, error: emailError.message });
          }
        } else {
          successCount++;
        }
      } catch (error) {
        console.error(`Error processing contact ${contactId}:`, error);
      }
    }
    
    return ok(res, { 
      message: `Invitations sent to ${successCount} contacts`,
      successCount,
      totalProcessed: contactIds.length,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined
    });
  } catch (error) {
    console.error('Error sending bulk invitations:', error);
    return fail(res, 500, 'Failed to send invitations');
  }
});

// Send bulk prelaunch invitations to email contacts (Admin only)
app.post('/api/admin/prelaunch/bulk-send', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { contactIds, customSubject, testMode = false } = req.body;
    
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return fail(res, 400, 'Contact IDs array is required');
    }
    
    if (!process.env.SMTP_HOST) {
      return fail(res, 400, 'SMTP not configured');
    }
    
    const adminUserId = req.user.id;
    const now = new Date().toISOString();
    let successCount = 0;
    let skippedCount = 0;
    let failedEmails = [];
    
    for (const contactId of contactIds) {
      try {
        const contact = db.prepare('SELECT * FROM email_contacts WHERE id = ?').get(contactId);
        if (!contact) {
          console.log(`Contact ${contactId} not found, skipping`);
          continue;
        }
        
        // Skip if already unsubscribed
        if (contact.unsubscribed === 1) {
          console.log(`Contact ${contact.email} is unsubscribed, skipping`);
          skippedCount++;
          continue;
        }
        
        // Generate or retrieve unsubscribe token
        let unsubscribeToken = contact.unsubscribe_token;
        if (!unsubscribeToken) {
          unsubscribeToken = crypto.randomBytes(32).toString('hex');
          db.prepare('UPDATE email_contacts SET unsubscribe_token = ? WHERE id = ?')
            .run(unsubscribeToken, contactId);
        }
        
        // Generate email HTML
        const html = generatePrelaunchInvitationEmail({
          hotelName: contact.hotel_name,
          contactName: contact.contact_name || 'Hotel Partner',
          unsubscribeToken
        });
        
        const subject = customSubject || '🏨 Exclusive Invitation: Join FEDEVENT Early Access';
        
        // Send email (skip in test mode)
        if (!testMode) {
          const result = await sendMail({
            to: contact.email,
            subject,
            html,
            from: process.env.SMTP_FROM || 'noreply@fedevent.com'
          });
          
          if (result.ok) {
            // Update contact status
            db.prepare(`
              UPDATE email_contacts 
              SET invitation_status = 'invited',
                  invited_at = ?,
                  invited_by = ?,
                  last_contacted_at = ?
              WHERE id = ?
            `).run(now, adminUserId, now, contactId);
            
            successCount++;
            console.log(`✅ Email sent to ${contact.email}`);
          } else {
            failedEmails.push({ 
              email: contact.email, 
              error: result.error || 'Email send failed' 
            });
          }
        } else {
          successCount++;
          console.log(`✅ Test mode: Would send to ${contact.email}`);
        }
        
        // Add small delay to avoid rate limiting (100ms between emails)
        if (!testMode) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`Error processing contact ${contactId}:`, error);
        const contact = db.prepare('SELECT email FROM email_contacts WHERE id = ?').get(contactId);
        failedEmails.push({ 
          email: contact?.email || `ID:${contactId}`, 
          error: error.message 
        });
      }
    }
    
    return ok(res, { 
      message: testMode 
        ? `Test mode: Would send to ${successCount} contacts` 
        : `Emails sent to ${successCount} contacts`,
      successCount,
      skippedCount,
      failedCount: failedEmails.length,
      totalProcessed: contactIds.length,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
      testMode
    });
  } catch (error) {
    console.error('Error sending bulk prelaunch emails:', error);
    return fail(res, 500, 'Failed to send prelaunch invitations');
  }
});

// Unsubscribe endpoint (public, no auth required)
app.get('/api/unsubscribe', (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return fail(res, 400, 'Unsubscribe token is required');
    }
    
    // Try email_contacts first
    const contact = db.prepare('SELECT * FROM email_contacts WHERE unsubscribe_token = ?').get(token);
    
    if (contact) {
      if (contact.unsubscribed === 1) {
        return ok(res, { 
          message: 'Already unsubscribed',
          email: contact.email,
          alreadyUnsubscribed: true
        });
      }
      
      db.prepare(`
        UPDATE email_contacts 
        SET unsubscribed = 1, unsubscribed_at = datetime('now')
        WHERE unsubscribe_token = ?
      `).run(token);
      
      return ok(res, { 
        message: 'Successfully unsubscribed',
        email: contact.email,
        success: true
      });
    }
    
    // Try hotel_leads
    const lead = db.prepare('SELECT * FROM hotel_leads WHERE unsubscribe_token = ?').get(token);
    
    if (lead) {
      if (lead.unsubscribed === 1) {
        return ok(res, { 
          message: 'Already unsubscribed',
          email: lead.email,
          alreadyUnsubscribed: true
        });
      }
      
      db.prepare(`
        UPDATE hotel_leads 
        SET unsubscribed = 1, unsubscribed_at = datetime('now')
        WHERE unsubscribe_token = ?
      `).run(token);
      
      return ok(res, { 
        message: 'Successfully unsubscribed',
        email: lead.email,
        success: true
      });
    }
    
    return fail(res, 404, 'Invalid unsubscribe token');
    
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return fail(res, 500, 'Failed to process unsubscribe request');
  }
});

// Get unsubscribed contacts (Admin only)
app.get('/api/admin/unsubscribed', requireAuth, requireAdmin, (req, res) => {
  try {
    const unsubscribedContacts = db.prepare(`
      SELECT email, hotel_name, unsubscribed_at, 'email_contacts' as source
      FROM email_contacts 
      WHERE unsubscribed = 1
      UNION ALL
      SELECT email, hotel_name, unsubscribed_at, 'hotel_leads' as source
      FROM hotel_leads 
      WHERE unsubscribed = 1
      ORDER BY unsubscribed_at DESC
    `).all();
    
    return ok(res, { 
      unsubscribed: unsubscribedContacts,
      total: unsubscribedContacts.length
    });
  } catch (error) {
    console.error('Error fetching unsubscribed contacts:', error);
    return fail(res, 500, 'Failed to fetch unsubscribed contacts');
  }
});

// Export email contacts to Excel (Admin only)
app.get('/api/admin/email-contacts/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const contacts = db.prepare(`
      SELECT * FROM email_contacts
      ORDER BY created_at DESC
    `).all();
    
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Email Contacts');
    
    worksheet.columns = [
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Hotel Name', key: 'hotel_name', width: 30 },
      { header: 'Contact Name', key: 'contact_name', width: 25 },
      { header: 'Address', key: 'address', width: 40 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'State', key: 'state', width: 10 },
      { header: 'Zip Code', key: 'zip_code', width: 12 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Priority Level', key: 'priority_level', width: 15 },
      { header: 'Invitation Status', key: 'invitation_status', width: 18 },
      { header: 'Invited Date', key: 'invited_at', width: 20 },
      { header: 'Registered', key: 'registered', width: 12 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];
    
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF7c3aed' }
    };
    
    contacts.forEach(contact => {
      const row = worksheet.addRow(contact);
      
      // Color code by status
      if (contact.registered === 'Yes') {
        row.getCell('registered').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
      } else if (contact.invitation_status === 'invited') {
        row.getCell('invitation_status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      }
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=email-contacts-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting email contacts:', error);
    return fail(res, 500, 'Failed to export email contacts');
  }
});

// Bulk send invitations to waitlist leads (Admin only)
app.post('/api/admin/waitlist/bulk-invite', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { leadIds, emailSubject, emailBody, sendEmail = true } = req.body;
    
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return fail(res, 400, 'Lead IDs array is required');
    }
    
    const adminUserId = req.user.id;
    const invitedAt = new Date().toISOString();
    let successCount = 0;
    let failedEmails = [];
    
    for (const leadId of leadIds) {
      try {
        const lead = db.prepare('SELECT * FROM hotel_leads WHERE id = ?').get(leadId);
        if (!lead) continue;
        
        // Update invitation status
        db.prepare(`
          UPDATE hotel_leads 
          SET invitation_status = 'invited',
              invited_at = ?,
              invited_by = ?,
              last_contacted_at = ?
          WHERE id = ?
        `).run(invitedAt, adminUserId, invitedAt, leadId);
        
        // Send invitation email if enabled
        if (sendEmail && process.env.SMTP_HOST) {
          try {
            const subject = emailSubject || `🏛️ Welcome to FEDEVENT - Your Exclusive Registration Code: ${lead.user_code}`;
            const body = emailBody || `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>FEDEVENT Registration Invitation</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
                  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                  .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 40px 30px; text-align: center; }
                  .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
                  .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 16px; }
                  .content { padding: 40px 30px; }
                  .greeting { font-size: 18px; color: #1f2937; margin-bottom: 20px; }
                  .message { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
                  .code-box { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border: 2px solid #d1d5db; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }
                  .code { font-size: 24px; font-weight: 700; color: #1e40af; letter-spacing: 2px; font-family: 'Courier New', monospace; }
                  .cta-button { display: inline-block; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; transition: transform 0.2s ease; }
                  .cta-button:hover { transform: translateY(-2px); }
                  .benefits { background: #f9fafb; border-radius: 8px; padding: 24px; margin: 30px 0; }
                  .benefits h3 { margin: 0 0 16px 0; color: #1f2937; font-size: 18px; }
                  .benefits ul { margin: 0; padding-left: 20px; color: #4b5563; }
                  .benefits li { margin-bottom: 8px; line-height: 1.5; }
                  .contact { background: #f3f4f6; padding: 24px; text-align: center; color: #6b7280; font-size: 14px; }
                  .contact a { color: #3b82f6; text-decoration: none; }
                  .footer { background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px; }
                  @media (max-width: 600px) { .container { margin: 0; border-radius: 0; } .header, .content, .contact, .footer { padding: 20px; } }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>🏛️ FEDEVENT</h1>
                    <p>Federal Event Management Solutions</p>
                  </div>
                  
                  <div class="content">
                    <div class="greeting">Dear ${lead.contact_name},</div>
                    
                    <div class="message">
                      Thank you for your interest in joining FEDEVENT's exclusive network of government-approved hotels. We're excited to invite you to complete your registration and become part of our premium hospitality network.
                    </div>
                    
                    <div class="code-box">
                      <div style="color: #6b7280; font-size: 14px; margin-bottom: 8px;">Your Exclusive Registration Code:</div>
                      <div class="code">${lead.user_code}</div>
                    </div>
                    
                    <div style="text-align: center;">
                      <a href="${process.env.BASE_URL || 'https://fedevent.com'}/hotel-registration.html" class="cta-button">
                        Complete Registration Now
                      </a>
                    </div>
                    
                    <div class="benefits">
                      <h3>🎯 Why Join FEDEVENT?</h3>
                      <ul>
                        <li><strong>Guaranteed Government Contracts</strong> - Access exclusive federal event opportunities</li>
                        <li><strong>NET30 Payment Terms</strong> - No upfront deposits, payment within 30 days</li>
                        <li><strong>Professional Support</strong> - Dedicated account management and 24/7 support</li>
                        <li><strong>Premium Network</strong> - Join AAA 2+ Diamond rated properties only</li>
                        <li><strong>Streamlined Process</strong> - Simple registration and contract management</li>
                      </ul>
                    </div>
                    
                    <div class="message">
                      <strong>Registration is quick and easy:</strong><br>
                      1. Click the button above to access the registration form<br>
                      2. Enter your registration code when prompted<br>
                      3. Complete your hotel profile and submit required documents<br>
                      4. Get approved within 2-4 business days<br>
                      5. Start receiving government contract opportunities!
                    </div>
                  </div>
                  
                  <div class="contact">
                    <strong>Need Help?</strong><br>
                    📞 Call us at <a href="tel:305-850-7848">(305) 850-7848</a><br>
                    📧 Email us at <a href="mailto:info@fedevent.com">info@fedevent.com</a><br>
                    🌐 Visit us at <a href="${process.env.BASE_URL || 'https://fedevent.com'}">fedevent.com</a>
                  </div>
                  
                  <div class="footer">
                    <p style="margin: 0;">© 2025 CREATA Global Event Agency LLC. All rights reserved.</p>
                    <p style="margin: 8px 0 0 0;">This is an exclusive invitation. Please do not share your registration code.</p>
                  </div>
                </div>
              </body>
              </html>
            `;
            
            await sendMail({
              from: process.env.SMTP_FROM || 'noreply@fedevent.com',
              to: lead.email,
              subject: subject,
              html: body
            });
            successCount++;
          } catch (emailError) {
            console.error(`Failed to send email to ${lead.email}:`, emailError);
            failedEmails.push({ email: lead.email, error: emailError.message });
          }
        } else {
          successCount++;
        }
      } catch (error) {
        console.error(`Error processing lead ${leadId}:`, error);
      }
    }
    
    return ok(res, { 
      message: `Invitation status updated for ${successCount} leads`,
      successCount,
      totalProcessed: leadIds.length,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined
    });
  } catch (error) {
    console.error('Error sending bulk invitations:', error);
    return fail(res, 500, 'Failed to send invitations');
  }
});
// Update single lead status (Admin only)
app.put('/api/admin/waitlist/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const leadId = req.params.id;
    const { 
      invitation_status, 
      registration_status, 
      priority_level, 
      notes,
      last_contacted_at 
    } = req.body;
    
    const lead = db.prepare('SELECT * FROM hotel_leads WHERE id = ?').get(leadId);
    if (!lead) {
      return fail(res, 404, 'Lead not found');
    }
    
    const updates = [];
    const params = [];
    
    if (invitation_status) {
      updates.push('invitation_status = ?');
      params.push(invitation_status);
      if (invitation_status === 'invited' && !lead.invited_at) {
        updates.push('invited_at = ?');
        params.push(new Date().toISOString());
        updates.push('invited_by = ?');
        params.push(req.user.id);
      }
    }
    
    if (registration_status) {
      updates.push('registration_status = ?');
      params.push(registration_status);
    }
    
    if (priority_level) {
      updates.push('priority_level = ?');
      params.push(priority_level);
    }
    
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }
    
    if (last_contacted_at !== undefined) {
      updates.push('last_contacted_at = ?');
      params.push(last_contacted_at || new Date().toISOString());
    }
    
    if (updates.length === 0) {
      return fail(res, 400, 'No valid fields to update');
    }
    
    params.push(leadId);
    db.prepare(`UPDATE hotel_leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    const updatedLead = db.prepare('SELECT * FROM hotel_leads WHERE id = ?').get(leadId);
    return ok(res, { lead: updatedLead });
  } catch (error) {
    console.error('Error updating lead:', error);
    return fail(res, 500, 'Failed to update lead');
  }
});

// Bulk update lead statuses (Admin only)
app.put('/api/admin/waitlist/bulk-update', requireAuth, requireAdmin, (req, res) => {
  try {
    const { leadIds, updates } = req.body;
    
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return fail(res, 400, 'Lead IDs array is required');
    }
    
    if (!updates || typeof updates !== 'object') {
      return fail(res, 400, 'Updates object is required');
    }
    
    const updateFields = [];
    const params = [];
    
    if (updates.invitation_status) {
      updateFields.push('invitation_status = ?');
      params.push(updates.invitation_status);
    }
    
    if (updates.registration_status) {
      updateFields.push('registration_status = ?');
      params.push(updates.registration_status);
    }
    
    if (updates.priority_level) {
      updateFields.push('priority_level = ?');
      params.push(updates.priority_level);
    }
    
    if (updates.notes !== undefined) {
      updateFields.push('notes = ?');
      params.push(updates.notes);
    }
    
    if (updateFields.length === 0) {
      return fail(res, 400, 'No valid fields to update');
    }
    
    const placeholders = leadIds.map(() => '?').join(',');
    const query = `UPDATE hotel_leads SET ${updateFields.join(', ')} WHERE id IN (${placeholders})`;
    const result = db.prepare(query).run(...params, ...leadIds);
    
    return ok(res, { 
      message: 'Leads updated successfully',
      updatedCount: result.changes
    });
  } catch (error) {
    console.error('Error bulk updating leads:', error);
    return fail(res, 500, 'Failed to bulk update leads');
  }
});
// Sync registered hotels with waitlist (Admin only) - automatically marks leads as registered
app.post('/api/admin/waitlist/sync-registered', requireAuth, requireAdmin, (req, res) => {
  try {
    // Get all registered hotels
    const hotels = db.prepare(`
      SELECT h.id, h.email, h.prelaunch_code 
      FROM hotels h
      WHERE h.email IS NOT NULL
    `).all();
    
    let syncedCount = 0;
    const syncResults = [];
    
    for (const hotel of hotels) {
      // Try to match by email first
      let lead = db.prepare('SELECT * FROM hotel_leads WHERE email = ?').get(hotel.email);
      
      // If not found and hotel has prelaunch code, try matching by code
      if (!lead && hotel.prelaunch_code) {
        lead = db.prepare('SELECT * FROM hotel_leads WHERE user_code = ?').get(hotel.prelaunch_code);
      }
      
      if (lead) {
        // Update lead to mark as registered
        db.prepare(`
          UPDATE hotel_leads 
          SET registration_status = 'registered',
              registered_hotel_id = ?
          WHERE id = ?
        `).run(hotel.id, lead.id);
        
        // Link hotel to lead if prelaunch code exists
        if (lead.user_code && !hotel.prelaunch_code) {
          db.prepare('UPDATE hotels SET prelaunch_code = ? WHERE id = ?').run(lead.user_code, hotel.id);
        }
        
        syncedCount++;
        syncResults.push({
          leadId: lead.id,
          hotelId: hotel.id,
          hotelEmail: hotel.email,
          matched: 'email'
        });
      }
    }
    
    return ok(res, { 
      message: `Synced ${syncedCount} registered hotels with waitlist`,
      syncedCount,
      details: syncResults
    });
  } catch (error) {
    console.error('Error syncing registered hotels:', error);
    return fail(res, 500, 'Failed to sync registered hotels');
  }
});

// Export registered hotels list for XLOOKUP matching (Admin only)
app.get('/api/admin/hotels/export-emails', requireAuth, requireAdmin, async (req, res) => {
  try {
    const hotels = db.prepare(`
      SELECT h.email, h.name, h.created_at
      FROM hotels h
      WHERE h.email IS NOT NULL
      ORDER BY h.created_at DESC
    `).all();
    
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Registered Hotels');
    
    worksheet.columns = [
      { header: 'Email', key: 'email', width: 40 },
      { header: 'Hotel Name', key: 'name', width: 30 },
      { header: 'Registration Date', key: 'created_at', width: 20 }
    ];
    
    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF00B050' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    hotels.forEach(hotel => {
      worksheet.addRow({
        email: hotel.email,
        name: hotel.name,
        created_at: hotel.created_at
      });
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=registered-hotels-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting registered hotels:', error);
    return fail(res, 500, 'Failed to export registered hotels');
  }
});

// Import email contacts from CSV/Excel (Admin only) - for invitation campaigns
app.post('/api/admin/email-contacts/import-csv', requireAuth, requireAdmin, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No file uploaded');
    }
    
    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let records = [];
    
    // Handle Excel files (.xlsx, .xls)
    if (fileExt === '.xlsx' || fileExt === '.xls') {
      try {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        
        // Convert Excel to array of objects
        const headers = [];
        const data = [];
        
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            // First row is headers
            row.eachCell((cell, colNumber) => {
              headers[colNumber - 1] = cell.value;
            });
          } else {
            // Data rows
            const rowData = {};
            row.eachCell((cell, colNumber) => {
              const header = headers[colNumber - 1];
              if (header) {
                rowData[header] = cell.value;
              }
            });
            if (Object.keys(rowData).length > 0) {
              data.push(rowData);
            }
          }
        });
        
        records = data;
      } catch (excelError) {
        console.error('Excel parsing error:', excelError);
        fs.unlinkSync(filePath); // Clean up
        return fail(res, 400, `Failed to parse Excel file: ${excelError.message}`);
      }
    } else {
      // Handle CSV files
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const { parse } = await import('csv-parse/sync');
        records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true // Handle UTF-8 BOM
        });
      } catch (csvError) {
        console.error('CSV parsing error:', csvError);
        fs.unlinkSync(filePath); // Clean up
        return fail(res, 400, `Failed to parse CSV file: ${csvError.message}`);
      }
    }
    
    if (records.length === 0) {
      fs.unlinkSync(filePath); // Clean up
      return fail(res, 400, 'File is empty or contains no valid data');
    }
    
    let imported = 0;
    let skipped = 0;
    let updated = 0;
    const errors = [];
    
    for (const record of records) {
      try {
        // Map CSV columns to database fields (flexible mapping)
        const email = record.Email || record.email || record.EMAIL || record['Contact Email'];
        const hotelName = record['Hotel Name'] || record.hotel_name || record.HotelName || record.Hotel;
        const contactName = record['Contact Name'] || record.contact_name || record.ContactName || record.Contact;
        
        // Skip if missing required fields
        if (!email || !hotelName || !contactName) {
          skipped++;
          errors.push(`Row skipped: Missing required fields (email: ${email}, hotel: ${hotelName}, contact: ${contactName})`);
          continue;
        }
        
        // Check if contact already exists in email_contacts table
        const existing = db.prepare('SELECT id FROM email_contacts WHERE email = ?').get(email);
        
        // Also check if they're already in the registered waitlist
        const alreadyRegistered = db.prepare('SELECT id FROM hotel_leads WHERE email = ?').get(email);
        if (alreadyRegistered) {
          skipped++;
          errors.push(`Row skipped: ${email} already registered in waitlist`);
          continue;
        }
        
        if (existing) {
          // Update existing email contact
          const updates = [];
          const params = [];
          
          if (hotelName) { updates.push('hotel_name = ?'); params.push(hotelName); }
          if (contactName) { updates.push('contact_name = ?'); params.push(contactName); }
          if (record.Title || record.title) { updates.push('title = ?'); params.push(record.Title || record.title); }
          if (record.Phone || record.phone) { updates.push('phone = ?'); params.push(record.Phone || record.phone); }
          if (record.City || record.city) { updates.push('city = ?'); params.push(record.City || record.city); }
          if (record.State || record.state) { updates.push('state = ?'); params.push(record.State || record.state); }
          if (record.Country || record.country) { updates.push('country = ?'); params.push(record.Country || record.country); }
          if (record['Zip Code'] || record.zip_code) { updates.push('zip_code = ?'); params.push(record['Zip Code'] || record.zip_code); }
          if (record.Address || record.address) { updates.push('address = ?'); params.push(record.Address || record.address); }
          if (record.Notes || record.notes) { updates.push('notes = ?'); params.push(record.Notes || record.notes); }
          if (record['Priority Level'] || record.priority_level) { updates.push('priority_level = ?'); params.push(record['Priority Level'] || record.priority_level); }
          
          if (updates.length > 0) {
            params.push(existing.id);
            db.prepare(`UPDATE email_contacts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new email contact
          db.prepare(`
            INSERT INTO email_contacts (
              email, hotel_name, contact_name, address, city, state, zip_code, country,
              phone, title, notes, priority_level, invitation_status, registered
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            email,
            hotelName,
            contactName,
            record.Address || record.address || null,
            record.City || record.city || null,
            record.State || record.state || null,
            record['Zip Code'] || record.zip_code || null,
            record.Country || record.country || 'USA',
            record.Phone || record.phone || null,
            record.Title || record.title || null,
            record.Notes || record.notes || null,
            record['Priority Level'] || record.priority_level || 'normal',
            'not_invited',
            'No'
          );
          
          imported++;
        }
      } catch (rowError) {
        console.error('Error processing row:', rowError);
        errors.push(`Error processing row: ${rowError.message}`);
        skipped++;
      }
    }
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    return ok(res, {
      message: 'CSV import completed',
      totalRows: records.length,
      imported,
      updated,
      skipped,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Return first 10 errors
    });
  } catch (error) {
    console.error('CSV import error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return fail(res, 500, `Failed to import CSV: ${error.message}`);
  }
});

// Manual waitlist entry (Admin only)
app.post('/api/admin/waitlist/manual-entry', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, hotelName, phone, city, state, title, priority, notes } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !hotelName) {
      return fail(res, 400, 'First name, last name, email, and hotel name are required');
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return fail(res, 400, 'Invalid email format');
    }
    
    // Check if contact already exists in waitlist
    const existing = db.prepare('SELECT id FROM hotel_leads WHERE email = ?').get(email);
    
    if (existing) {
      // Update existing waitlist entry
      const updates = [];
      const params = [];
      
      if (firstName) { updates.push('contact_name = ?'); params.push(`${firstName} ${lastName}`); }
      if (hotelName) { updates.push('hotel_name = ?'); params.push(hotelName); }
      if (phone) { updates.push('phone = ?'); params.push(phone); }
      if (city) { updates.push('city = ?'); params.push(city); }
      if (state) { updates.push('state = ?'); params.push(state); }
      if (title) { updates.push('title = ?'); params.push(title); }
      if (notes) { updates.push('interests = ?'); params.push(notes); }
      
      if (updates.length > 0) {
        params.push(existing.id);
        db.prepare(`UPDATE hotel_leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        
        return ok(res, {
          message: 'Waitlist entry updated successfully',
          leadId: existing.id,
          action: 'updated'
        });
      } else {
        return ok(res, {
          message: 'Waitlist entry already exists with same information',
          leadId: existing.id,
          action: 'no_changes'
        });
      }
    } else {
      // Generate unique user code (FEV-XXXXX format)
      let userCode = '';
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        userCode = `FEV-${randomNum}`;

        const existingCode = db.prepare(`SELECT id FROM hotel_leads WHERE user_code = ?`).get(userCode);
        if (!existingCode) break;

        attempts++;
      }

      if (attempts >= maxAttempts) {
        return fail(res, 500, 'Failed to generate unique user code');
      }

      // Insert new waitlist entry
      const result = db.prepare(`
        INSERT INTO hotel_leads (
          user_code, hotel_name, contact_name, email, phone, city, state, title, interests,
          currently_operating, accept_net30, accept_direct_bill, notified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userCode,
        hotelName,
        `${firstName} ${lastName}`,
        email,
        phone || null,
        city || null,
        state || null,
        title || null,
        notes || null,
        'yes', // Default to currently operating
        'yes', // Default to accepts NET30
        'yes', // Default to accepts direct bill
        0 // Not notified yet
      );
      
      return ok(res, {
        message: 'Waitlist entry added successfully',
        leadId: result.lastInsertRowid,
        userCode: userCode,
        action: 'created'
      });
    }
    
  } catch (error) {
    console.error('Manual waitlist entry error:', error);
    return fail(res, 500, `Failed to add waitlist entry: ${error.message}`);
  }
});

// Manual email contact entry (Admin only)
app.post('/api/admin/email-contacts/manual-entry', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, hotelName, phone, city, state, title, priority, notes } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !hotelName) {
      return fail(res, 400, 'First name, last name, email, and hotel name are required');
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return fail(res, 400, 'Invalid email format');
    }
    
    // Check if contact already exists in email_contacts
    const existing = db.prepare('SELECT id FROM email_contacts WHERE email = ?').get(email);
    
    if (existing) {
      // Update existing email contact
      const updates = [];
      const params = [];
      
      if (firstName) { updates.push('contact_name = ?'); params.push(`${firstName} ${lastName}`); }
      if (hotelName) { updates.push('hotel_name = ?'); params.push(hotelName); }
      if (phone) { updates.push('phone = ?'); params.push(phone); }
      if (city) { updates.push('city = ?'); params.push(city); }
      if (state) { updates.push('state = ?'); params.push(state); }
      if (title) { updates.push('title = ?'); params.push(title); }
      if (priority) { updates.push('priority_level = ?'); params.push(priority); }
      if (notes) { updates.push('notes = ?'); params.push(notes); }
      
      if (updates.length > 0) {
        params.push(existing.id);
        db.prepare(`UPDATE email_contacts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        
        return ok(res, {
          message: 'Email contact updated successfully',
          contactId: existing.id,
          action: 'updated'
        });
      } else {
        return ok(res, {
          message: 'Email contact already exists with same information',
          contactId: existing.id,
          action: 'no_changes'
        });
      }
    } else {
      // Insert new email contact
      const result = db.prepare(`
        INSERT INTO email_contacts (
          email, hotel_name, contact_name, city, state, country,
          phone, title, notes, priority_level, invitation_status, registered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        email,
        hotelName,
        `${firstName} ${lastName}`,
        city || null,
        state || null,
        'USA',
        phone || null,
        title || null,
        notes || null,
        priority || 'normal',
        'not_invited',
        'No'
      );
      
      return ok(res, {
        message: 'Email contact added successfully',
        contactId: result.lastInsertRowid,
        action: 'created'
      });
    }
    
  } catch (error) {
    console.error('Manual email contact entry error:', error);
    return fail(res, 500, `Failed to add email contact: ${error.message}`);
  }
});

// Download CSV import template (Admin only)
app.get('/api/admin/waitlist/csv-template', requireAuth, requireAdmin, async (req, res) => {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Hotel Leads Import Template');
    
    // Define columns matching import expectations
    worksheet.columns = [
      { header: 'Hotel Name*', key: 'hotel_name', width: 30 },
      { header: 'Contact Name*', key: 'contact_name', width: 25 },
      { header: 'Email*', key: 'email', width: 30 },
      { header: 'Title', key: 'title', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Hotel Phone', key: 'hotel_phone', width: 15 },
      { header: 'Address', key: 'hotel_address', width: 40 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Zip Code', key: 'zip_code', width: 12 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Indoor Property', key: 'indoor_property', width: 15 },
      { header: 'Accepts NET30', key: 'accepts_net30', width: 15 },
      { header: 'Accepts Direct Bill', key: 'accepts_po', width: 20 },
      { header: '30% Discount', key: 'accepts_discount', width: 15 },
      { header: 'Interests', key: 'interests', width: 40 },
      { header: 'Priority Level', key: 'priority_level', width: 15 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];
    
    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    
    // Add example row
    worksheet.addRow({
      hotel_name: 'Grand Hotel Example',
      contact_name: 'John Smith',
      email: 'john.smith@grandhotel.com',
      title: 'General Manager',
      phone: '555-123-4567',
      hotel_phone: '555-123-4500',
      hotel_address: '123 Main Street',
      city: 'Washington',
      state: 'DC',
      zip_code: '20001',
      country: 'USA',
      indoor_property: 'Yes',
      accepts_net30: 'Yes',
      accepts_po: 'Yes',
      accepts_discount: 'Yes',
      interests: 'Government contracts, conferences',
      priority_level: 'high',
      notes: 'VIP contact, spoke at conference 2024'
    });
    
    // Add instructions in a note
    worksheet.getCell('A3').value = 'Instructions:';
    worksheet.getCell('A3').font = { bold: true, color: { argb: 'FFFF0000' } };
    worksheet.getCell('A4').value = '1. Fields marked with * are required';
    worksheet.getCell('A5').value = '2. Delete this example row before importing';
    worksheet.getCell('A6').value = '3. Priority Level: normal, high, or urgent';
    worksheet.getCell('A7').value = '4. Yes/No fields: Yes or No (case insensitive)';
    worksheet.getCell('A8').value = '5. Duplicate emails will update existing records';
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=hotel-leads-import-template.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Template download error:', error);
    return fail(res, 500, 'Failed to generate template');
  }
});

// Mark payment as paid (Admin only)
app.post('/api/admin/payments/:paymentId/mark-paid', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { quickbooksInvoiceId, quickbooksPaymentId, note } = req.body;
    
    // Get payment and user details
    const payment = db.prepare(`
      SELECT p.*, u.email, u.first_name, u.last_name, u.fedevent_account_number
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(paymentId);
    
    if (!payment) {
      return fail(res, 404, 'Payment not found');
    }
    
    if (payment.status === 'paid') {
      return fail(res, 400, 'Payment already marked as paid');
    }
    
    // Update payment record
    db.prepare(`
      UPDATE payments
      SET status = 'paid',
          paid_at = datetime('now'),
          quickbooks_invoice_id = ?,
          quickbooks_payment_id = ?,
          transaction_note = ?
      WHERE id = ?
    `).run(quickbooksInvoiceId || null, quickbooksPaymentId || null, note || null, paymentId);
    
    // Update user account status
    db.prepare(`
      UPDATE users
      SET account_status = 'active',
          setup_fee_paid = 1
      WHERE id = ?
    `).run(payment.user_id);
    
    console.log(`✅ Payment marked as paid for user ${payment.email} (Payment ID: ${paymentId})`);
    
    // Send activation email to hotel
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const activationSubject = '🎉 Your FEDEVENT Account is Now Active!';
      const activationHtml = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial; max-width:600px; margin:0 auto;">
          <div style="background:#10b981; padding:2rem; text-align:center;">
            <h1 style="color:white; margin:0;">🎉 Account Activated!</h1>
            <p style="color:#d1fae5; margin:0.5rem 0 0;">Welcome to FEDEVENT</p>
          </div>
          
          <div style="padding:2rem; background:#ffffff;">
            <h2 style="color:#1f2937; margin-top:0;">Hello ${payment.first_name}!</h2>
            
            <div style="background:#d1fae5; border-left:4px solid #10b981; padding:1rem; margin:1.5rem 0; border-radius:4px;">
              <p style="margin:0; color:#065f46; line-height:1.6;">
                <strong>✓ Payment received!</strong> Your FEDEVENT account is now active and ready to use.
              </p>
            </div>
            
            <p style="color:#374151; line-height:1.6;">
              Thank you for completing your setup fee payment of <strong>$49.99</strong>. Your account has been fully activated!
            </p>
            
            <h3 style="color:#1f2937; font-size:1.1rem; margin:1.5rem 0 0.5rem;">What's Next:</h3>
            <ol style="color:#374151; line-height:1.8; padding-left:1.5rem;">
              <li><strong>Complete your hotel profile</strong> in the dashboard</li>
              <li><strong>Upload required documents</strong> (W-9, insurance, etc.)</li>
              <li><strong>Review and accept</strong> government contract terms</li>
              <li><strong>Start receiving</strong> government event opportunities</li>
            </ol>
            
            <div style="background:#f3f4f6; padding:1rem; border-radius:8px; margin:1.5rem 0;">
              <p style="margin:0 0 0.5rem; color:#374151;"><strong>Your Account Details:</strong></p>
              <p style="margin:0.25rem 0; color:#6b7280;">Email: ${payment.email}</p>
              <p style="margin:0.25rem 0; color:#6b7280;">Account #: ${payment.fedevent_account_number}</p>
              <p style="margin:0.25rem 0; color:#10b981; font-weight:600;">Status: ✓ ACTIVE</p>
            </div>
            
            <div style="text-align:center; margin:2rem 0;">
              <a href="https://fedevent.com/hotel-dashboard.html" 
                 style="background:#3b82f6; color:white; padding:14px 28px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:600;">
                Access Your Dashboard →
              </a>
            </div>
            
            <p style="color:#6b7280; font-size:0.875rem; margin-top:2rem;">
              <strong>Need assistance?</strong> Our team is here to help!<br>
              📧 Email: <a href="mailto:info@fedevent.com">info@fedevent.com</a><br>
              📞 Phone: (305) 850-7848
            </p>
          </div>
          
          <div style="background:#f9fafb; padding:1rem; text-align:center; color:#6b7280; font-size:0.875rem;">
            <p style="margin:0;">
              FEDEVENT - Professional Government Event Solutions
              <br>A service of CREATA Global Event Agency LLC
            </p>
          </div>
        </div>
      `;
      
      try {
        await sendMail({
          to: payment.email,
          subject: activationSubject,
          html: activationHtml
        });
        console.log(`✅ Activation email sent to ${payment.email}`);
      } catch (emailError) {
        console.error('Activation email failed:', emailError?.message || emailError);
      }
    }
    
    return ok(res, { 
      message: 'Payment marked as paid and account activated',
      payment: {
        id: paymentId,
        status: 'paid',
        user_email: payment.email
      }
    });
    
  } catch (error) {
    console.error('Error marking payment as paid:', error);
    return fail(res, 500, 'Failed to mark payment as paid');
  }
});

// Authenticated file upload for hotel profile registration
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No file uploaded');
    }

    // Build a public URL for the file
    const uploadsBase = path.join(__dirname, 'uploads');
    const relativePath = path.relative(uploadsBase, req.file.path);
    const fileUrl = `/uploads/${relativePath}`.replace(/\\/g, '/');

    return ok(res, {
      fileUrl,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    return fail(res, 500, 'File upload failed');
  }
});
// ---------- AI Document Processing for Meeting Layouts ----------
// Process meeting layout documents with OpenAI
app.post('/api/process-meeting-layout', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No file uploaded');
    }

    const { fileType } = req.body;
    const file = req.file;
    
    console.log('🤖 Processing meeting layout document:', {
      fileName: file.originalname,
      fileType: fileType,
      mimeType: file.mimetype,
      size: file.size
    });

    // Initialize Claude client
    const claude = await getClaude();

    if (!claude) {
      return fail(res, 500, 'Claude API key not configured on server');
    }

    // Determine handling based on MIME type
    const fileBuffer = fs.readFileSync(file.path);
    let mimeType = file.mimetype || '';
    let useImageInput = mimeType.startsWith('image/');
    let extractedText = '';

    // File size guard (25MB)
    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      fs.unlinkSync(file.path);
      return fail(res, 400, 'File too large. Please upload a file 25MB or smaller.');
    }
    
    // Normalize by declared fileType if provided by client, but DO NOT override
    // to image mode unless the actual uploaded file is an image. This prevents
    // accidentally sending non-image bytes (e.g., PDF) as an image to the AI API.
    if (!useImageInput && fileType === 'image') {
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        useImageInput = true;
        mimeType = file.mimetype; // preserve actual image mime type
      } else {
        // Ignore client-declared image type if the file is not an image
        useImageInput = false;
      }
    }
    
    if (!useImageInput) {
      // Text-based pipeline for PDFs/DOCX
      if (mimeType.includes('pdf') || fileType === 'pdf') {
        try {
          extractedText = await ocrPdfText(file.path);
        } catch (e) {
          console.error('🤖 OCR failed, continuing with empty text:', e.message);
          extractedText = '';
        }
        if (!extractedText || !extractedText.trim()) {
          // One more attempt to hint at scanned/empty
          console.warn('🤖 PDF text empty after OCR');
        }
      } else if (mimeType.includes('wordprocessingml') || /\.docx$/i.test(file.originalname) || fileType === 'docx') {
        try {
          const result = await mammoth.extractRawText({ path: file.path });
          extractedText = (result && result.value) || '';
        } catch (e) {
          console.error('🤖 DOCX extraction failed:', e.message);
          extractedText = '';
        }
      } else if (mimeType === 'application/msword' || /\.doc$/i.test(file.originalname) || fileType === 'doc') {
        fs.unlinkSync(file.path);
        return fail(res, 400, 'Legacy .DOC files are not supported. Please upload PDF, DOCX, JPG, or PNG.');
      } else if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || fileType === 'excel') {
        fs.unlinkSync(file.path);
        return fail(res, 400, 'Excel parsing not yet supported. Please upload PDF, DOCX, JPG, or PNG.');
      } else {
        fs.unlinkSync(file.path);
        return fail(res, 400, 'Unsupported file type. Please upload PDF, DOCX, JPG, or PNG.');
      }
    }

    // Create the prompt for meeting room data extraction
    const systemPrompt = `You are an expert at extracting meeting room information from hotel layout documents. 
    
    Extract meeting room data from the provided document and return it as a JSON array. Each room should include:
    - name: Room name (e.g., "Grand Ballroom", "Conference Room A")
    - level: Floor/level (e.g., "1st Floor", "2nd Floor")
    - area_sqft: Area in square feet (number)
    - length_ft: Length in feet (number)
    - width_ft: Width in feet (number)
    - ceiling_ft: Ceiling height in feet (number)
    - pillar_free: "Yes" or "No"
    - natural_light: "Yes" or "No"
    - divisible: "Yes" or "No"
    - banquet_rounds: Number of banquet round tables (number)
    - theater: Theater-style seating capacity (number)
    - classroom: Classroom-style seating capacity (number)
    - ushape: U-shape seating capacity (number)
    - cocktail_rounds: Cocktail reception capacity (number)
    - crescent_rounds: Crescent round seating capacity (number)
    - hollow_square: Hollow square seating capacity (number)
    - built_in_av: Description of built-in audio/visual equipment
    - power: Power/electrical information
    - loadin: Load-in door information
    
    If information is not available, use reasonable estimates or leave empty. Return only the JSON array, no other text.`;
    
    const userPrompt = `Please extract meeting room information from this ${fileType} document: ${file.originalname}. 
    
    Return the data as a JSON array of room objects with the exact field names specified above.`;

    // Helper: safe JSON parse or extract JSON substring
    function tryParseRooms(jsonLike) {
      try {
        const v = JSON.parse(jsonLike);
        return Array.isArray(v) ? v : [];
      } catch (_) {
        const match = String(jsonLike).match(/\[([\s\S]*?)\]/);
        if (match) {
          try {
            const v2 = JSON.parse(match[0]);
            return Array.isArray(v2) ? v2 : [];
          } catch (_) { /* ignore */ }
        }
        return [];
      }
    }

    // Helper: normalize one room record
    function normalizeRoom(room) {
      const toInt = v => {
        if (v == null) return null;
        const m = String(v).match(/-?\d[\d,]*/);
        return m ? parseInt(m[0].replace(/,/g,''), 10) : null;
      };
      const out = { ...room };
      out.area_sqft = toInt(out.area_sqft);
      out.length_ft = toInt(out.length_ft);
      out.width_ft = toInt(out.width_ft);
      out.ceiling_ft = toInt(out.ceiling_ft);
      out.banquet_rounds = toInt(out.banquet_rounds);
      out.theater = toInt(out.theater);
      out.classroom = toInt(out.classroom);
      out.ushape = toInt(out.ushape);
      out.cocktail_rounds = toInt(out.cocktail_rounds);
      out.crescent_rounds = toInt(out.crescent_rounds);
      out.hollow_square = toInt(out.hollow_square);
      if (typeof out.pillar_free === 'string') out.pillar_free = /yes/i.test(out.pillar_free) ? 'Yes' : /no/i.test(out.pillar_free) ? 'No' : '';
      if (typeof out.natural_light === 'string') out.natural_light = /yes/i.test(out.natural_light) ? 'Yes' : /no/i.test(out.natural_light) ? 'No' : '';
      if (typeof out.divisible === 'string') out.divisible = /yes/i.test(out.divisible) ? 'Yes' : /no/i.test(out.divisible) ? 'No' : '';
      return out;
    }

    // Build and execute model calls
    let consolidatedRooms = [];
    if (useImageInput) {
      // Single vision call for image input
      const base64Data = fileBuffer.toString('base64');
      const messages = [
        { role: 'user', content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
        ] }
      ];
      const response = await claude.messages.create({
        model: 'claude-3-haiku-20240307',
        system: systemPrompt,
        max_tokens: 4000,
        temperature: 0.1,
        messages: [
          { role: 'user', content: userPrompt + `\n\nImage data: data:${mimeType};base64,${base64Data}` }
        ]
      });
      if (!response.content || !response.content[0]) {
        return fail(res, 500, 'Invalid response from Claude API');
      }
      const content = response.content[0].text || '';
      consolidatedRooms = tryParseRooms(content);
    } else {
      const text = (extractedText || '').trim();
      if (!text) {
        fs.unlinkSync(file.path);
        return fail(res, 400, 'No readable text found. If this is a scanned PDF/image, please upload a higher-quality scan or try an image.');
      }
      const CHUNK_SIZE = 8000;
      const chunks = [];
      for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE));
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const messages = [
          { role: 'user', content: [{ type: 'text', text: `${userPrompt}\n\nDocument text (chunk ${i+1}/${chunks.length}):\n\n${chunk}` }] }
        ];
        let content = '';
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const resp = await claude.messages.create({ 
              model: 'claude-3-haiku-20240307', 
              system: systemPrompt,
              max_tokens: 4000, 
              temperature: 0.1,
              messages: [
                { role: 'user', content: `${userPrompt}\n\nDocument text (chunk ${i+1}/${chunks.length}):\n\n${chunk}` }
              ]
            });
            content = (resp && resp.content && resp.content[0] && resp.content[0].text) || '';
            break;
          } catch (e) {
            if (attempt === 2) throw e;
          }
        }
        const rooms = tryParseRooms(content).map(normalizeRoom);
        consolidatedRooms.push(...rooms);
      }
      // Deduplicate by name + level
      const seen = new Set();
      consolidatedRooms = consolidatedRooms.filter(r => {
        const key = `${(r.name||'').trim().toLowerCase()}|${(r.level||'').trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
    }

    // Clean up the uploaded file
    try { fs.unlinkSync(file.path); } catch (_) {}

    if (!Array.isArray(consolidatedRooms)) {
      return fail(res, 500, 'AI returned an unexpected result. Please try a clearer document.');
    }

    return ok(res, {
      success: true,
      rooms: consolidatedRooms,
      message: `Successfully extracted ${consolidatedRooms.length} meeting rooms`
    });

  } catch (error) {
    console.error('🤖 Document processing error:', error);
    
    // Clean up the uploaded file if it exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('🤖 Error cleaning up file:', cleanupError);
      }
    }
    
    return fail(res, 500, `Document processing failed: ${error.message}`);
  }
});

// ---------- OCR-based Fact Sheet Processing Endpoint ----------
app.post('/uploadFactSheet', upload.single('factSheet'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    console.log('📄 Processing fact sheet:', req.file.originalname);
    
    // Determine file type and extract text using appropriate method
    const ext = extOf(req.file.originalname);
    let text = '';
    
    if (ext === 'pdf') {
      // Use the existing ocrPdfText function
      text = await ocrPdfText(req.file.path);
    } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
      // Use Tesseract for images
      const { default: Tesseract } = await import('tesseract.js');
      const { data: { text: extractedText } } = await Tesseract.recognize(req.file.path, 'eng', { 
        logger: m => console.log('📄 OCR Progress:', m) 
      });
      text = extractedText;
    } else {
      // Clean up and return error
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, PNG, or JPG.' });
    }

    console.log('📄 Extracted text length:', text.length);

    // Simple parser – look for room names with numbers
    const lines = text.split('\n');
    const meetingRooms = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // Skip headers
      const lower = trimmed.toLowerCase();
      if (lower.includes('meeting space') || lower.includes('room name')) return;
      if (lower.includes('capacity') || lower.includes('setup') || lower.includes('style')) return;
      if (lower.includes('square feet') || lower.includes('sq ft') || lower.includes('dimensions')) return;
      
      // Match patterns like: "Room Name   1000   50"
      // Room name should be at least 3 chars, followed by 2+ numbers
      const match = trimmed.match(/^([A-Za-z0-9\s&\-'()\/]{3,}?)\s+(\d{3,})\s+/);
      if (match) {
        const name = match[1].trim();
        
        // Skip if name is just numbers or too generic
        if (/^\d+$/.test(name)) return;
        if (name.length < 3) return;
        
        // Extract numbers from line
        const numbers = trimmed.match(/\d+/g)?.map(n => parseInt(n)) || [];
        
        // First number should be sqft (100-50000), second might be capacity
        const sqFt = numbers.find(n => n >= 100 && n <= 50000);
        const capacity = numbers.find(n => n !== sqFt && n >= 10 && n <= 5000);
        
        if (sqFt) {
          meetingRooms.push({
            name: name,
            sqFt: sqFt,
            capacity: capacity || null
          });
        }
      }
    });

    console.log('📄 Extracted meeting rooms:', meetingRooms.length);

    // Clean up the uploaded file
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    res.json({ meetingRooms });
  } catch (err) {
    console.error('📄 Error processing fact sheet:', err);
    
    // Clean up the uploaded file
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    
    res.status(500).json({ error: 'Failed to process file: ' + err.message });
  }
});

// ---------- Hybrid OCR + OpenAI Extraction Endpoint ----------
app.post('/uploadFactSheetHybrid', upload.single('factSheet'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  let tmpFiles = [];
  
  try {
    console.log('🔄 Hybrid extraction starting for:', req.file.originalname);
    
    const ext = extOf(req.file.originalname);
    let rawText = '';
    
    // Step 1 & 2: Extract text using the BEST method for each type
    if (ext === 'pdf') {
      console.log('📄 Using direct PDF OCR (better quality than PNG conversion)...');
      // Use the existing ocrPdfText which gives better results
      rawText = await ocrPdfText(req.file.path);
    } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
      console.log('📄 Using Tesseract on image...');
      const { default: Tesseract } = await import('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`   Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      rawText = text;
    } else {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, PNG, or JPG.' });
    }

    console.log('✅ OCR complete. Extracted text length:', rawText.length);
    console.log('📄 First 1000 chars of OCR text:', rawText.substring(0, 1000));

    // Step 3: Pre-parse basic table rows with regex (more lenient)
    const candidateRooms = [];
    const lines = rawText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 5) continue;
      
      // Skip obvious headers (but be less aggressive)
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('name') && lowerLine.includes('location')) continue; // Header row
      if (lowerLine === 'meeting spaces' || lowerLine === 'meeting rooms') continue;
      if (lowerLine.startsWith('room name') || lowerLine.startsWith('space name')) continue;
      
      // Match lines with text followed by numbers (very lenient)
      // This catches: "Ballroom A  2nd  50  100  20  5000  300  500"
      const match = line.match(/^([A-Za-z0-9\s&\-'()\/,]+?)(\s+\d+)/);
      if (match) {
        const name = match[1].trim();
        
        // Skip if name is just a number or too short
        if (/^\d+$/.test(name) || name.length < 2) continue;
        
        // Extract all numbers from the line
        const numbers = line.match(/\d+/g)?.map(n => parseInt(n.replace(/,/g, ''))) || [];
        
        if (numbers.length >= 1) {
          candidateRooms.push({
            name: name,
            rawLine: line,
            allNumbers: numbers
          });
        }
      }
    }

    console.log(`🎯 Pre-parsed ${candidateRooms.length} candidate room(s)`);
    if (candidateRooms.length > 0) {
      console.log(`🎯 Sample candidates:`, candidateRooms.slice(0, 5).map(r => ({ name: r.name, numbers: r.allNumbers })));
    }

    // Step 4: Send to Claude for validation and JSON normalization
    const claude = await getClaude();
    
    if (!claude) {
      // If Claude is not available, return the candidate rooms as-is
      console.log('⚠️  Claude not available, returning candidate rooms without validation');
      return res.json({ meetingRooms: candidateRooms });
    }

    console.log('🤖 Sending to Claude for validation and normalization...');
    console.log('🤖 Candidates found:', candidateRooms.length);
    console.log('🤖 OCR text length:', rawText.length);
    
    const systemPrompt = `You are an expert at extracting comprehensive meeting space data from hotel fact sheets. 

IMPORTANT: You must parse the OCR text directly and extract ALL meeting rooms, regardless of preliminary data.

${candidateRooms.length > 0 ? `Preliminary OCR hints (${candidateRooms.length} possible rooms): ${JSON.stringify(candidateRooms.slice(0, 10), null, 2)}` : 'No preliminary data found - parse directly from OCR text below.'}

The fact sheet likely has a TABLE format with columns like:
- Room Name | Location/Level | Length | Width | Height | Area (sqft) | Classroom | Theater | Conference | Banquet | U-Shape | Hollow Square | Reception/Cocktail | Exhibit

Extract and return a JSON object with this EXACT structure:
{
  "meetingRooms": [
    {
      "name": "string (required)",
      "level": "string (floor/level like '1st Floor', 'Mezzanine', '2')",
      "sqFt": number,
      "lengthFt": number,
      "widthFt": number,
      "ceilingFt": number,
      "pillarFree": boolean,
      "naturalLight": boolean,
      "divisible": boolean,
      "seating": {
        "banquet": number,
        "theater": number,
        "classroom": number,
        "uShape": number,
        "cocktail": number,
        "crescent": number,
        "hollowSquare": number,
        "conference": number
      },
      "notes": "string (any corrections or assumptions)"
    }
  ]
}

CRITICAL RULES FOR EXTRACTION:
- Extract EVERY meeting room mentioned (20-30+ rooms expected)
- Fix OCR errors (O→0, I→1, S→5, l→1, etc.)
- Look for dimensions: "50x100", "50 x 100", "L 50 W 100", etc.
- Validate numbers (sqFt: 100-50000, ceiling: 8-30, capacities: 1-5000)

SEATING TYPE STANDARDIZATION - normalize fact sheet columns to our field names:
- "Banquet", "Banquet Rounds", "Rounds", "Round Tables", "Banq" → seating.banquet
- "Theater", "Theatre", "Auditorium", "Thtr" → seating.theater  
- "Classroom", "Class Room", "Class", "Classrm" → seating.classroom
- "U-Shape", "U Shape", "Hollow U", "U Shp" → seating.uShape
- "Reception", "Cocktail", "Cocktail Rounds", "Recep", "Cktl" → seating.cocktail
- "Crescent", "Crescent Rounds", "Cres" → seating.crescent
- "Hollow Square", "Square", "Hol Sq", "H Square" → seating.hollowSquare
- "Conference", "Boardroom", "Board", "Conf" → seating.conference
- "Exhibit", "Trade Show", "Exhibits", "Exhib" → seating.exhibit (if present)

FEATURES - detect from keywords:
- Pillar-free: "pillar-free", "column-free", "no pillars"
- Natural light: "natural light", "windows", "daylight"
- Divisible: "divisible", "airwall", "can divide"

PARSING STRATEGY:
1. Find table header row to identify column positions
2. For each data row, read values by column position
3. Match column headers to our standard field names
4. Extract ALL rooms, not just examples
5. Return ONLY valid JSON, no markdown`;

    const userPrompt = `Parse this hotel fact sheet and extract ALL meeting/event spaces.

STEP 1: FIND THE CAPACITY CHART/TABLE
Look for sections with keywords like:
- "Capacity Chart"
- "Event Rooms"
- "Conference Rooms"
- "Meeting Spaces"
- "Function Space"
- "Event Space"
- Tables with columns for room names and seating capacities

STEP 2: UNDERSTAND TABLE STRUCTURE
Typical columns (order may vary):
- Room Name (e.g., "L'Enfant Ballroom", "LB-A", "Grand Hall")
- Location/Level (e.g., "Lobby Level", "2nd", "Mezzanine", "Foyer")
- Dimensions: Length, Width, Height/Ceiling (in feet)
- Area (square feet - may have commas like "5,406" or "11,700")
- Seating capacities: Classroom, Theater, Conference, Banquet, U-Shape, Hollow Square, Reception/Cocktail, Exhibits

CRITICAL MAPPING:
- Column "Reception" → seating.cocktail (NOT crescent!)
- Column "Classroom" → seating.classroom
- Column "Theater" → seating.theater  
- Column "Banquet" → seating.banquet
- Column "U-Shape" → seating.uShape
- Column "Hollow Square" → seating.hollowSquare
- Column "Conference" → seating.conference (if exists)
- Column "Exhibits" → seating.exhibit (if exists)

FIX OCR ERRORS:
- "rover" → "Foyer" (common OCR mistake)
- "5,406" → 5406 (remove commas)
- Column numbers separated by spaces

I detected ${candidateRooms.length} room entries - extract ALL of them with data from the correct columns!

FULL OCR TEXT:
${rawText}

Return JSON with ALL rooms, reading each column in the exact order above!`;

    try {
      const completion = await claude.messages.create({
        model: 'claude-3-haiku-20240307',
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
        ],
        temperature: 0.1,
        max_tokens: 16000  // Increased for extracting ALL rooms (up to ~30 rooms)
      });

      const textOutput = completion.content[0].text || '';
      console.log('🤖 Claude response received, length:', textOutput.length);
      console.log('🤖 First 500 chars:', textOutput.substring(0, 500));
      
      // Try to parse the JSON response
      let parsed = { meetingRooms: candidateRooms }; // fallback
      
      try {
        // Try direct parse first
        parsed = JSON.parse(textOutput);
      } catch (e) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = textOutput.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          // Try to find JSON object in the text
          const objectMatch = textOutput.match(/\{[\s\S]*"meetingRooms"[\s\S]*\}/);
          if (objectMatch) {
            parsed = JSON.parse(objectMatch[0]);
          }
        }
      }

      console.log(`✅ Returning ${parsed.meetingRooms?.length || 0} validated meeting room(s)`);
      
      // Debug: Log first few rooms to verify mapping
      if (parsed.meetingRooms && parsed.meetingRooms.length > 0) {
        console.log('🔍 Sample room data:', JSON.stringify(parsed.meetingRooms[0], null, 2));
      }
      
      return res.json(parsed);

    } catch (aiError) {
      console.error('🤖 Claude processing error:', aiError.message);
      // Fallback to candidate rooms if Claude fails
      return res.json({ 
        meetingRooms: candidateRooms,
        warning: 'AI validation failed, returning OCR results'
      });
    }

  } catch (err) {
    console.error('🔴 Hybrid extraction error:', err);
    
    // Clean up the uploaded file
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    
    return res.status(500).json({ 
      error: 'Extraction failed: ' + err.message,
      details: err.stack 
    });
  } finally {
    // Clean up all temporary files
    for (const tmpFile of tmpFiles) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    
    // Clean up temporary directories
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const tmpDirs = fs.readdirSync(uploadsDir).filter(f => f.startsWith('pdf2png-') || f.startsWith('ocr-'));
      for (const dir of tmpDirs) {
        const dirPath = path.join(uploadsDir, dir);
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
        } catch (_) {}
      }
    } catch (_) {}
  }
});

// ---------- Debug OCR Endpoint ----------
app.post('/debugOCR', upload.single('factSheet'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const ext = extOf(req.file.originalname);
    let rawText = '';
    
    if (ext === 'pdf') {
      rawText = await ocrPdfText(req.file.path);
    } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
      const { default: Tesseract } = await import('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng');
      rawText = text;
    }
    
    // Clean up
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    
    // Return the raw text for inspection
    return res.json({
      textLength: rawText.length,
      fullText: rawText,
      first1000: rawText.substring(0, 1000),
      lines: rawText.split('\n').length
    });
  } catch (err) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(500).json({ error: err.message });
  }
});
// ======================================================================
// VERSION 8.0: COMPREHENSIVE HOTEL PROFILE EXTRACTION (AI-Powered)
// ======================================================================
app.post('/uploadHotelProfile', upload.single('hotelProfile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  
  console.log('🤖 Version 8.0: Full Hotel Profile Extraction starting for:', req.file.originalname);
  
  try {
    const ext = extOf(req.file.originalname);
    let rawText = '';
    
    // Step 1: Extract text using OCR
    if (ext === 'pdf') {
      console.log('📄 Using PDF OCR...');
      rawText = await ocrPdfText(req.file.path);
    } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
      console.log('🖼️ Using Image OCR...');
      const { default: Tesseract } = await import('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(req.file.path, 'eng');
      rawText = text;
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF or image.' });
    }
    
    console.log(`📖 Extracted ${rawText.length} characters from document`);
    console.log(`📄 First 500 chars:\n${rawText.substring(0, 500)}`);
    
    // Step 2: Send to Claude for comprehensive extraction
    const claudeKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeKey) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }
    
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const claude = new Anthropic({ apiKey: claudeKey });
    
    console.log('🤖 Sending to Claude for comprehensive extraction...');
    
    const systemPrompt = `You are an expert hotel data extraction AI. Extract ALL hotel information from the provided text.

IMPORTANT: Extract as much as you can find. Look for:

1. HOTEL INFORMATION:
   - Hotel name
   - Address (street, city, state, zip, country)
   - Main phone number
   - Main email
   - Website
   - Contact person name (sales director, GM, etc.)

2. MEETING SPACES:
   - Room name
   - Level/Floor
   - Square footage
   - Dimensions (length x width)
   - Ceiling height
   - Pillar-free? Natural light? Divisible?
   - Seating capacities: theater, classroom, banquet rounds, u-shape, hollow square, conference, crescent rounds, cocktail/reception

3. GUEST ROOMS:
   - Total number of rooms
   - Room types and counts (standard, suite, ADA accessible, etc.)
   
4. AMENITIES:
   - Pool, spa, fitness center, restaurant, bar
   - Business center, parking, WiFi
   - Any special features

Return ONLY valid JSON in this exact format:
{
  "hotelName": "string",
  "contactName": "string",
  "email": "string",
  "phone": "string",
  "address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string"
  },
  "website": "string",
  "totalRooms": number,
  "roomTypes": [
    {"type": "string", "count": number}
  ],
  "amenities": ["string"],
  "meetingRooms": [
    {
      "name": "string",
      "level": "string",
      "sqFt": number,
      "lengthFt": number,
      "widthFt": number,
      "ceilingFt": number,
      "pillarFree": boolean,
      "naturalLight": boolean,
      "divisible": boolean,
      "seating": {
        "banquet": number,
        "theater": number,
        "classroom": number,
        "uShape": number,
        "cocktail": number,
        "crescent": number,
        "hollowSquare": number,
        "conference": number
      },
      "notes": "string"
    }
  ],
  "summary": "string describing what was found"
}
If a field is not found, use null. Do NOT invent data. Extract only what is clearly stated.`;

    const completion = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: `${systemPrompt}\n\nExtract all hotel information from this text:\n\n${rawText}` }
      ],
      max_tokens: 16000,
      temperature: 0.1
    });
    
    const aiResponse = completion.content[0].text;
    console.log(`🤖 AI response length: ${aiResponse.length}`);
    console.log(`🤖 First 500 chars: ${aiResponse.substring(0, 500)}`);
    
    // Parse the JSON response
    let hotelData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || aiResponse.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse;
      hotelData = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('❌ Failed to parse AI response:', parseErr);
      return res.status(500).json({ error: 'AI returned invalid JSON' });
    }
    
    console.log(`✅ Successfully extracted hotel profile:`, {
      hotel: hotelData.hotelName,
      meetingRooms: hotelData.meetingRooms?.length || 0,
      amenities: hotelData.amenities?.length || 0,
      roomTypes: hotelData.roomTypes?.length || 0
    });
    
    return res.json(hotelData);
    
  } catch (err) {
    console.error('🔴 Hotel profile extraction error:', err);
    return res.status(500).json({ 
      error: 'Extraction failed: ' + err.message 
    });
  } finally {
    // Clean up uploaded file
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  }
});

// ---------- Government Authentication API endpoints ----------

// Government user registration
app.post('/api/government/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, agency, jobTitle, department, governmentId } = req.body;
    
    if (!email || !password || !firstName || !lastName || !agency || !jobTitle) {
      return fail(res, 400, 'Required fields missing');
    }
    
    // Validate government email (allow admin@fedevent.com)
    if (!email.endsWith('.gov') && !email.endsWith('.mil') && email !== 'admin@fedevent.com') {
      return fail(res, 400, 'Government email (.gov or .mil) required');
    }
    
    // Check if user already exists
    const existingUser = db.prepare(`SELECT id FROM government_users WHERE email = ?`).get(email);
    if (existingUser) {
      return fail(res, 400, 'Account with this email already exists');
    }
    
    const passwordHash = hashPassword(password);
    const result = db.prepare(`
      INSERT INTO government_users (email, password_hash, first_name, last_name, phone, agency, department, job_title, government_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(email, passwordHash, firstName, lastName, phone || '', agency, department || '', jobTitle, governmentId || '');
    
    return ok(res, { 
      message: 'Government account registration submitted successfully',
      userId: result.lastInsertRowid 
    });
    
  } catch (error) {
    console.error('Government registration error:', error);
    return fail(res, 500, 'Registration failed');
  }
});

// Government user login
app.post('/api/government/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return fail(res, 400, 'Email and password required');
    }
    
    // Special admin account check - use environment variable for security
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@fedevent.com';
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (email === adminEmail && adminPassword && password === adminPassword) {
      // Create admin session
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
      
      // Create a special admin user entry if it doesn't exist
      const adminUser = db.prepare(`SELECT * FROM government_users WHERE email = 'admin@fedevent.com'`).get();
      
      let adminUserId;
      if (!adminUser) {
        const adminPasswordHash = hashPassword(adminPassword);
        const result = db.prepare(`
          INSERT INTO government_users (email, password_hash, first_name, last_name, phone, agency, department, job_title, government_id, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('admin@fedevent.com', adminPasswordHash, 'Admin', 'User', '', 'FEDEVENT', 'Administration', 'System Administrator', 'ADMIN001', 1);
        
        adminUserId = result.lastInsertRowid;
      } else {
        adminUserId = adminUser.id;
      }
      
      db.prepare(`
        INSERT INTO government_sessions (id, government_user_id, expires_at)
        VALUES (?, ?, ?)
      `).run(sessionId, adminUserId, expiresAt);
      
      // Update last login
      db.prepare(`UPDATE government_users SET last_login = datetime('now') WHERE id = ?`).run(adminUserId);
      
      return ok(res, {
        sessionId,
        user: {
          id: adminUserId,
          email: 'admin@fedevent.com',
          first_name: 'Admin',
          last_name: 'User',
          agency: 'FEDEVENT',
          job_title: 'System Administrator',
          is_admin: true
        }
      });
    }
    
    // Validate government email for regular users
    if (!email.endsWith('.gov') && !email.endsWith('.mil')) {
      return fail(res, 400, 'Government email (.gov or .mil) required');
    }
    
    const user = db.prepare(`SELECT * FROM government_users WHERE email = ? AND is_active = 1`).get(email);
    
    if (!user || !verifyPassword(password, user.password_hash)) {
      return fail(res, 401, 'Invalid email or password');
    }
    
    // Create government session
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    db.prepare(`
      INSERT INTO government_sessions (id, government_user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(sessionId, user.id, expiresAt);
    
    // Update last login
    db.prepare(`UPDATE government_users SET last_login = datetime('now') WHERE id = ?`).run(user.id);
    
    return ok(res, {
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        agency: user.agency,
        job_title: user.job_title,
        is_admin: false
      }
    });
    
  } catch (error) {
    console.error('Government login error:', error);
    return fail(res, 500, 'Login failed');
  }
});

// Government authentication middleware
function requireGovAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const sessionId = authHeader?.replace('Bearer ', '');
  
  if (!sessionId) {
    return fail(res, 401, 'Authentication required');
  }
  
  const session = db.prepare(`
    SELECT gs.*, gu.* FROM government_sessions gs
    JOIN government_users gu ON gs.government_user_id = gu.id
    WHERE gs.id = ? AND gs.expires_at > datetime('now') AND gu.is_active = 1
  `).get(sessionId);
  
  if (!session) {
    return fail(res, 401, 'Invalid or expired session');
  }
  
  req.govUser = {
    id: session.government_user_id,
    email: session.email,
    first_name: session.first_name,
    last_name: session.last_name,
    agency: session.agency,
    department: session.department,
    job_title: session.job_title
  };
  
  next();
}

// Get current government user
app.get('/api/government/me', requireGovAuth, (req, res) => {
  return ok(res, {
    user: req.govUser
  });
});

// Government dashboard stats
app.get('/api/government/stats', requireGovAuth, (req, res) => {
  try {
    const projectsCount = db.prepare(`
      SELECT COUNT(*) as count FROM government_projects 
      WHERE government_user_id = ? AND status = 'active'
    `).get(req.govUser.id);
    
    const documentsCount = db.prepare(`
      SELECT COUNT(*) as count FROM government_documents 
      WHERE government_user_id = ? AND status = 'active'
    `).get(req.govUser.id);
    
    const pendingCount = db.prepare(`
      SELECT COUNT(*) as count FROM government_documents 
      WHERE government_user_id = ? AND status = 'active'
    `).get(req.govUser.id);
    
    return ok(res, {
      activeProjects: projectsCount.count,
      documentsCount: documentsCount.count,
      pendingReviews: pendingCount.count
    });
  } catch (error) {
    console.error('Government stats error:', error);
    return fail(res, 500, 'Failed to load stats');
  }
});

// Government logout
app.post('/api/government/logout', requireGovAuth, (req, res) => {
  const authHeader = req.headers.authorization;
  const sessionId = authHeader?.replace('Bearer ', '');
  
  if (sessionId) {
    db.prepare(`DELETE FROM government_sessions WHERE id = ?`).run(sessionId);
  }
  
  return ok(res, { message: 'Logged out successfully' });
});

// ---------- Government File Upload System ----------

// Government document upload with security validation
app.post('/api/government/upload', requireGovAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No file uploaded');
    }
    
    const { document_type = 'OTHER', description = '', project_name = '' } = req.body;
    
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(req.file.mimetype)) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return fail(res, 400, 'Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.');
    }
    
    // Security check: scan file content for classification markers
    const classificationCheck = await checkFileClassification(req.file.path);
    if (!classificationCheck.isUnclassified) {
      // Clean up file immediately
      fs.unlinkSync(req.file.path);
      return fail(res, 400, `SECURITY VIOLATION: ${classificationCheck.reason}. Only UNCLASSIFIED documents are permitted.`);
    }
    
    // Store document record
    const result = db.prepare(`
      INSERT INTO government_documents (
        government_user_id, document_type, file_name, file_path, file_size, 
        mime_type, classification_level, description, project_name
      ) VALUES (?, ?, ?, ?, ?, ?, 'UNCLASSIFIED', ?, ?)
    `).run(
      req.govUser.id,
      document_type,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      description,
      project_name
    );
    
    return ok(res, {
      message: 'Document uploaded successfully',
      documentId: result.lastInsertRowid,
      fileName: req.file.originalname,
      classificationLevel: 'UNCLASSIFIED'
    });
    
  } catch (error) {
    console.error('Government file upload error:', error);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return fail(res, 500, 'File upload failed');
  }
});

// Security function to check file classification
async function checkFileClassification(filePath) {
  try {
    // Read first 10KB of file for classification markers
    const buffer = fs.readFileSync(filePath, { encoding: 'utf8' });
    const content = buffer.toString().toUpperCase();
    
    // Classification markers that should NOT appear in unclassified documents
    const classifiedMarkers = [
      'CLASSIFIED',
      'SECRET',
      'TOP SECRET',
      'CONFIDENTIAL',
      'RESTRICTED',
      'FOUO', // For Official Use Only
      'CUI', // Controlled Unclassified Information
      'NOFORN', // No Foreign Nationals
      'EYES ONLY',
      'COMPARTMENTED',
      'SCI', // Sensitive Compartmented Information
      'SAP', // Special Access Program
      'CLASSIFICATION:',
      'SECURITY CLASSIFICATION',
    ];
    
    for (const marker of classifiedMarkers) {
      if (content.includes(marker)) {
        return {
          isUnclassified: false,
          reason: `Document contains classification marker: "${marker}"`
        };
      }
    }
    
    return {
      isUnclassified: true,
      reason: 'Document appears to be unclassified'
    };
    
  } catch (error) {
    console.error('Classification check error:', error);
    return {
      isUnclassified: false,
      reason: 'Unable to verify document classification - upload rejected for security'
    };
  }
}

// Get government user documents
app.get('/api/government/documents', requireGovAuth, (req, res) => {
  try {
    const documents = db.prepare(`
      SELECT id, document_type, file_name, file_size, mime_type, 
             classification_level, description, project_name, uploaded_at, status
      FROM government_documents 
      WHERE government_user_id = ? AND status = 'active'
      ORDER BY uploaded_at DESC
    `).all(req.govUser.id);
    
    return ok(res, documents);
  } catch (error) {
    console.error('Get documents error:', error);
    return fail(res, 500, 'Failed to retrieve documents');
  }
});

// Download government document
app.get('/api/government/documents/:id/download', requireGovAuth, (req, res) => {
  try {
    const documentId = req.params.id;
    
    const document = db.prepare(`
      SELECT * FROM government_documents 
      WHERE id = ? AND government_user_id = ? AND status = 'active'
    `).get(documentId, req.govUser.id);
    
    if (!document) {
      return fail(res, 404, 'Document not found');
    }
    
    if (!fs.existsSync(document.file_path)) {
      return fail(res, 404, 'File not found on server');
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
    res.setHeader('Content-Type', document.mime_type);
    res.sendFile(path.resolve(document.file_path));
    
  } catch (error) {
    console.error('Download document error:', error);
    return fail(res, 500, 'Failed to download document');
  }
});

// Delete government document
app.delete('/api/government/documents/:id', requireGovAuth, (req, res) => {
  try {
    const documentId = req.params.id;
    
    const document = db.prepare(`
      SELECT * FROM government_documents 
      WHERE id = ? AND government_user_id = ? AND status = 'active'
    `).get(documentId, req.govUser.id);
    
    if (!document) {
      return fail(res, 404, 'Document not found');
    }
    
    // Mark as deleted in database
    db.prepare(`
      UPDATE government_documents 
      SET status = 'deleted', updated_at = datetime('now')
      WHERE id = ?
    `).run(documentId);
    
    // Optionally delete physical file (uncomment if you want to delete files immediately)
    // if (fs.existsSync(document.file_path)) {
    //   fs.unlinkSync(document.file_path);
    // }
    
    return ok(res, { message: 'Document deleted successfully' });
    
  } catch (error) {
    console.error('Delete document error:', error);
    return fail(res, 500, 'Failed to delete document');
  }
});
// ---------- Government Hotel Search API ----------

// Search hotels for government users
app.get('/api/government/hotels/search', requireGovAuth, (req, res) => {
  try {
    const { city, state, country = 'US', q, net30, po_acceptance, per_diem, government_rate } = req.query;
    
    // Build SQL query
    let sql = `
      SELECT h.*, 
             COUNT(u.id) as user_count,
             MAX(u.last_login) as last_activity
      FROM hotels h
      LEFT JOIN users u ON h.id = u.hotel_id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Add filters
    if (city) {
      sql += ` AND h.city LIKE ?`;
      params.push(`%${city}%`);
    }
    
    if (state) {
      sql += ` AND h.state = ?`;
      params.push(state);
    }
    
    if (country) {
      sql += ` AND h.country = ?`;
      params.push(country);
    }
    
    if (q) {
      sql += ` AND (h.name LIKE ? OR h.tags LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }
    
    // Government-specific filters
    if (net30 === 'true') {
      sql += ` AND (h.tags LIKE '%net30%' OR h.tags LIKE '%NET30%')`;
    }
    
    if (po_acceptance === 'true') {
      sql += ` AND (h.tags LIKE '%po_acceptance%' OR h.tags LIKE '%PO%')`;
    }
    
    if (per_diem === 'true') {
      sql += ` AND (h.tags LIKE '%per_diem%' OR h.tags LIKE '%perdiem%')`;
    }
    
    if (government_rate === 'true') {
      sql += ` AND (h.tags LIKE '%government%' OR h.tags LIKE '%federal%')`;
    }
    
    sql += ` GROUP BY h.id ORDER BY h.created_at DESC LIMIT 50`;
    
    const hotels = db.prepare(sql).all(...params);
    
    // Add government qualification tags to all hotels (since they're in our system)
    const qualifiedHotels = hotels.map(hotel => ({
      ...hotel,
      government_qualified: true,
      net30_available: true,
      po_acceptance: true,
      per_diem_rates: hotel.tags?.includes('per_diem') || hotel.tags?.includes('perdiem')
    }));
    
    return ok(res, { 
      hotels: qualifiedHotels,
      count: qualifiedHotels.length,
      filters: { city, state, country, q, net30, po_acceptance, per_diem, government_rate }
    });
    
  } catch (error) {
    console.error('Government hotel search error:', error);
    return fail(res, 500, 'Hotel search failed');
  }
});

// Request quote from hotel
app.post('/api/government/hotels/request-quote', requireGovAuth, async (req, res) => {
  try {
    const { hotel_id, event_details, requirements } = req.body;
    
    if (!hotel_id) {
      return fail(res, 400, 'Hotel ID required');
    }
    
    // Get hotel information
    const hotel = db.prepare(`SELECT * FROM hotels WHERE id = ?`).get(hotel_id);
    if (!hotel) {
      return fail(res, 404, 'Hotel not found');
    }
    
    // Store quote request in database
    const result = db.prepare(`
      INSERT INTO government_quote_requests (
        government_user_id, hotel_id, event_details, requirements, status
      ) VALUES (?, ?, ?, ?, 'pending')
    `).run(
      req.govUser.id,
      hotel_id,
      event_details || '',
      requirements || ''
    );
    
    // Send email notification to hotel (if SMTP configured)
    if (process.env.SMTP_HOST && hotel.email) {
      try {
        const subject = `Government Quote Request - ${req.govUser.agency}`;
        const html = `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937;">🏛️ Government Quote Request</h2>
            
            <div style="background: #f9fafb; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0;">
              <h3 style="margin-top: 0; color: #374151;">Request Details</h3>
              <p><strong>Agency:</strong> ${req.govUser.agency}</p>
              <p><strong>Contact:</strong> ${req.govUser.first_name} ${req.govUser.last_name}</p>
              <p><strong>Email:</strong> ${req.govUser.email}</p>
              <p><strong>Job Title:</strong> ${req.govUser.job_title}</p>
            </div>
            
            ${event_details ? `
              <div style="background: #eff6ff; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0;">
                <h3 style="margin-top: 0; color: #1e40af;">Event Details</h3>
                <p>${event_details}</p>
              </div>
            ` : ''}
            
            ${requirements ? `
              <div style="background: #fef3c7; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0;">
                <h3 style="margin-top: 0; color: #92400e;">Special Requirements</h3>
                <p>${requirements}</p>
              </div>
            ` : ''}
            
            <div style="background: #f0fdf4; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0;">
              <h3 style="margin-top: 0; color: #166534;">Next Steps</h3>
              <p>Please respond to this government quote request with:</p>
              <ul style="color: #166534;">
                <li>Available dates and rates</li>
                <li>NET30 payment terms confirmation</li>
                <li>PO acceptance confirmation</li>
                <li>Meeting space availability (if applicable)</li>
                <li>Government/per diem rates (if available)</li>
              </ul>
            </div>
            
            <p style="color: #6b7280; font-size: 0.875rem; margin-top: 2rem;">
              This request was sent through the FEDEVENT Government Portal.<br>
              Reply directly to this email to respond to the government agency.
            </p>
          </div>
        `;
        
        await sendMail({
          to: hotel.email,
          subject,
          html,
          // Reply-To government user's email
          replyTo: req.govUser.email
        });
        
        console.log(`Quote request email sent to ${hotel.email} for government user ${req.govUser.email}`);
        
      } catch (emailError) {
        console.error('Failed to send quote request email:', emailError);
        // Don't fail the request if email fails
      }
    }
    
    return ok(res, {
      message: 'Quote request sent successfully',
      requestId: result.lastInsertRowid,
      hotel: {
        name: hotel.name,
        email: hotel.email
      }
    });
    
  } catch (error) {
    console.error('Quote request error:', error);
    return fail(res, 500, 'Failed to send quote request');
  }
});

// Forgot password endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return fail(res, 400, 'Email or username required');
    }
    
    // Look up user by email or username (first_name in this case)
    let user = db.prepare(`SELECT * FROM users WHERE email = ? AND is_active = 1`).get(email);
    if (!user) {
      user = db.prepare(`SELECT * FROM users WHERE first_name = ? AND is_active = 1`).get(email);
    }
    
    if (!user) {
      // Don't reveal if user exists or not for security
      return ok(res, { message: 'If an account with that email/username exists, a password reset link has been sent.' });
    }
    
    // Generate reset token (simple implementation - in production use crypto.randomBytes)
    const resetToken = Buffer.from(`${user.id}:${Date.now()}:${user.email}`).toString('base64');
    
    // Store reset token (you might want to add a password_reset_tokens table in production)
    // For now, we'll just send the email
    
    const resetUrl = `${process.env.BASE_URL || 'http://localhost:${PORT}'}/reset-password.html?token=${resetToken}`;
    
    const subject = 'Password Reset - FEDEVENT Hotel Portal';
    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Password Reset Request</h2>
        
        <p>Hello ${user.first_name},</p>
        
        <p>You requested a password reset for your FEDEVENT Hotel Portal account. Click the link below to reset your password:</p>
        
        <div style="margin: 2rem 0; text-align: center;">
          <a href="${resetUrl}" 
             style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p>This link will expire in 24 hours. If you didn't request this password reset, you can safely ignore this email.</p>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6b7280;">${resetUrl}</p>
        
        <hr style="margin: 2rem 0;">
        <p style="font-size: 0.875rem; color: #6b7280;">
          FEDEVENT - A service of CREATA Global Event Agency LLC
        </p>
      </div>
    `;
    
    await sendMail({
      to: user.email,
      subject,
      html
    });
    
    return ok(res, { message: 'If an account with that email/username exists, a password reset link has been sent.' });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    return fail(res, 500, 'Failed to process password reset request');
  }
});

// Reset password endpoint
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return fail(res, 400, 'Token and new password required');
    }
    
    if (newPassword.length < 8) {
      return fail(res, 400, 'Password must be at least 8 characters');
    }
    
    // Decode and validate token
    let decoded;
    try {
      decoded = Buffer.from(token, 'base64').toString();
    } catch (e) {
      return fail(res, 400, 'Invalid token');
    }
    
    const [userId, timestamp, email] = decoded.split(':');
    
    if (!userId || !timestamp || !email) {
      return fail(res, 400, 'Invalid token format');
    }
    
    // Check if token is expired (24 hours)
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return fail(res, 400, 'Reset token has expired');
    }
    
    // Verify user exists and token matches
    const user = db.prepare(`SELECT * FROM users WHERE id = ? AND email = ? AND is_active = 1`).get(userId, email);
    if (!user) {
      return fail(res, 400, 'Invalid or expired token');
    }
    
    // Update password
    const passwordHash = hashPassword(newPassword);
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
    
    // Invalidate all existing sessions for this user
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
    
    return ok(res, { message: 'Password reset successfully. Please log in with your new password.' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    return fail(res, 500, 'Failed to reset password');
  }
});

// ---------- Admin API endpoints ----------

// Get all hotels (admin only)
app.get('/api/admin/hotels', requireAuth, requireAdmin, (req, res) => {
  try {
    const hotels = db.prepare(`
      SELECT h.*,
             COUNT(u.id) as user_count,
             MAX(u.last_login) as last_user_login,
             COUNT(hp.id) as profile_count
      FROM hotels h
      LEFT JOIN users u ON h.id = u.hotel_id
      LEFT JOIN hotel_profiles hp ON h.id = hp.hotel_id
      GROUP BY h.id
      ORDER BY h.is_priority DESC, h.created_at DESC
    `).all();
    
    return ok(res, { hotels });
  } catch (error) {
    console.error('Admin hotels fetch error:', error);
    return fail(res, 500, 'Failed to fetch hotels');
  }
});
// Get hotel details (admin only)
app.get('/api/admin/hotels/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const hotelId = req.params.id;
    
    const hotel = db.prepare(`SELECT * FROM hotels WHERE id = ?`).get(hotelId);
    if (!hotel) {
      return fail(res, 404, 'Hotel not found');
    }
    
    const users = db.prepare(`SELECT * FROM users WHERE hotel_id = ?`).all(hotelId);
    const profiles = db.prepare(`SELECT * FROM hotel_profiles WHERE hotel_id = ?`).all(hotelId);
    
    return ok(res, { hotel, users, profiles });
  } catch (error) {
    console.error('Admin hotel details error:', error);
    return fail(res, 500, 'Failed to fetch hotel details');
  }
});

// Get hotel profile for public viewing (no authentication required)
app.get('/api/hotels/:id/profile', (req, res) => {
  try {
    const hotelId = req.params.id;
    
    const hotel = db.prepare(`SELECT * FROM hotels WHERE id = ? AND is_active = 1`).get(hotelId);
    if (!hotel) {
      return fail(res, 404, 'Hotel not found or inactive');
    }
    
    // Get the latest approved profile
    const profile = db.prepare(`
      SELECT * FROM hotel_profiles 
      WHERE hotel_id = ? AND status = 'approved' 
      ORDER BY updated_at DESC 
      LIMIT 1
    `).get(hotelId);
    
    // Parse profile data if available
    let profileData = {};
    if (profile && profile.profile_data) {
      try {
        profileData = JSON.parse(profile.profile_data);
      } catch (e) {
        console.error('Error parsing profile data:', e);
      }
    }
    
    // Merge hotel data with profile data for display
    const hotelProfile = {
      ...hotel,
      ...profileData,
      profile_status: profile ? profile.status : 'not_submitted',
      profile_updated: profile ? profile.updated_at : null
    };
    
    return ok(res, { hotel: hotelProfile });
  } catch (error) {
    console.error('Public hotel profile error:', error);
    return fail(res, 500, 'Failed to fetch hotel profile');
  }
});

// Delete hotel (admin only)
app.delete('/api/admin/hotels/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const hotelId = req.params.id;
    const { reason } = req.body;
    
    if (!reason || reason.trim().length < 10) {
      return fail(res, 400, 'Deletion reason must be at least 10 characters long');
    }
    
    // Check if hotel exists
    const hotel = db.prepare(`SELECT * FROM hotels WHERE id = ?`).get(hotelId);
    if (!hotel) {
      return fail(res, 404, 'Hotel not found');
    }
    
    // Get associated data for backup
    const users = db.prepare(`SELECT * FROM users WHERE hotel_id = ?`).all(hotelId);
    const profiles = db.prepare(`SELECT * FROM hotel_profiles WHERE hotel_id = ?`).all(hotelId);
    
    // Create deletion record with backup data
    const deletionRecord = db.prepare(`
      INSERT INTO hotel_deletions (
        hotel_id, hotel_name, admin_user_id, admin_name, deletion_reason,
        hotel_data, users_data, profiles_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      hotelId,
      hotel.name || 'Unnamed Hotel',
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      reason.trim(),
      JSON.stringify(hotel),
      JSON.stringify(users),
      JSON.stringify(profiles)
    );
    
    // Delete associated data (cascade delete)
    db.prepare(`DELETE FROM hotel_profiles WHERE hotel_id = ?`).run(hotelId);
    db.prepare(`DELETE FROM government_quote_requests WHERE hotel_id = ?`).run(hotelId);
    db.prepare(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE hotel_id = ?)`).run(hotelId);
    db.prepare(`DELETE FROM users WHERE hotel_id = ?`).run(hotelId);
    db.prepare(`DELETE FROM hotels WHERE id = ?`).run(hotelId);
    
    return ok(res, { 
      message: 'Hotel deleted successfully',
      deletionId: deletionRecord.lastInsertRowid,
      canRetract: true
    });
  } catch (error) {
    console.error('Admin hotel deletion error:', error);
    return fail(res, 500, 'Failed to delete hotel');
  }
});

// Get deleted hotels (admin only)
app.get('/api/admin/deleted-hotels', requireAuth, requireAdmin, (req, res) => {
  try {
    const deletedHotels = db.prepare(`
      SELECT id, hotel_id, hotel_name, admin_name, deletion_reason, 
             deleted_at, is_retracted, retracted_at, retraction_reason
      FROM hotel_deletions
      ORDER BY deleted_at DESC
    `).all();
    
    return ok(res, { deletedHotels });
  } catch (error) {
    console.error('Admin deleted hotels fetch error:', error);
    return fail(res, 500, 'Failed to fetch deleted hotels');
  }
});

// Retract hotel deletion (admin only)
app.post('/api/admin/retract-deletion/:deletionId', requireAuth, requireAdmin, (req, res) => {
  try {
    const deletionId = req.params.deletionId;
    const { reason } = req.body;
    
    if (!reason || reason.trim().length < 10) {
      return fail(res, 400, 'Retraction reason must be at least 10 characters long');
    }
    
    // Get deletion record
    const deletionRecord = db.prepare(`
      SELECT * FROM hotel_deletions WHERE id = ? AND is_retracted = 0
    `).get(deletionId);
    
    if (!deletionRecord) {
      return fail(res, 404, 'Deletion record not found or already retracted');
    }
    
    // Parse backup data
    const hotelData = JSON.parse(deletionRecord.hotel_data);
    const usersData = JSON.parse(deletionRecord.users_data || '[]');
    const profilesData = JSON.parse(deletionRecord.profiles_data || '[]');
    
    // Check if hotel with same ID already exists (shouldn't happen, but safety check)
    const existingHotel = db.prepare(`SELECT id FROM hotels WHERE id = ?`).get(deletionRecord.hotel_id);
    if (existingHotel) {
      return fail(res, 409, 'Cannot retract deletion: Hotel ID already exists');
    }
    
    // Restore hotel
    db.prepare(`
      INSERT INTO hotels (id, name, email, city, state, country, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      hotelData.id, hotelData.name, hotelData.email, hotelData.city,
      hotelData.state, hotelData.country, hotelData.tags, hotelData.created_at
    );
    
    // Restore users
    for (const user of usersData) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, hotel_id, first_name, last_name, 
                          phone, job_title, fedevent_account_number, is_active, created_at, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id, user.email, user.password_hash, user.role, user.hotel_id,
        user.first_name, user.last_name, user.phone, user.job_title,
        user.fedevent_account_number, user.is_active, user.created_at, user.last_login
      );
    }
    
    // Restore profiles
    for (const profile of profilesData) {
      db.prepare(`
        INSERT INTO hotel_profiles (id, hotel_id, profile_data, files_data, status, submitted_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        profile.id, profile.hotel_id, profile.profile_data, profile.files_data,
        profile.status, profile.submitted_at, profile.updated_at
      );
    }
    
    // Mark deletion as retracted
    db.prepare(`
      UPDATE hotel_deletions 
      SET is_retracted = 1, retracted_at = datetime('now'), retraction_reason = ?
      WHERE id = ?
    `).run(reason.trim(), deletionId);
    
    return ok(res, { 
      message: 'Hotel deletion retracted successfully',
      hotelId: deletionRecord.hotel_id,
      hotelName: deletionRecord.hotel_name
    });
  } catch (error) {
    console.error('Admin retract deletion error:', error);
    return fail(res, 500, 'Failed to retract hotel deletion');
  }
});

// ---------- Hotel Portal API endpoints ----------

// Get hotel profile (hotel users only)
app.get('/api/hotel/profile', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'hotel' || !req.user.hotel_id) {
      return fail(res, 403, 'Hotel access required');
    }
    
    const hotel = db.prepare(`SELECT * FROM hotels WHERE id = ?`).get(req.user.hotel_id);
    const users = db.prepare(`SELECT id, email, first_name, last_name, phone, job_title, created_at, last_login FROM users WHERE hotel_id = ?`).all(req.user.hotel_id);
    const profiles = db.prepare(`SELECT * FROM hotel_profiles WHERE hotel_id = ?`).all(req.user.hotel_id);
    
    return ok(res, { hotel, users, profiles });
  } catch (error) {
    console.error('Hotel profile error:', error);
    return fail(res, 500, 'Failed to fetch hotel profile');
  }
});

// Submit hotel profile (hotel users only)
app.post('/api/hotel/profile', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'hotel') {
      return fail(res, 403, 'Hotel access required');
    }

    const body = req.body || {};

    // Ensure hotel exists and link user if needed
    let hotelId = req.user.hotel_id;
    if (!hotelId) {
      // Create minimal hotel record using submitted basics
      const name = body.hotelName || body.hotel_name || '';
      const email = body.email || '';
      const city = body.city || '';
      const state = body.state || '';
      const country = body.country || 'US';

      const insert = db.prepare(`
        INSERT INTO hotels (name, email, city, state, country, tags, created_at)
        VALUES (?, ?, ?, ?, ?, 'reg-form', datetime('now'))
      `).run(name, email, city, state, country);
      hotelId = insert.lastInsertRowid;

      // Link current user to the new hotel
      db.prepare(`UPDATE users SET hotel_id = ? WHERE id = ?`).run(hotelId, req.user.id);
    }

    // Store profile JSON
    const profileData = {
      ...body,
      submitted_via: 'hotel-profile-form.html',
      submitted_by_user_id: req.user.id,
      submitted_at: new Date().toISOString(),
      form_version: 'v2'
    };

    const filesData = Array.isArray(body.uploadedFiles) ? body.uploadedFiles : [];

    db.prepare(`
      INSERT INTO hotel_profiles (hotel_id, profile_data, files_data, status, submitted_at, updated_at)
      VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `).run(hotelId, JSON.stringify(profileData), JSON.stringify(filesData));

    return ok(res, { message: 'Profile submitted successfully', hotelId });
  } catch (error) {
    console.error('Hotel profile POST error:', error);
    return fail(res, 500, 'Failed to submit hotel profile');
  }
});
// Update hotel profile (hotel users only)
app.put('/api/hotel/profile', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'hotel' || !req.user.hotel_id) {
      return fail(res, 403, 'Hotel access required');
    }
    
    const { name, city, state, country } = req.body;
    
    db.prepare(`
      UPDATE hotels 
      SET name = ?, city = ?, state = ?, country = ?
      WHERE id = ?
    `).run(name, city, state, country, req.user.hotel_id);
    
    // Also update user profile if primary contact information is provided
    const primaryContactName = req.body['sign_contacts[0][name]'] || '';
    const primaryContactTitle = req.body['sign_contacts[0][title]'] || '';
    const primaryContactPhone = req.body['sign_contacts[0][phone]'] || '';
    
    if (primaryContactName || primaryContactTitle || primaryContactPhone) {
      // Parse name into first and last name
      const nameParts = primaryContactName.trim().split(' ');
      const firstName = nameParts[0] || req.user.first_name || '';
      const lastName = nameParts.slice(1).join(' ') || req.user.last_name || '';
      
      // Update user profile with primary contact information
      db.prepare(`
        UPDATE users 
        SET first_name = ?, last_name = ?, phone = ?, job_title = ?
        WHERE id = ?
      `).run(firstName, lastName, primaryContactPhone, primaryContactTitle, req.user.id);
      
      console.log(`Updated user profile for user ${req.user.id} with primary contact info`);
    }
    
    return ok(res, { message: 'Hotel profile updated successfully' });
  } catch (error) {
    console.error('Hotel profile update error:', error);
    return fail(res, 500, 'Failed to update hotel profile');
  }
});

// Add team member (hotel users only)
app.post('/api/hotel/team', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'hotel' || !req.user.hotel_id) {
      return fail(res, 403, 'Hotel access required');
    }
    
    const { email, password, first_name, last_name, phone, job_title } = req.body;
    
    if (!email || !password || !first_name || !last_name) {
      return fail(res, 400, 'Required fields missing');
    }
    
    // Check if user already exists
    const existingUser = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existingUser) {
      return fail(res, 400, 'User with this email already exists');
    }
    
    const passwordHash = hashPassword(password);
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, first_name, last_name, phone, job_title, hotel_id, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'hotel')
    `).run(email, passwordHash, first_name, last_name, phone || '', job_title || '', req.user.hotel_id);
    
    return ok(res, { message: 'Team member added successfully', userId: result.lastInsertRowid });
  } catch (error) {
    console.error('Add team member error:', error);
    return fail(res, 500, 'Failed to add team member');
  }
});

// ---------- Contract Management API endpoints ----------

// Create new contract (admin only)
app.post('/api/admin/contracts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      title, description, location_city, location_state, location_country,
      start_date, end_date, room_count, per_diem_rate, requirements,
      sow_document, bidding_deadline, decision_date, visibility,
      bid_strategy, target_bid_min, target_bid_max
    } = req.body;

    if (!title || !per_diem_rate || !room_count) {
      return fail(res, 400, 'Title, per diem rate, and room count are required');
    }

    // Calculate max rates (30% off per diem for contracted, 10% off for self-pay)
    const max_contracted_rate = per_diem_rate * 0.7;
    const max_self_pay_rate = per_diem_rate * 0.9;

    const bidStrategy = (bid_strategy || 'FIRM_FIXED').toString().toUpperCase();
    const targetBidMin = (target_bid_min !== undefined && target_bid_min !== null && target_bid_min !== '')
      ? Number.parseInt(target_bid_min, 10)
      : null;
    const targetBidMax = (target_bid_max !== undefined && target_bid_max !== null && target_bid_max !== '')
      ? Number.parseInt(target_bid_max, 10)
      : null;

    if (targetBidMin !== null && (Number.isNaN(targetBidMin) || targetBidMin < 0)) {
      return fail(res, 400, 'Target minimum bidders must be zero or greater');
    }
    if (targetBidMax !== null && (Number.isNaN(targetBidMax) || targetBidMax < 0)) {
      return fail(res, 400, 'Target maximum bidders must be zero or greater');
    }
    if (targetBidMin !== null && targetBidMax !== null && targetBidMin > targetBidMax) {
      return fail(res, 400, 'Target minimum bidders cannot be greater than maximum bidders');
    }

    const result = db.prepare(`
      INSERT INTO contracts (
        title, description, location_city, location_state, location_country,
        start_date, end_date, room_count, per_diem_rate, max_contracted_rate,
        max_self_pay_rate, requirements, sow_document, bidding_deadline,
        decision_date, created_by, visibility, bid_strategy, target_bid_min, target_bid_max
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, description, location_city, location_state, location_country,
      start_date, end_date, room_count, per_diem_rate, max_contracted_rate,
      max_self_pay_rate, requirements, sow_document, bidding_deadline,
      decision_date, req.user.id, (visibility || 'PUBLIC').toUpperCase(),
      bidStrategy, targetBidMin, targetBidMax
    );

    const contractId = result.lastInsertRowid;

    // Find matching hotels and send notifications
    await notifyMatchingHotels(contractId, location_city, location_state, location_country, requirements);

    return ok(res, { contractId, message: 'Contract created and notifications sent' });
  } catch (error) {
    console.error('Create contract error:', error);
    return fail(res, 500, 'Failed to create contract');
  }
});

// Create contract from SOW file upload (admin only)
app.post('/api/admin/contracts/create-from-sow', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No SOW file uploaded');
    }

    // Store the uploaded file info
    const sowDocument = req.file.filename;
    
    // Default contract values - can be enhanced with OpenAI extraction later
    const title = `Contract from SOW - ${new Date().toLocaleDateString()}`;
    const description = `Contract created from uploaded SOW document: ${req.file.originalname}`;
    const perDiemRate = 150; // Default value
    const roomCount = 50; // Default value
    const maxContractedRate = perDiemRate * 0.7;
    const maxSelfPayRate = perDiemRate * 0.9;
    
    // Set default dates (start: 30 days from now, end: 60 days after start)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 30);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 60);
    
    const biddingDeadline = new Date();
    biddingDeadline.setDate(biddingDeadline.getDate() + 14); // 14 days to bid
    
    const decisionDate = new Date();
    decisionDate.setDate(decisionDate.getDate() + 21); // Decision in 21 days

    const result = db.prepare(`
      INSERT INTO contracts (
        title, description, location_city, location_state, location_country,
        start_date, end_date, room_count, per_diem_rate, max_contracted_rate,
        max_self_pay_rate, requirements, sow_document, bidding_deadline,
        decision_date, created_by, visibility, bid_strategy, target_bid_min, target_bid_max
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description,
      null, // location_city
      null, // location_state
      'USA', // location_country
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      roomCount,
      perDiemRate,
      maxContractedRate,
      maxSelfPayRate,
      'Please review and update contract requirements based on the uploaded SOW document.',
      sowDocument,
      biddingDeadline.toISOString().split('T')[0],
      decisionDate.toISOString().split('T')[0],
      req.user.id,
      'DRAFT', // Set as DRAFT so admin can review before publishing
      'FIRM_FIXED',
      null,
      null
    );

    const contractId = result.lastInsertRowid;

    return ok(res, { 
      contractId, 
      message: 'Contract created from SOW. Please review and update details before publishing.',
      sowFile: sowDocument
    });
  } catch (error) {
    console.error('Create contract from SOW error:', error);
    return fail(res, 500, 'Failed to create contract from SOW');
  }
});

// Get all contracts (admin only)
app.get('/api/admin/contracts', requireAuth, requireAdmin, (req, res) => {
  try {
    const contracts = db.prepare(`
      SELECT c.*, 
             COUNT(DISTINCT cn.hotel_id) as notified_hotels,
             COUNT(DISTINCT cb.hotel_id) as bidding_hotels,
             MIN(cb.contracted_rate) as lowest_bid,
             h.name as awarded_hotel_name
      FROM contracts c
      LEFT JOIN contract_notifications cn ON c.id = cn.contract_id
      LEFT JOIN contract_bids cb ON c.id = cb.contract_id AND cb.status IN ('active','submitted')
      LEFT JOIN hotels h ON c.awarded_hotel_id = h.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all();

    return ok(res, { contracts });
  } catch (error) {
    console.error('Get contracts error:', error);
    return fail(res, 500, 'Failed to fetch contracts');
  }
});

app.post('/api/admin/auctions/parse-sow', requireAuth, requireAdmin, upload.single('sow'), async (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No SOW uploaded');
    }

    const { requirements, summary, clins, warnings } = await parseSowDocument(
      req.file.path,
      req.file.originalname || '',
      req.file.mimetype || ''
    );
    return ok(res, {
      requirements,
      summary,
      clins,
      warnings
    });
  } catch (error) {
    console.error('Parse SOW error:', error);
    return fail(res, 500, 'Failed to analyze SOW document');
  } finally {
    if (req.file?.path) {
      try {
        await fsp.unlink(req.file.path);
      } catch (_) {}
    }
  }
});

// Create live auction (admin only)
app.post('/api/admin/auctions', requireAuth, requireAdmin, upload.single('sow'), (req, res) => {
  try {
    const {
      title,
      description,
      location_city,
      location_state,
      start_date,
      end_date,
      bidding_start,
      bidding_end,
      base_rate,
      room_count,
      requirements,
      requirement_summary
    } = req.body || {};

    if (!title || !bidding_start || !bidding_end) {
      return fail(res, 400, 'Title, bidding start, and bidding end are required');
    }

    const parsedStartDate = start_date ? new Date(start_date) : null;
    const parsedEndDate = end_date ? new Date(end_date) : null;
    const parsedBidStart = new Date(bidding_start);
    const parsedBidEnd = new Date(bidding_end);

    if (Number.isNaN(parsedBidStart.getTime()) || Number.isNaN(parsedBidEnd.getTime())) {
      return fail(res, 400, 'Invalid bidding window');
    }
    if (parsedStartDate && Number.isNaN(parsedStartDate.getTime())) {
      return fail(res, 400, 'Invalid start date');
    }
    if (parsedEndDate && Number.isNaN(parsedEndDate.getTime())) {
      return fail(res, 400, 'Invalid end date');
    }
    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
      return fail(res, 400, 'Event start date must be before the end date');
    }
    if (parsedBidStart > parsedBidEnd) {
      return fail(res, 400, 'Bidding start must be before bidding end');
    }

    const numericBaseRate = base_rate ? Number.parseFloat(base_rate) : null;
    if (numericBaseRate !== null && (Number.isNaN(numericBaseRate) || numericBaseRate < 0)) {
      return fail(res, 400, 'Base rate must be a positive number');
    }

    const numericRoomCount = room_count ? Number.parseInt(room_count, 10) : null;
    if (numericRoomCount !== null && (Number.isNaN(numericRoomCount) || numericRoomCount < 0)) {
      return fail(res, 400, 'Room count must be zero or greater');
    }

    let sowDocument = null;
    let sowOriginal = null;
    let sowMime = null;
    let sowSize = null;

    if (req.file) {
      sowDocument = req.file.filename;
      sowOriginal = req.file.originalname || null;
      sowMime = req.file.mimetype || null;
      sowSize = req.file.size || null;
    }

    const safeRequirements = requirements ? scrubSensitiveContent(requirements) : null;
    const safeSummary = requirement_summary ? scrubSensitiveContent(requirement_summary) : null;

    const insert = db.prepare(`
      INSERT INTO live_auctions (
        title,
        description,
        location_city,
        location_state,
        start_date,
        end_date,
        bidding_start,
        bidding_end,
        base_rate,
        room_count,
        requirements,
        requirement_summary,
        sow_document,
        sow_original_name,
        sow_mime_type,
        sow_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description || null,
      location_city || null,
      location_state || null,
      start_date || new Date().toISOString().split('T')[0], // Default to today if not provided
      end_date || new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0], // Default to 7 days from now
      bidding_start,
      bidding_end,
      numericBaseRate,
      numericRoomCount,
      safeRequirements,
      safeSummary,
      sowDocument,
      sowOriginal,
      sowMime,
      sowSize
    );

    const auctionId = insert.lastInsertRowid;

    let clinsInserted = 0;
    if (req.body && typeof req.body.clin_data === 'string' && req.body.clin_data.trim()) {
      try {
        const parsed = JSON.parse(req.body.clin_data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const records = parsed
            .map((item, index) => {
              if (!item || typeof item !== 'object') return null;
              const clinNumber = String(item.clin_number || '').trim().slice(0, 32) || `000${index + 1}`;
              const title = scrubSensitiveContent(String(item.title || '').trim());
              const description = scrubSensitiveContent(String(item.description || '').trim());
              if (!title && !description) return null;
              return {
                clin_number: clinNumber,
                title: (title || `Requirement ${String(index + 1).padStart(4, '0')}`).slice(0, 200),
                description: description || title || '',
                display_order: Number.isInteger(item.display_order) ? item.display_order : index
              };
            })
            .filter(Boolean);

          if (records.length) {
            const stmt = db.prepare(`
              INSERT INTO auction_clins (auction_id, clin_number, title, description, display_order)
              VALUES (?, ?, ?, ?, ?)
            `);
            const insertMany = db.transaction((rows) => {
              rows.forEach(row => {
                stmt.run(auctionId, row.clin_number, row.title, row.description, row.display_order);
              });
            });
            insertMany(records);
            clinsInserted = records.length;
          }
        }
      } catch (clinError) {
        console.warn('Failed to parse clin_data payload:', clinError);
      }
    }

    return ok(res, {
      message: 'Live auction created',
      auctionId,
      clinsInserted
    });
  } catch (error) {
    console.error('Create live auction error:', error);
    return fail(res, 500, 'Failed to create live auction');
  }
});

// Get contract details with bids (admin only)
app.get('/api/admin/contracts/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const contractId = req.params.id;
    
    const contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
    if (!contract) {
      return fail(res, 404, 'Contract not found');
    }

    const bids = db.prepare(`
      SELECT cb.*, h.name as hotel_name, h.city, h.state, h.country
      FROM contract_bids cb
      JOIN hotels h ON cb.hotel_id = h.id
      WHERE cb.contract_id = ? AND cb.status IN ('active','submitted')
      ORDER BY 
        CASE cb.status WHEN 'submitted' THEN 0 ELSE 1 END,
        cb.contracted_rate ASC
    `).all(contractId);

    const notifications = db.prepare(`
      SELECT cn.*, h.name as hotel_name
      FROM contract_notifications cn
      JOIN hotels h ON cn.hotel_id = h.id
      WHERE cn.contract_id = ?
      ORDER BY cn.email_sent_at DESC
    `).all(contractId);

    return ok(res, { contract, bids, notifications });
  } catch (error) {
    console.error('Get contract details error:', error);
    return fail(res, 500, 'Failed to fetch contract details');
  }
});

// Award contract (admin only)
app.post('/api/admin/contracts/:id/award', requireAuth, requireAdmin, (req, res) => {
  try {
    const contractId = req.params.id;
    const { hotel_id } = req.body;

    if (!hotel_id) {
      return fail(res, 400, 'Hotel ID required');
    }

    db.prepare(`UPDATE contracts SET awarded_hotel_id = ?, status = 'awarded' WHERE id = ?`)
      .run(hotel_id, contractId);

    return ok(res, { message: 'Contract awarded successfully' });
  } catch (error) {
    console.error('Award contract error:', error);
    return fail(res, 500, 'Failed to award contract');
  }
});

// Grant hotel access to a PRIVATE contract (admin only)
app.post('/api/admin/contracts/:id/grant', requireAuth, requireAdmin, (req, res) => {
  try {
    const contractId = req.params.id;
    const { hotel_id } = req.body;

    if (!hotel_id) {
      return fail(res, 400, 'Hotel ID required');
    }

    // Ensure contract exists
    const contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
    if (!contract) {
      return fail(res, 404, 'Contract not found');
    }

    db.prepare(`
      INSERT OR IGNORE INTO contract_access (contract_id, hotel_id)
      VALUES (?, ?)
    `).run(contractId, hotel_id);

    return ok(res, { message: 'Access granted' });
  } catch (error) {
    console.error('Grant access error:', error);
    return fail(res, 500, 'Failed to grant access');
  }
});
// Delete contract (admin only)
app.delete('/api/admin/contracts/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const contractId = req.params.id;
    
    // Check if contract exists
    const contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
    if (!contract) {
      return fail(res, 404, 'Contract not found');
    }
    
    // Delete associated data (cascade delete)
    db.prepare(`DELETE FROM contract_bids WHERE contract_id = ?`).run(contractId);
    db.prepare(`DELETE FROM contract_notifications WHERE contract_id = ?`).run(contractId);
    db.prepare(`DELETE FROM contract_access WHERE contract_id = ?`).run(contractId);
    db.prepare(`DELETE FROM contract_qna WHERE contract_id = ?`).run(contractId);
    db.prepare(`DELETE FROM bid_files WHERE contract_id = ?`).run(contractId);
    db.prepare(`DELETE FROM contracts WHERE id = ?`).run(contractId);
    
    return ok(res, { message: 'Contract deleted successfully' });
  } catch (error) {
    console.error('Delete contract error:', error);
    return fail(res, 500, 'Failed to delete contract');
  }
});

// Update contract (admin only)
app.put('/api/admin/contracts/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const contractId = req.params.id;
    const {
      title, description, location_city, location_state, location_country,
      start_date, end_date, room_count, per_diem_rate, requirements,
      sow_document, bidding_deadline, decision_date, visibility, status,
      bid_strategy, target_bid_min, target_bid_max
    } = req.body;

    // Check if contract exists
    const contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
    if (!contract) {
      return fail(res, 404, 'Contract not found');
    }

    // Calculate max rates if per_diem_rate is provided
    let max_contracted_rate = contract.max_contracted_rate;
    let max_self_pay_rate = contract.max_self_pay_rate;
    
    if (per_diem_rate !== undefined) {
      max_contracted_rate = per_diem_rate * 0.7;
      max_self_pay_rate = per_diem_rate * 0.9;
    }

    let normalizedBidStrategy = null;
    if (bid_strategy !== undefined) {
      normalizedBidStrategy = bid_strategy ? bid_strategy.toString().toUpperCase() : null;
    }

    const normalizedTargetMin = (target_bid_min !== undefined)
      ? (target_bid_min === null || target_bid_min === '' ? null : Number.parseInt(target_bid_min, 10))
      : undefined;
    if (normalizedTargetMin !== undefined && normalizedTargetMin !== null) {
      if (Number.isNaN(normalizedTargetMin) || normalizedTargetMin < 0) {
        return fail(res, 400, 'Target minimum bidders must be zero or greater');
      }
    }

    const normalizedTargetMax = (target_bid_max !== undefined)
      ? (target_bid_max === null || target_bid_max === '' ? null : Number.parseInt(target_bid_max, 10))
      : undefined;
    if (normalizedTargetMax !== undefined && normalizedTargetMax !== null) {
      if (Number.isNaN(normalizedTargetMax) || normalizedTargetMax < 0) {
        return fail(res, 400, 'Target maximum bidders must be zero or greater');
      }
    }

    if (normalizedTargetMin !== undefined && normalizedTargetMax !== undefined && normalizedTargetMin !== null && normalizedTargetMax !== null) {
      if (normalizedTargetMin > normalizedTargetMax) {
        return fail(res, 400, 'Target minimum bidders cannot be greater than maximum bidders');
      }
    }

    // Update contract
    const result = db.prepare(`
      UPDATE contracts SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        location_city = COALESCE(?, location_city),
        location_state = COALESCE(?, location_state),
        location_country = COALESCE(?, location_country),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        room_count = COALESCE(?, room_count),
        per_diem_rate = COALESCE(?, per_diem_rate),
        max_contracted_rate = COALESCE(?, max_contracted_rate),
        max_self_pay_rate = COALESCE(?, max_self_pay_rate),
        requirements = COALESCE(?, requirements),
        sow_document = COALESCE(?, sow_document),
        bidding_deadline = COALESCE(?, bidding_deadline),
        decision_date = COALESCE(?, decision_date),
        visibility = COALESCE(?, visibility),
        status = COALESCE(?, status),
        bid_strategy = COALESCE(?, bid_strategy),
        target_bid_min = COALESCE(?, target_bid_min),
        target_bid_max = COALESCE(?, target_bid_max)
      WHERE id = ?
    `).run(
      title, description, location_city, location_state, location_country,
      start_date, end_date, room_count, per_diem_rate, max_contracted_rate,
      max_self_pay_rate, requirements, sow_document, bidding_deadline,
      decision_date, visibility, status,
      normalizedBidStrategy,
      normalizedTargetMin === undefined ? null : normalizedTargetMin,
      normalizedTargetMax === undefined ? null : normalizedTargetMax,
      contractId
    );

    // Get updated contract
    const updatedContract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);

    return ok(res, { 
      message: 'Contract updated successfully',
      contract: updatedContract
    });
  } catch (error) {
    console.error('Update contract error:', error);
    return fail(res, 500, 'Failed to update contract');
  }
});
// Hotel responds to notification (interested/not interested)
app.post('/api/contracts/respond/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { response } = req.body; // 'interested' or 'not_interested'

    // Decode token to get contract_id and hotel_id
    const [contractId, hotelId] = Buffer.from(token, 'base64').toString().split(':');

    if (!contractId || !hotelId) {
      return fail(res, 400, 'Invalid token');
    }

    // Update notification response
    db.prepare(`
      UPDATE contract_notifications 
      SET response = ?, responded_at = datetime('now')
      WHERE contract_id = ? AND hotel_id = ?
    `).run(response, contractId, hotelId);

    if (response === 'interested') {
      return ok(res, { 
        message: 'Thank you for your interest! Please log in to view the full SOW and submit your bid.',
        redirect: '/hotel-login.html'
      });
    } else {
      return ok(res, { message: 'Thank you for your response.' });
    }
  } catch (error) {
    console.error('Contract response error:', error);
    return fail(res, 500, 'Failed to process response');
  }
});

function fetchActiveContractBids(contractId) {
  return db.prepare(`
    SELECT cb.*, h.name as hotel_name, h.email as hotel_email
    FROM contract_bids cb
    JOIN hotels h ON cb.hotel_id = h.id
    WHERE cb.contract_id = ? AND cb.status IN ('active','submitted','clarification','bafo')
    ORDER BY cb.contracted_rate ASC, cb.updated_at ASC, cb.id ASC
  `).all(contractId);
}

function calculateContractStandings(contractId) {
  const bids = fetchActiveContractBids(contractId);
  return bids.map((bid, index) => ({ position: index + 1, bid }));
}

function sanitizeStandingsForHotel(standings, hotelId) {
  return standings.map(({ position, bid }) => {
    const isYou = bid.hotel_id === hotelId;
    const entry = {
      position,
      isYou,
      label: isYou ? 'Your Bid' : `Bidder ${position}`,
      status: position === 1 ? 'leading' : (position === 2 ? 'runner_up' : 'participating')
    };
    if (isYou) {
      entry.contracted_rate = bid.contracted_rate;
      entry.self_pay_rate = bid.self_pay_rate;
      entry.auto_bid_active = bid.auto_bid_active === 1;
      entry.auto_bid_floor = bid.auto_bid_floor;
      entry.auto_bid_step = bid.auto_bid_step;
      entry.last_known_rank = bid.last_known_rank;
      entry.updated_at = bid.updated_at;
      entry.submitted_at = bid.submitted_at;
    }
    return entry;
  });
}

function notifyBidLoss(contractId, bid, contract) {
  if (!bid || bid.hotel_id == null || !bid.hotel_email) return;
  const subject = `Bid status update for ${contract?.title || 'your contract'}`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="color:#1e40af;">You have been outbid</h2>
      <p>Another hotel has moved into first place for <strong>${contract?.title || 'this opportunity'}</strong>.</p>
      <p style="margin:1rem 0;">Log into the FEDEVENT hotel portal to review your standing and decide if you want to lower your bid or adjust your auto-stop settings.</p>
      <p style="font-size:0.875rem;color:#6b7280;">This automated notice was sent regarding contract #${contractId}.</p>
    </div>
  `;
  const fromAddress = process.env.BID_NOTIFY_FROM || process.env.SMTP_FROM || process.env.NOTIFY_FROM || 'noreply@fedevent.com';
  sendMail({ to: bid.hotel_email, subject, html, from: fromAddress }).catch(err => {
    console.error('Failed to send bid loss email:', err);
  });
}

function recalculateStandings(contractId, options = {}) {
  const { updateDb = false, suppressEmail = false } = options;
  const standings = calculateContractStandings(contractId);
  if (updateDb && standings.length > 0) {
    const contract = suppressEmail ? null : db.prepare(`SELECT id, title FROM contracts WHERE id = ?`).get(contractId);
    const updateStmt = db.prepare(`UPDATE contract_bids SET last_known_rank = ? WHERE id = ?`);
    standings.forEach(({ position, bid }) => {
      if (!suppressEmail && bid.last_known_rank === 1 && position > 1) {
        notifyBidLoss(contractId, bid, contract);
      }
      updateStmt.run(position, bid.id);
    });
  }
  return standings;
}

function applyAutoBidAdjustments(contractId) {
  let changed = false;
  let attempts = 0;
  while (attempts < 8) {
    attempts += 1;
    const standings = calculateContractStandings(contractId);
    if (standings.length < 2) break;
    const leaderRate = Number.parseFloat(standings[0].bid.contracted_rate);
    if (!Number.isFinite(leaderRate)) break;
    let cycleChanged = false;
    for (let i = 1; i < standings.length; i += 1) {
      const bid = standings[i].bid;
      if (bid.status !== 'active') continue;
      if (bid.auto_bid_active !== 1) continue;
      const floorValue = Number.parseFloat(bid.auto_bid_floor);
      if (!Number.isFinite(floorValue)) continue;
      const stepValue = Number.isFinite(Number.parseFloat(bid.auto_bid_step)) && Number.parseFloat(bid.auto_bid_step) > 0
        ? Number.parseFloat(bid.auto_bid_step)
        : 1;
      let target = leaderRate - stepValue;
      const currentRate = Number.parseFloat(bid.contracted_rate);
      if (!Number.isFinite(currentRate)) continue;
      let newRate = Math.max(target, floorValue);
      newRate = Number.isFinite(newRate) ? Number(newRate.toFixed(2)) : currentRate;
      if (newRate < 0) newRate = 0;
      if (newRate < currentRate - 0.0001) {
        db.prepare(`
          UPDATE contract_bids
          SET contracted_rate = ?, updated_at = datetime('now'), auto_bid_last_adjusted_at = datetime('now')
          WHERE id = ?
        `).run(newRate, bid.id);
        cycleChanged = true;
      }
    }
    if (!cycleChanged) break;
    changed = true;
  }
  return changed;
}

// Get available contracts for hotel (hotel users only)
app.get('/api/hotel/contracts', requireAuth, (req, res) => {
  try {
    // Allow hotel users to view PUBLIC contracts even if their profile is not fully linked yet (no hotel_id)
    if (req.user.role !== 'hotel') {
      return fail(res, 403, 'Hotel access required');
    }

    // Show only PUBLIC contracts or those explicitly granted via contract_access; include my bid annotation
    const contracts = db.prepare(`
      SELECT 
        c.*, 
        cn.response AS notification_response,
        cb.contracted_rate AS my_contracted_rate,
        cb.self_pay_rate AS my_self_pay_rate,
        cb.status AS my_bid_status
      FROM contracts c
      LEFT JOIN contract_notifications cn 
        ON c.id = cn.contract_id AND cn.hotel_id = ?
      LEFT JOIN contract_bids cb 
        ON c.id = cb.contract_id AND cb.hotel_id = ? AND cb.status IN ('active','submitted')
      LEFT JOIN contract_access ca
        ON ca.contract_id = c.id AND ca.hotel_id = ?
      WHERE c.status = 'active' AND (
        c.visibility = 'PUBLIC' OR ca.id IS NOT NULL
      )
      ORDER BY c.bidding_deadline ASC NULLS LAST, c.id DESC
    `).all(req.user.hotel_id || null, req.user.hotel_id || null, req.user.hotel_id || null);
    const enriched = contracts.map(contract => {
      const standings = calculateContractStandings(contract.id);
      contract.bid_count = standings.length;
      const myEntry = standings.find(item => item.bid.hotel_id === req.user.hotel_id);
      contract.my_position = myEntry ? myEntry.position : null;
      contract.my_auto_bid_active = myEntry ? myEntry.bid.auto_bid_active === 1 : false;
      return contract;
    });

    return ok(res, { contracts: enriched });
  } catch (error) {
    console.error('Get hotel contracts error:', error);
    return fail(res, 500, 'Failed to fetch contracts');
  }
});

// List my bids (hotel users only)
app.get('/api/hotel/bids', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'hotel' || !req.user.hotel_id) {
      return fail(res, 403, 'Hotel access required');
    }

    const allowed = new Set(['active','archived','submitted']);
    const status = (req.query.status || 'active').toString().toLowerCase();
    const filterStatus = allowed.has(status) ? status : 'active';

    const rows = db.prepare(`
      SELECT 
        cb.*, 
        c.title, c.location_city, c.location_state, c.bidding_deadline, c.max_contracted_rate, c.max_self_pay_rate
      FROM contract_bids cb
      JOIN contracts c ON cb.contract_id = c.id
      WHERE cb.hotel_id = ? AND cb.status = ?
      ORDER BY cb.updated_at DESC, cb.submitted_at DESC
    `).all(req.user.hotel_id, filterStatus);

    return ok(res, { bids: rows });
  } catch (error) {
    console.error('List hotel bids error:', error);
    return fail(res, 500, 'Failed to fetch bids');
  }
});

// Get contract details for bidding (hotel users only)
app.get('/api/hotel/contracts/:id', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'hotel' || !req.user.hotel_id) {
      return fail(res, 403, 'Hotel access required');
    }

    const contractId = req.params.id;

    // Check access: contract is PUBLIC or explicitly granted; contract must be OPEN/active
    const contract = db.prepare(`
      SELECT c.*
      FROM contracts c
      LEFT JOIN contract_access ca ON ca.contract_id = c.id AND ca.hotel_id = ?
      WHERE c.id = ? AND c.status = 'active' AND (
        c.visibility = 'PUBLIC' OR ca.id IS NOT NULL
      )
    `).get(req.user.hotel_id, contractId);
    if (!contract) {
      return fail(res, 404, 'Contract not found');
    }

    const standings = calculateContractStandings(contractId);
    const sanitized = sanitizeStandingsForHotel(standings, req.user.hotel_id);

    const myBid = db.prepare(`
      SELECT * FROM contract_bids 
      WHERE contract_id = ? AND hotel_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(contractId, req.user.hotel_id);

    const myEntry = sanitized.find(item => item.isYou) || null;

    return ok(res, {
      contract,
      standings: sanitized,
      total_bidders: standings.length,
      my_position: myEntry ? myEntry.position : null,
      my_bid: myBid,
      myBid
    });
  } catch (error) {
    console.error('Get contract details error:', error);
    return fail(res, 500, 'Failed to fetch contract details');
  }
});

// Submit or update bid (hotel users only)
app.post('/api/hotel/contracts/:id/bid', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'hotel' || !req.user.hotel_id) {
      return fail(res, 403, 'Hotel access required');
    }

    const contractId = req.params.id;
    const payload = req.body || {};

    const contractedRate = Number.parseFloat(payload.contracted_rate);
    const selfPayRate = Number.parseFloat(payload.self_pay_rate);

    if (!Number.isFinite(contractedRate) || contractedRate <= 0) {
      return fail(res, 400, 'A valid contracted rate is required');
    }
    if (!Number.isFinite(selfPayRate) || selfPayRate < 0) {
      return fail(res, 400, 'A valid self-pay rate is required');
    }

    const additionalNotes = (payload.additional_notes || '').toString();

    let breakdownValue = null;
    if (payload.breakdown) {
      if (typeof payload.breakdown === 'string') {
        breakdownValue = payload.breakdown;
      } else {
        try {
          breakdownValue = JSON.stringify(payload.breakdown);
        } catch (jsonErr) {
          return fail(res, 400, 'Breakdown must be valid JSON');
        }
      }
    }

    let totalPrice = null;
    if (payload.total_price !== undefined && payload.total_price !== null && payload.total_price !== '') {
      const parsedTotal = Number.parseFloat(payload.total_price);
      if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
        return fail(res, 400, 'Total price must be a positive number');
      }
      totalPrice = parsedTotal;
    }

    const autoBidActive = payload.auto_bid_active ? 1 : 0;
    let autoBidFloor = null;
    if (payload.auto_bid_floor !== undefined && payload.auto_bid_floor !== null && payload.auto_bid_floor !== '') {
      const parsedFloor = Number.parseFloat(payload.auto_bid_floor);
      if (!Number.isFinite(parsedFloor) || parsedFloor < 0) {
        return fail(res, 400, 'Auto-stop floor must be zero or higher');
      }
      autoBidFloor = parsedFloor;
    }

    let autoBidStep = null;
    if (payload.auto_bid_step !== undefined && payload.auto_bid_step !== null && payload.auto_bid_step !== '') {
      const parsedStep = Number.parseFloat(payload.auto_bid_step);
      if (!Number.isFinite(parsedStep) || parsedStep <= 0) {
        return fail(res, 400, 'Auto-stop step must be greater than zero');
      }
      autoBidStep = parsedStep;
    }

    if (autoBidActive) {
      if (autoBidFloor == null) {
        return fail(res, 400, 'Auto-stop floor is required when auto bid is enabled');
      }
      if (autoBidFloor > contractedRate) {
        return fail(res, 400, 'Auto-stop floor must be less than or equal to your starting bid');
      }
      if (autoBidStep == null) {
        autoBidStep = 1;
      }
    } else {
      autoBidFloor = autoBidFloor == null ? null : autoBidFloor;
      autoBidStep = autoBidStep == null ? null : autoBidStep;
    }

    // Get contract to check max rates
    const contract = db.prepare(`
      SELECT c.*
      FROM contracts c
      LEFT JOIN contract_access ca ON ca.contract_id = c.id AND ca.hotel_id = ?
      WHERE c.id = ? AND c.status = 'active' AND (
        c.visibility = 'PUBLIC' OR ca.id IS NOT NULL
      )
    `).get(req.user.hotel_id, contractId);
    if (!contract) {
      return fail(res, 404, 'Contract not found or no longer active');
    }

    // Check if rates are within acceptable limits
    if (contractedRate > contract.max_contracted_rate) {
      return fail(res, 400, `Contracted rate cannot exceed $${contract.max_contracted_rate} (30% off per diem)`);
    }

    if (selfPayRate > contract.max_self_pay_rate) {
      return fail(res, 400, `Self-pay rate cannot exceed $${contract.max_self_pay_rate} (10% off per diem)`);
    }

    // Check if bidding deadline has passed
    if (contract.bidding_deadline && new Date() > new Date(contract.bidding_deadline)) {
      return fail(res, 400, 'Bidding deadline has passed');
    }

    // Check if hotel has existing bid
    const existingBid = db.prepare(`
      SELECT * FROM contract_bids 
      WHERE contract_id = ? AND hotel_id = ?
      ORDER BY id DESC
    `).get(contractId, req.user.hotel_id);

    if (existingBid) {
      // Guard: cannot edit if locked (submitted)
      if (existingBid.status === 'submitted') {
        return fail(res, 400, 'Bid is submitted and locked');
      }
      // Guard: allowed statuses for editing
      const editableStatuses = new Set(['draft','clarification','bafo','active']);
      if (!editableStatuses.has(existingBid.status)) {
        return fail(res, 400, 'Bid cannot be edited in current status');
      }
      // Update existing bid
      db.prepare(`
        UPDATE contract_bids 
        SET contracted_rate = ?,
            self_pay_rate = ?,
            additional_notes = ?,
            breakdown = ?,
            total_price = ?,
            status = 'active',
            auto_bid_active = ?,
            auto_bid_floor = ?,
            auto_bid_step = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        contractedRate,
        selfPayRate,
        additionalNotes,
        breakdownValue,
        totalPrice,
        autoBidActive,
        autoBidFloor,
        autoBidStep,
        existingBid.id
      );
    } else {
      // Create new bid
      db.prepare(`
        INSERT INTO contract_bids (
          contract_id,
          hotel_id,
          contracted_rate,
          self_pay_rate,
          additional_notes,
          breakdown,
          total_price,
          status,
          auto_bid_active,
          auto_bid_floor,
          auto_bid_step
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(
        contractId,
        req.user.hotel_id,
        contractedRate,
        selfPayRate,
        additionalNotes,
        breakdownValue,
        totalPrice,
        autoBidActive,
        autoBidFloor,
        autoBidStep
      );
    }
    // Rebalance auto bids before recalculating standings
    applyAutoBidAdjustments(contractId);

    const standings = recalculateStandings(contractId, { updateDb: true });
    const sanitized = sanitizeStandingsForHotel(standings, req.user.hotel_id);
    const myEntry = sanitized.find(item => item.isYou) || null;

    return ok(res, {
      message: 'Bid saved',
      standings: sanitized,
      bids: sanitized,
      total_bidders: standings.length,
      my_position: myEntry ? myEntry.position : null
    });
  } catch (error) {
    console.error('Submit bid error:', error);
    return fail(res, 500, 'Failed to submit bid');
  }
});

// Function to notify matching hotels
async function notifyMatchingHotels(contractId, city, state, country, requirements) {
  try {
    // For now, notify all hotels in the same city/state/country
    // In the future, this can be enhanced with more sophisticated matching
    let query = `SELECT DISTINCT h.id, h.name, h.email FROM hotels h JOIN users u ON h.id = u.hotel_id WHERE h.email IS NOT NULL`;
    let params = [];

    if (city) {
      query += ` AND h.city LIKE ?`;
      params.push(`%${city}%`);
    }
    if (state) {
      query += ` AND h.state LIKE ?`;
      params.push(`%${state}%`);
    }
    if (country) {
      query += ` AND h.country LIKE ?`;
      params.push(`%${country}%`);
    }

    const matchingHotels = db.prepare(query).all(...params);
    let successCount = 0;
    let errorCount = 0;

    for (const hotel of matchingHotels) {
      try {
        // Create notification record
        const result = db.prepare(`
          INSERT INTO contract_notifications (contract_id, hotel_id)
          VALUES (?, ?)
        `).run(contractId, hotel.id);

        // Send email notification
        const token = Buffer.from(`${contractId}:${hotel.id}`).toString('base64');
        await sendContractNotification(hotel, contractId, token);

        // Mark email as sent
        db.prepare(`
          UPDATE contract_notifications 
          SET email_sent = 1, email_sent_at = datetime('now')
          WHERE id = ?
        `).run(result.lastInsertRowid);
        
        successCount++;
      } catch (hotelError) {
        console.error(`Failed to notify hotel ${hotel.name} (ID: ${hotel.id}):`, hotelError);
        errorCount++;
      }
    }

    console.log(`Hotel notification complete for contract ${contractId}: ${successCount} successful, ${errorCount} failed out of ${matchingHotels.length} total`);
    return { total: matchingHotels.length, successful: successCount, failed: errorCount };
  } catch (error) {
    console.error('Critical error in notifyMatchingHotels:', error);
    throw new Error(`Failed to notify hotels: ${error.message}`);
  }
}

// Send contract notification email
async function sendContractNotification(hotel, contractId, token) {
  if (!hotel || !hotel.email) {
    throw new Error('Hotel email is required for notification');
  }
  
  try {
    const contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const subject = `New Contract Opportunity - ${contract.title}`;
    const baseUrl = process.env.BASE_URL || 'http://localhost:${PORT}';
    const interestedUrl = `${baseUrl}/api/contracts/respond/${token}`;
    
    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">New Contract Opportunity</h2>
        
        <div style="background: #f8fafc; padding: 1.5rem; border-radius: 8px; margin: 1rem 0;">
          <h3>${contract.title}</h3>
          <p><strong>Description:</strong> ${contract.description || 'See full SOW for details'}</p>
          <p><strong>Duration:</strong> ${contract.start_date} to ${contract.end_date}</p>
          <p><strong>Room Count:</strong> ${contract.room_count} rooms</p>
          <p><strong>Max Contracted Rate:</strong> $${contract.max_contracted_rate}/night (30% off per diem)</p>
          <p><strong>Max Self-Pay Rate:</strong> $${contract.max_self_pay_rate}/night (10% off per diem)</p>
          ${contract.bidding_deadline ? `<p><strong>Bidding Deadline:</strong> ${contract.bidding_deadline}</p>` : ''}
        </div>

        <p>This contract matches your hotel's location and capabilities. If you're interested in bidding, please respond below:</p>

        <div style="margin: 2rem 0; text-align: center;">
          <a href="${interestedUrl}" 
             style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 0 10px;"
             onclick="fetch('${interestedUrl}', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({response: 'interested'})}).then(() => window.location.href='/hotel-login.html')">
            I'm Interested
          </a>
          
          <a href="${interestedUrl}" 
             style="background: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 0 10px;"
             onclick="fetch('${interestedUrl}', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({response: 'not_interested'})})">
            Not Interested
          </a>
        </div>

        <p style="font-size: 0.875rem; color: #6b7280;">
          If you're interested, you'll be directed to log into your hotel portal to view the full Statement of Work and submit your competitive bid.
        </p>

        <hr style="margin: 2rem 0;">
        <p style="font-size: 0.875rem; color: #6b7280;">
          This email was sent to registered hotels in the FEDEVENT network. 
          <br>FEDEVENT - A service of CREATA Global Event Agency LLC
        </p>
      </div>
    `;

    await sendMail({
      to: hotel.email,
      subject,
      html
    });
    
    console.log(`Contract notification sent successfully to ${hotel.name} at ${hotel.email}`);

  } catch (error) {
    console.error(`Failed to send contract notification to ${hotel.name} (${hotel.email}):`, error);
    throw error; // Re-throw to allow caller to handle
  }
}

const DEV_AUTH = String(process.env.DEV_AUTH).toLowerCase() === 'true';
const SIGNUP_DISABLED = String(process.env.SIGNUP_DISABLED).toLowerCase() === 'true';

app.post('/api/signup', (_req, res) => {
  if (SIGNUP_DISABLED) return fail(res, 501, 'Signup disabled');
  return ok(res, { devVerifyUrl: '/dev-verify/example' });
});
app.post('/api/signin', (req, res) => {
  if (SIGNUP_DISABLED) return fail(res, 501, 'Signin disabled');
  const { user = 'guest' } = req.body || {};
  return ok(res, { user: { id: 1, username: user } });
});
// Simple PDF generator using minimal canvas drawing via PDF syntax
function generateAgreementPdfBytes(opts) {
  const {
    hotelName = '',
    repName = '',
    title = '',
    email = '',
    effective = '',
    version = '1.0',
    signaturePngBytes = null
  } = opts || {};

  // Very small, minimalist PDF with one page
  // We'll embed a PNG signature if provided. For simplicity and reliability,
  // we will render text only if signature isn't embedded.
  const lines = [];
  const push = (s) => lines.push(s + '\n');
  push('%PDF-1.4');
  const objects = [];
  const addObj = (s) => { objects.push(s); return objects.length; };

  // Fonts
  const fontObjId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // Helper function to escape PDF text strings
  const escapePdfText = (str) => {
    if (!str) return '';
    return str.toString()
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
  };

  // Content stream (simple text)
  const text = [
    'BT',
    '/F1 12 Tf',
    '72 760 Td',
    `(${escapePdfText(`CREATA Hotel Partner Terms of Participation - v${version}`)}) Tj`,
    'T*',
    `(${escapePdfText(`Hotel: ${hotelName}`)}) Tj`,
    'T*',
    `(${escapePdfText(`Representative: ${repName}`)}) Tj`,
    'T*',
    `(${escapePdfText(`Title: ${title}`)}) Tj`,
    'T*',
    `(${escapePdfText(`Email: ${email}`)}) Tj`,
    'T*',
    `(${escapePdfText(`Effective: ${effective}`)}) Tj`,
    'T*',
    `(${escapePdfText('By signing electronically, you agree to the Terms shown on the website.')}) Tj`,
    'ET'
  ].join('\n');
  const stream = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  const contentsId = addObj(stream);

  // Pages (need to be defined before page)
  const pagesId = addObj(`<< /Type /Pages /Kids [] /Count 1 >>`);

  // Page
  const pageId = addObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /Contents ${contentsId} 0 R >>`);

  // Update pages to reference the page
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`;

  // Catalog
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Assemble xref
  let offset = '%PDF-1.4\n'.length;
  const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  const out = ['%PDF-1.4\n'];
  for (let i = 0; i < objects.length; i++) {
    const header = `${i + 1} 0 obj\n`;
    out.push(header);
    xref.push(String(offset).padStart(10, '0') + ' 00000 n ');
    offset += header.length;
    out.push(objects[i] + '\nendobj\n');
    offset += objects[i].length + '\nendobj\n'.length;
  }
  out.push(xref.join('\n') + '\n');
  out.push('trailer\n');
  out.push(`<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`);
  out.push('startxref\n');
  out.push(String(offset) + '\n');
  out.push('%%EOF');
  return Buffer.from(out.join(''));
}

// Sign agreement endpoint: stores record and returns a simple PDF
app.post('/api/sign-agreement', async (req, res) => {
  try {
    const {
      consent,
      hotelName = '',
      repName = '',
      title = '',
      email = '',
      approverName = '',
      approverEmail = '',
      agreementVersion = '1.0',
      agreementEffective = '',
      signatureDataUrl = '',
      userAgent = ''
    } = req.body || {};

    if (!consent) return fail(res, 400, 'Consent required');
    if (!hotelName || !repName || !email) return fail(res, 400, 'Missing required fields');

    // Decode signature if present and save to uploads
    let signaturePath = null;
    if (signatureDataUrl && /^data:image\/.+;base64,/.test(signatureDataUrl)) {
      const base64 = signatureDataUrl.split(',')[1];
      const buf = Buffer.from(base64, 'base64');
      const dir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = `signature_${Date.now()}.png`;
      signaturePath = path.join(dir, file);
      fs.writeFileSync(signaturePath, buf);
    }

    // Store DB record
    const insert = db.prepare(`
      INSERT INTO signed_agreements (hotel_name, rep_name, title, email, agreement_version, agreement_effective, user_agent, ip_address, signature_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insert.run(
      hotelName,
      repName,
      title,
      email,
      agreementVersion,
      agreementEffective || new Date().toISOString().slice(0, 10),
      userAgent,
      (req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
      signaturePath
    );
    const agreementId = result.lastInsertRowid;

    // If approver provided, create approval record and email link
    if (approverEmail) {
      const token = (randomBytes(16).toString('hex'));
      db.prepare(`
        INSERT INTO agreement_approvals (agreement_id, approver_name, approver_email, token, status)
        VALUES (?, ?, ?, ?, 'pending')
      `).run(agreementId, approverName || '', approverEmail, token);

      // Send email if SMTP is configured
      try {
        await sendMail({
          to: approverEmail,
          subject: `Action required: Approve CREATA agreement for ${hotelName}`,
          html: `
            <p>Hello ${approverName || ''},</p>
            <p>${repName} signed the CREATA participation agreement on behalf of ${hotelName}. Please countersign to approve.</p>
            <p><a href="${process.env.BASE_URL || 'http://localhost:' + PORT}/approve-agreement.html?token=${token}">Click here to review and sign</a></p>
            <p>Thank you.</p>
          `
        });
      } catch (e) {
        console.warn('approver email skipped/failed:', e?.message || e);
      }
    }

    const pdf = generateAgreementPdfBytes({
      hotelName,
      repName,
      title,
      email,
      effective: agreementEffective || new Date().toISOString().slice(0, 10),
      version: agreementVersion
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="CREATA-Hotel-Participation.pdf"');
    return res.status(200).send(pdf);
  } catch (e) {
    console.error('sign-agreement error:', e);
    return fail(res, 500, 'Failed to sign agreement');
  }
});

// Approver: fetch info by token
app.get('/api/approver/agreement/:token', (req, res) => {
  try {
    const token = req.params.token;
    const row = db.prepare(`
      SELECT a.id as approval_id, a.status, a.approver_name, a.approver_email, s.hotel_name, s.rep_name, s.title, s.email
      FROM agreement_approvals a
      JOIN signed_agreements s ON s.id = a.agreement_id
      WHERE a.token = ?
    `).get(token);
    if (!row) return fail(res, 404, 'Invalid or expired token');
    return ok(res, { approval: row });
  } catch (e) {
    return fail(res, 500, 'Lookup failed');
  }
});

// Approver: countersign
app.post('/api/approver/agreement/:token/sign', (req, res) => {
  try {
    const token = req.params.token;
    const { signatureDataUrl = '' } = req.body || {};
    const approval = db.prepare(`SELECT * FROM agreement_approvals WHERE token = ?`).get(token);
    if (!approval) return fail(res, 404, 'Invalid token');
    if (approval.status === 'signed') return ok(res, { message: 'Already signed' });

    let signaturePath = null;
    if (signatureDataUrl && /^data:image\/.+;base64,/.test(signatureDataUrl)) {
      const base64 = signatureDataUrl.split(',')[1];
      const buf = Buffer.from(base64, 'base64');
      const dir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = `approver_sig_${Date.now()}.png`;
      signaturePath = path.join(dir, file);
      fs.writeFileSync(signaturePath, buf);
    }

    db.prepare(`
      UPDATE agreement_approvals
      SET status='signed', signed_at = datetime('now'), signature_path = ?
      WHERE id = ?
    `).run(signaturePath, approval.id);

    return ok(res, { message: 'Countersigned' });
  } catch (e) {
    return fail(res, 500, 'Countersign failed');
  }
});


// Autofill: DOCX, PDF (OCR), PPTX, Images
app.post('/api/autofill', upload.single('info_sheet'), async (req, res) => {
  try {
    if (!req.file) return fail(res, 400, 'No file uploaded');
    const name = req.file.originalname || '';
    const ext  = extOf(name);

    let text = '';
    if (ext === 'docx') {
      const { value } = await mammoth.extractRawText({ path: req.file.path });
      text = value || '';
    } else if (ext === 'pdf') {
      text = await ocrPdfText(req.file.path);
    } else if (['png','jpg','jpeg','webp','tif','tiff','bmp'].includes(ext)) {
      text = await ocrImageText(req.file.path);
    } else if (ext === 'pptx') {
      text = await pptxText(req.file.path);
    } else {
      return fail(res, 415, `Autofill supports DOCX, PDF, PPTX, and images. Got .${ext}.`);
    }

    const raw   = normalizeText(text);
    const facts = extractHotelFacts(raw);
    fixRoomHeuristics(facts);
    const fieldsKV = kvParse(raw);
    
    // Dynamic import of guessFields with fallback
    let fieldsGuess = {};
    try {
      const guessModule = await import("./guess-fields.js");
      fieldsGuess = guessModule.guessFields(raw);
    } catch (e) {
      console.warn('guess-fields.js not found, skipping guess fields');
    }
    
    const fields = { ...fieldsGuess, ...fieldsKV };
    if (facts.total_guestrooms) fields.total_guestrooms = String(facts.total_guestrooms);
    if (facts.total_meeting_space_sqft) fields.total_meeting_space_sqft = String(facts.total_meeting_space_sqft);
    if (!Object.keys(fieldsKV).length) {
      console.log('[autofill] no KV labels found; OCR preview:', raw.slice(0, 800));
    }

    return ok(res, {
      fields,
      facts,
      debugText: req.query.debug ? raw.slice(0, 12000) : undefined
    });
  } catch (e) {
    console.error('autofill error:', e);
    return fail(res, 500, 'Autofill failed', { detail: String(e.message || e) });
  }
});

// Submit: store JSON + files; require NET30 === "Yes"
app.post('/api/submit', upload.any(), async (req, res) => {
  try {
    const files = (req.files || []).map(f => ({
      field: f.fieldname,
      name: f.originalname,
      path: f.path,
      size: f.size,
      mime: f.mimetype
    }));

    const data = req.body || {};
    
    // Enhanced validation
    if ((data.accepts_net30 || '').toLowerCase() !== 'yes') {
      return fail(res, 400, 'NET30 is required to submit.');
    }
    
    if ((data.accepts_po || '').toLowerCase() !== 'yes') {
      return fail(res, 400, 'Purchase Order acceptance is required to submit.');
    }

    // Validate required fields
    const requiredFields = ['hotel_name', 'address', 'city', 'country'];
    const missingFields = requiredFields.filter(field => !data[field] || data[field].trim() === '');
    
    if (missingFields.length > 0) {
      return fail(res, 400, `Missing required fields: ${missingFields.join(', ')}`);
    }

    // Check for duplicate hotel names
    const existingHotel = db.prepare(`SELECT id FROM hotels WHERE LOWER(name) = LOWER(?)`).get(data.hotel_name);
    if (existingHotel) {
      return fail(res, 400, 'A hotel with this name already exists. Please contact support if this is an error.');
    }

    const name    = data.hotel_name || '';
    const email   = data.sales_director_email || data.ar_email || '';
    const city    = data.city || '';
    const state   = data.state || '';
    const country = data.country || '';
    
    // Create hotel record first
    const hotelResult = db.prepare(`
      INSERT INTO hotels (name, email, city, state, country, tags, created_at) 
      VALUES (?,?,?,?,?,?, datetime('now'))
    `).run(name, email, city, state, country, 'reg-form');
    const profileHotelId = hotelResult.lastInsertRowid;
    
    // Store in hotel_profiles table with enhanced data structure
    const profileData = {
      ...data,
      submitted_at: new Date().toISOString(),
      form_version: 'v2',
      validation_status: 'passed'
    };
    
    db.prepare(`
      INSERT INTO hotel_profiles (hotel_id, profile_data, files_data, status, submitted_at, updated_at) 
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(profileHotelId, JSON.stringify(profileData), JSON.stringify(files), 'pending');

    // Update user profile with primary contact information if user is logged in
    const sessionId = req.headers.authorization?.replace('Bearer ', '');
    if (sessionId) {
      try {
        const sessionUser = preparedQueries.getSessionUser.get(sessionId);
        if (sessionUser) {
          // Extract primary contact information (use first contact as primary)
          const primaryContactName = data['sign_contacts[0][name]'] || '';
          const primaryContactTitle = data['sign_contacts[0][title]'] || '';
          const primaryContactPhone = data['sign_contacts[0][phone]'] || '';
          
          // Parse name into first and last name
          const nameParts = primaryContactName.trim().split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';
          
          // Update user profile with primary contact information
          db.prepare(`
            UPDATE users 
            SET first_name = ?, last_name = ?, phone = ?, job_title = ?, hotel_id = ?
            WHERE id = ?
          `).run(firstName, lastName, primaryContactPhone, primaryContactTitle, profileHotelId, sessionUser.id);
          
          console.log(`Updated user profile for user ${sessionUser.id} with primary contact info`);
        }
      } catch (userUpdateError) {
        console.error('Failed to update user profile:', userUpdateError);
        // Don't fail the entire submission if user update fails
      }
    }

    // Send notification email
    if (process.env.NOTIFY_TO && process.env.SMTP_HOST) {
      const subject = `New hotel profile #${profileHotelId} – ${name || '(unnamed)'}`;
      const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial; max-width:600px; margin:0 auto;">
          <h2 style="color:#1f2937; margin-top:0;">New Hotel Profile Submitted</h2>
          
          <div style="background:#f9fafb; padding:1rem; border-radius:8px; margin:1rem 0;">
            <h3 style="color:#374151; margin-top:0;">Hotel Information</h3>
            <p><strong>ID:</strong> ${profileHotelId}</p>
            <p><strong>Hotel:</strong> ${name || '(unnamed)'}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Location:</strong> ${city}, ${state}, ${country}</p>
          </div>
          
          <div style="background:#f0f9ff; padding:1rem; border-radius:8px; margin:1rem 0;">
            <h3 style="color:#0369a1; margin-top:0;">Compliance Status</h3>
            <p><strong>NET30:</strong> ${data.accepts_net30 || 'Not specified'}</p>
            <p><strong>PO:</strong> ${data.accepts_po || 'Not specified'}</p>
            <p><strong>AAA Rated:</strong> ${data.is_aaa_rated || 'Not specified'}</p>
            ${data.is_aaa_rated === 'Yes' ? `<p><strong>AAA Rating:</strong> ${data.aaa_diamond_rating || 'Not specified'}</p>` : ''}
          </div>
          
          <div style="background:#f0fdf4; padding:1rem; border-radius:8px; margin:1rem 0;">
            <h3 style="color:#166534; margin-top:0;">Contact Information</h3>
            <p><strong>Primary Contact:</strong> ${data.primary_contact_name || 'Not provided'} (${data.primary_contact_email || 'No email'})</p>
            ${data.csm_name ? `<p><strong>CSM:</strong> ${data.csm_name} (${data.csm_email || 'No email'})</p>` : ''}
          </div>
          
          <div style="margin:2rem 0;">
            <a href="${process.env.BASE_URL || 'http://localhost:${PORT}'}/admin-dashboard.html" 
               style="background:#1f2937; color:white; padding:0.75rem 1.5rem; text-decoration:none; border-radius:6px; display:inline-block;">
              View in Admin Dashboard
            </a>
          </div>
        </div>
      `;
      try {
        await sendMail({
          to: process.env.NOTIFY_TO,
          subject,
          html,
          attachments: files.slice(0,8).map(f => ({ filename: path.basename(f.path), path: f.path }))
        });
        console.log(`Notification email sent for hotel profile #${profileHotelId}`);
      } catch (mailErr) {
        console.warn('notify email failed (continuing):', mailErr?.message || mailErr);
      }
    }

    return ok(res, { 
      hotelId: profileHotelId,
      message: 'Hotel profile submitted successfully',
      status: 'pending_review'
    });
  } catch (e) {
    console.error('submit error:', e);
    return fail(res, 500, 'Submit failed: ' + (e.message || 'Unknown error'));
  }
});

// ---------- Hotel Registration Draft System ----------

// Save hotel registration draft
app.post('/api/draft/save', (req, res) => {
  try {
    const { userId, formData, currentPage } = req.body;
    const sessionId = req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionId) {
      return fail(res, 401, 'Session required');
    }
    
    // Get user ID from session if not provided
    let actualUserId = userId;
    if (!actualUserId) {
      const session = db.prepare(`SELECT user_id FROM sessions WHERE id = ?`).get(sessionId);
      if (!session) {
        return fail(res, 401, 'Invalid session');
      }
      actualUserId = session.user_id;
    }
    
    if (!formData) {
      return fail(res, 400, 'Form data is required');
    }
    
    // Check if draft already exists
    const existingDraft = db.prepare(`SELECT id FROM hotel_drafts WHERE user_id = ?`).get(actualUserId);
    
    if (existingDraft) {
      // Update existing draft
      db.prepare(`
        UPDATE hotel_drafts 
        SET form_data = ?, current_page = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(JSON.stringify(formData), currentPage || 0, actualUserId);
    } else {
      // Create new draft
      db.prepare(`
        INSERT INTO hotel_drafts (user_id, form_data, current_page, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).run(actualUserId, JSON.stringify(formData), currentPage || 0);
    }
    
    return ok(res, { message: 'Draft saved successfully' });
  } catch (error) {
    console.error('Save draft error:', error);
    return fail(res, 500, 'Failed to save draft');
  }
});

// Load hotel registration draft
app.get('/api/draft/load/:userId?', (req, res) => {
  try {
    const { userId } = req.params;
    const sessionId = req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionId) {
      return fail(res, 401, 'Session required');
    }
    
    // Get user ID from session if not provided in URL
    let actualUserId = userId;
    if (!actualUserId) {
      const session = db.prepare(`SELECT user_id FROM sessions WHERE id = ?`).get(sessionId);
      if (!session) {
        return fail(res, 401, 'Invalid session');
      }
      actualUserId = session.user_id;
    }
    
    const draft = db.prepare(`
      SELECT form_data, current_page, updated_at 
      FROM hotel_drafts 
      WHERE user_id = ?
    `).get(actualUserId);
    
    if (!draft) {
      return ok(res, { draft: null });
    }
    
    return ok(res, {
      draft: {
        formData: JSON.parse(draft.form_data),
        currentPage: draft.current_page,
        updatedAt: draft.updated_at
      }
    });
  } catch (error) {
    console.error('Load draft error:', error);
    return fail(res, 500, 'Failed to load draft');
  }
});

// Delete hotel registration draft
app.delete('/api/draft/delete/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = db.prepare(`DELETE FROM hotel_drafts WHERE user_id = ?`).run(userId);
    
    return ok(res, { message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('Delete draft error:', error);
    return fail(res, 500, 'Failed to delete draft');
  }
});

// ---------- Bulk Hotel Actions ----------

// Bulk mark hotels as priority
app.post('/api/admin/hotels/bulk-priority', requireAuth, requireAdmin, (req, res) => {
  try {
    const { hotelIds, isPriority } = req.body;
    
    if (!Array.isArray(hotelIds) || hotelIds.length === 0) {
      return fail(res, 400, 'Hotel IDs array is required');
    }
    
    if (typeof isPriority !== 'boolean') {
      return fail(res, 400, 'isPriority must be a boolean value');
    }
    
    // Update priority status for all hotels
    const placeholders = hotelIds.map(() => '?').join(',');
    const updateStmt = db.prepare(`
      UPDATE hotels 
      SET is_priority = ?
      WHERE id IN (${placeholders})
    `);
    
    const result = updateStmt.run(isPriority ? 1 : 0, ...hotelIds);
    
    return ok(res, { 
      message: `${result.changes} hotels updated successfully`,
      updatedCount: result.changes,
      isPriority: isPriority
    });
  } catch (error) {
    console.error('Bulk priority update error:', error);
    return fail(res, 500, 'Failed to update hotel priority status');
  }
});

// Bulk edit hotels
app.put('/api/admin/hotels/bulk-edit', requireAuth, requireAdmin, (req, res) => {
  try {
    const { hotelIds, updates } = req.body;
    
    if (!Array.isArray(hotelIds) || hotelIds.length === 0) {
      return fail(res, 400, 'Hotel IDs array is required');
    }
    
    if (!updates || typeof updates !== 'object') {
      return fail(res, 400, 'Updates object is required');
    }
    
    // Build dynamic update query based on provided fields
    const allowedFields = [
      'name', 'email', 'phone', 'city', 'state', 'country', 
      'brand', 'chain', 'total_rooms', 'meeting_spaces',
      'accepts_net30', 'accepts_per_diem_discount', 'accepts_no_direct_bill',
      'is_priority', 'is_active'
    ];
    
    const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fieldsToUpdate.length === 0) {
      return fail(res, 400, 'No valid fields provided for update');
    }
    
    // Create SET clause for update query
    const setClause = fieldsToUpdate.map(field => `${field} = ?`).join(', ');
    const values = fieldsToUpdate.map(field => {
      // Handle boolean values
      if (typeof updates[field] === 'boolean') {
        return updates[field] ? 1 : 0;
      }
      return updates[field];
    });
    
    // Add hotel IDs to the end of values array
    const placeholders = hotelIds.map(() => '?').join(',');
    const allValues = [...values, ...hotelIds];
    
    const updateStmt = db.prepare(`
      UPDATE hotels 
      SET ${setClause}
      WHERE id IN (${placeholders})
    `);
    
    const result = updateStmt.run(...allValues);
    
    return ok(res, { 
      message: `${result.changes} hotels updated successfully`,
      updatedCount: result.changes,
      updatedFields: fieldsToUpdate
    });
  } catch (error) {
    console.error('Bulk edit hotels error:', error);
    return fail(res, 500, 'Failed to update hotels');
  }
});
// Bulk send message to hotels
app.post('/api/admin/hotels/bulk-message', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { hotelIds, subject, message } = req.body;
    
    if (!Array.isArray(hotelIds) || hotelIds.length === 0) {
      return fail(res, 400, 'Hotel IDs array is required');
    }
    
    if (!subject || !message) {
      return fail(res, 400, 'Subject and message are required');
    }
    
    // Get hotel details for email sending
    const placeholders = hotelIds.map(() => '?').join(',');
    const hotels = db.prepare(`
      SELECT id, name, email, city, state, country 
      FROM hotels 
      WHERE id IN (${placeholders})
    `).all(...hotelIds);
    
    // Send emails to each hotel
    let successCount = 0;
    let failureCount = 0;
    
            for (const hotel of hotels) {
              if (hotel.email) {
                try {
                  const html = `
                    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                      <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                        <p><strong>To:</strong> ${hotel.name || 'Hotel'} (${hotel.city || ''}, ${hotel.state || ''})</p>
                        <p><strong>From:</strong> FEDEVENT Admin Team</p>
                        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                      </div>
                      
                      <div style="background: #ffffff; padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <div style="line-height: 1.6; color: #4b5563;">
                          ${message.replace(/\n/g, '<br>')}
                        </div>
                      </div>
                      
                      <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.875rem; color: #6b7280;">
                        <p>This message was sent from the FEDEVENT Admin Dashboard.</p>
                        <p>You can reply directly to this email to contact our admin team.</p>
                      </div>
                    </div>
                  `;
                  
                  await sendMail({
                    to: hotel.email,
                    subject: subject,
                    html: html,
                    from: 'admin@fedevent.com',
                    replyTo: 'admin@fedevent.com'
                  });
          
          successCount++;
        } catch (emailError) {
          console.error(`Failed to send email to ${hotel.email}:`, emailError);
          failureCount++;
        }
      } else {
        failureCount++;
      }
    }
    
    return ok(res, { 
      message: `Bulk message sent to ${hotels.length} hotels`,
      successCount: successCount,
      failureCount: failureCount,
      totalSent: hotels.length
    });
  } catch (error) {
    console.error('Bulk message error:', error);
    return fail(res, 500, 'Failed to send bulk messages');
  }
});
// ---------- Team Member Invitation System ----------

// Send team member invitation
app.post('/api/team/invite', requireAuth, async (req, res) => {
  try {
    const { email, firstName, lastName, jobTitle, permissions } = req.body;
    const userId = req.user.id;
    
    // Get user's hotel
    const user = db.prepare(`SELECT hotel_id FROM users WHERE id = ?`).get(userId);
    if (!user || !user.hotel_id) {
      return fail(res, 400, 'User must be associated with a hotel to invite team members');
    }
    
    // Check if email already exists as user
    const existingUser = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existingUser) {
      return fail(res, 400, 'This email is already registered. User can be added directly to your team.');
    }
    
    // Check if invitation already exists and is pending
    const existingInvite = db.prepare(`
      SELECT id FROM team_invitations 
      WHERE email = ? AND hotel_id = ? AND status = 'pending'
    `).get(email, user.hotel_id);
    
    if (existingInvite) {
      return fail(res, 400, 'An invitation has already been sent to this email address.');
    }
    
    // Generate invitation token
    const invitationToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    
    // Create invitation
    const result = db.prepare(`
      INSERT INTO team_invitations (hotel_id, inviter_user_id, email, first_name, last_name, job_title, permissions, invitation_token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.hotel_id, userId, email, firstName || '', lastName || '', jobTitle || '', JSON.stringify(permissions || {}), invitationToken, expiresAt);
    
    // Send invitation email
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const inviterInfo = db.prepare(`
        SELECT u.first_name, u.email, h.name as hotel_name 
        FROM users u 
        LEFT JOIN hotels h ON u.hotel_id = h.id 
        WHERE u.id = ?
      `).get(userId);
      
      const inviteSubject = `You're invited to join ${inviterInfo.hotel_name || 'a hotel'} team on FEDEVENT`;
      const inviteHtml = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial; max-width:600px; margin:0 auto;">
          <div style="background:#1f2937; padding:2rem; text-align:center;">
            <h1 style="color:white; margin:0;">🎉 Team Invitation</h1>
            <p style="color:#d1d5db; margin:0.5rem 0 0;">You've been invited to join FEDEVENT</p>
          </div>
          
          <div style="padding:2rem; background:#ffffff;">
            <h2 style="color:#1f2937; margin-top:0;">Hello${firstName ? ' ' + firstName : ''}!</h2>
            
            <p><strong>${inviterInfo.first_name || inviterInfo.email}</strong> has invited you to join the <strong>${inviterInfo.hotel_name || 'hotel'}</strong> team on FEDEVENT.</p>
            
            <div style="margin:2rem 0; padding:1rem; background:#f3f4f6; border-radius:8px;">
              <p style="margin:0; color:#374151;"><strong>Invitation Details:</strong></p>
              <p style="margin:0.5rem 0 0; color:#6b7280;">Hotel: ${inviterInfo.hotel_name || 'Hotel Team'}</p>
              <p style="margin:0.5rem 0 0; color:#6b7280;">Role: ${jobTitle || 'Team Member'}</p>
              <p style="margin:0.5rem 0 0; color:#6b7280;">Invited by: ${inviterInfo.first_name || inviterInfo.email}</p>
            </div>
            
            <div style="text-align:center; margin:2rem 0;">
              <a href="https://fedevent.com/team-signup.html?token=${invitationToken}" 
                 style="background:#3b82f6; color:white; padding:12px 24px; text-decoration:none; border-radius:8px; display:inline-block;">
                Accept Invitation & Create Account
              </a>
            </div>
            
            <p style="color:#6b7280; font-size:0.875rem;">
              This invitation will expire in 7 days. If you have any questions, contact ${inviterInfo.email}.
            </p>
          </div>
          
          <div style="background:#f9fafb; padding:1rem; text-align:center; color:#6b7280; font-size:0.875rem;">
            <p style="margin:0;">
              FEDEVENT - Professional Government Event Solutions
            </p>
          </div>
        </div>
      `;
      
      try {
        await sendMail({
          to: email,
          subject: inviteSubject,
          html: inviteHtml
        });
      } catch (emailError) {
        console.warn('Invitation email failed:', emailError?.message || emailError);
      }
    }
    
    return ok(res, { 
      message: 'Team member invitation sent successfully',
      invitationId: result.lastInsertRowid 
    });
    
  } catch (error) {
    console.error('Team invitation error:', error);
    return fail(res, 500, 'Failed to send team invitation');
  }
});

// Accept team invitation and create account
app.post('/api/team/accept-invitation', async (req, res) => {
  try {
    const { token, email, password, username, firstName, lastName } = req.body;
    
    if (!token || !email || !password || !username) {
      return fail(res, 400, 'Missing required fields');
    }
    
    // Find and validate invitation
    const invitation = db.prepare(`
      SELECT * FROM team_invitations 
      WHERE invitation_token = ? AND email = ? AND status = 'pending' AND expires_at > datetime('now')
    `).get(token, email);
    
    if (!invitation) {
      return fail(res, 400, 'Invalid or expired invitation');
    }
    
    // Check if email is already registered
    const existingUser = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existingUser) {
      return fail(res, 400, 'This email is already registered');
    }
    
    // Create user account
    const passwordHash = hashPassword(password);
    const userResult = db.prepare(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, hotel_id)
      VALUES (?, ?, ?, ?, 'hotel', ?)
    `).run(email, passwordHash, firstName || username, lastName || '', invitation.hotel_id);
    
    // Update invitation status
    db.prepare(`
      UPDATE team_invitations 
      SET status = 'accepted', accepted_at = datetime('now') 
      WHERE id = ?
    `).run(invitation.id);
    
    // Create session
    const sessionId = createSession(userResult.lastInsertRowid);
    
    return ok(res, {
      sessionId,
      user: {
        id: userResult.lastInsertRowid,
        email,
        role: 'hotel',
        username: firstName || username,
        hotel_id: invitation.hotel_id
      },
      message: 'Account created and invitation accepted successfully!'
    });
    
  } catch (error) {
    console.error('Accept invitation error:', error);
    return fail(res, 500, 'Failed to accept invitation');
  }
});

// Update user profile
app.post('/api/profile/update', requireAuth, async (req, res) => {
  try {
    const { hotelName, username, propertyCode, firstName, lastName } = req.body;
    const userId = req.user.id;
    
    // Update user information
    if (username || firstName || lastName) {
      const userUpdate = db.prepare(`
        UPDATE users 
        SET first_name = COALESCE(?, first_name), 
            last_name = COALESCE(?, last_name)
        WHERE id = ?
      `);
      userUpdate.run(firstName || username, lastName, userId);
    }
    
    // Update hotel information if user has a hotel
    if (hotelName || propertyCode) {
      const user = db.prepare(`SELECT hotel_id FROM users WHERE id = ?`).get(userId);
      if (user && user.hotel_id) {
        const hotelUpdate = db.prepare(`
          UPDATE hotels 
          SET name = COALESCE(?, name)
          WHERE id = ?
        `);
        hotelUpdate.run(hotelName, user.hotel_id);
        
        // Store property code in hotel tags for now
        if (propertyCode) {
          const tagUpdate = db.prepare(`
            UPDATE hotels 
            SET tags = COALESCE(tags || ',', '') || 'property_code:' || ?
            WHERE id = ?
          `);
          tagUpdate.run(propertyCode, user.hotel_id);
        }
      }
    }
    
    return ok(res, { message: 'Profile updated successfully' });
    
  } catch (error) {
    console.error('Profile update error:', error);
    return fail(res, 500, 'Failed to update profile');
  }
});

// Get bidding data for dashboard
app.get('/api/bidding/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's hotel
    const user = db.prepare(`SELECT hotel_id FROM users WHERE id = ?`).get(userId);
    console.log('Bidding status - User:', userId, 'Hotel ID:', user?.hotel_id);
    if (!user || !user.hotel_id) {
      return fail(res, 400, 'User must be associated with a hotel');
    }
    
    // Get active auctions with bids from this hotel
    const auctions = db.prepare(`
      SELECT 
        la.id,
        la.title,
        la.location_city,
        la.location_state,
        la.bidding_end,
        la.base_rate,
        ab.bid_amount,
        ab.status as bid_status,
        ab.submitted_at,
        (SELECT MIN(bid_amount) FROM auction_bids WHERE auction_id = la.id AND status = 'active') as leading_bid,
        (SELECT COUNT(*) FROM auction_bids WHERE auction_id = la.id AND status = 'active') as total_bids
      FROM live_auctions la
      LEFT JOIN auction_bids ab ON la.id = ab.auction_id AND ab.hotel_id = ? AND ab.status = 'active'
      WHERE la.status = 'active'
      ORDER BY la.bidding_end ASC
    `).all(user.hotel_id);
    
    console.log('Raw auction data:', auctions);
    
    // Determine LEAD/LAG status for each auction
    const biddingStatus = auctions.map(auction => {
      let status = 'not_bidding';
      let position = null;
      
      if (auction.bid_amount) {
        // For government contracts, LOWER bid usually wins (cost-effective)
        if (auction.bid_amount === auction.leading_bid) {
          status = 'lead';
          position = 1;
        } else if (auction.bid_amount > auction.leading_bid) {
          status = 'lag';
          position = 2;
        } else {
          status = 'lead'; // Your bid is lower than leading (which is good for government contracts)
          position = 1;
        }
      }
      
      return {
        id: auction.id,
        title: auction.title,
        location: `${auction.location_city}, ${auction.location_state}`,
        deadline: auction.bidding_end,
        yourBid: auction.bid_amount,
        leadingBid: auction.leading_bid,
        totalBids: auction.total_bids,
        status: status,
        position: position
      };
    });
    
    return ok(res, { biddingStatus });
    
  } catch (error) {
    console.error('Bidding status error:', error);
    return fail(res, 500, 'Failed to get bidding status');
  }
});

// ---------- start ----------
// Note: Server start moved to end of file
// ---- OCR fixups for meeting room data ----
function fixRoomHeuristics(facts) {
  if (!facts || !Array.isArray(facts.meeting_rooms)) return facts;

  for (const r of facts.meeting_rooms) {
    // 1) If ceiling equals sqft and sqft looks like area, drop ceiling
    if (r.ceiling_ft != null && r.sqft != null && r.ceiling_ft === r.sqft && r.sqft > 400) {
      r.ceiling_ft = null;
    }

    // 2) OCR often loses the decimal: 8.4 → 84, 9.5 → 95, 13.1 → 131
    if (typeof r.ceiling_ft === 'number' && r.ceiling_ft >= 30 && r.ceiling_ft <= 150) {
      r.ceiling_ft = Math.round(r.ceiling_ft) / 10;
    }

    // 3) If ceiling is huge (>=60) but sqft is tiny (<200), ceiling was likely misread; drop it
    if (typeof r.ceiling_ft === 'number' && r.ceiling_ft >= 60 && typeof r.sqft === 'number' && r.sqft < 200) {
      if (r.ceiling_ft > 200) r.ceiling_ft = null;
    }

    // 4) Final sanity: if ceiling still > 40 ft, drop it
    if (typeof r.ceiling_ft === 'number' && r.ceiling_ft > 40) {
      r.ceiling_ft = null;
    }
  }
  return facts;
}

// --- Field post-processing (city fix for DC quadrant prefixes) ---
function normalizeFields(fields) {
  try {
    if (!fields || typeof fields !== 'object') return fields;

    // normalize whitespace for all string fields
    for (const k of Object.keys(fields)) {
      if (typeof fields[k] === 'string') {
        fields[k] = fields[k].replace(/\s+/g, ' ').trim();
      }
    }

    // If city came in like "SW Washington" / "NW Washington" / etc, fix to "Washington"
    if (fields.city && /^([NSEW](?:E|W)?)\s+Washington\b/i.test(fields.city)) {
      fields.city = 'Washington';
      // If the state is missing or funky, ensure DC is set
      if (!fields.state || !/^[A-Z]{2}$/.test(fields.state)) {
        fields.state = 'DC';
      }
    }

    // Also catch "Washington DC" placed fully in city (rare)
    if (fields.city && /^Washington\s+DC$/i.test(fields.city)) {
      fields.city = 'Washington';
      fields.state = fields.state || 'DC';
    }

    return fields;
  } catch {
    return fields;
  }
}

function normalizeSowText(text = '') {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildRequirementsTextFromSow(text, firstClinIndex) {
  let relevant = text;
  if (Number.isInteger(firstClinIndex) && firstClinIndex >= 0) {
    relevant = text.slice(0, firstClinIndex).trim();
  }
  if (!relevant || relevant.length < 60) {
    const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    relevant = paragraphs.slice(0, 3).join('\n\n');
  }
  if (relevant.length > 1500) {
    relevant = relevant.slice(0, 1500).trim() + '...';
  }
  return relevant;
}

function buildSummaryFromSow(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.slice(0, 3).join(' ');
  return summary.length > 600 ? summary.slice(0, 600).trim() + '...' : summary;
}

function scrubSensitiveContent(text = '') {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted]');
  cleaned = cleaned.replace(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, '[redacted]');
  cleaned = cleaned.replace(/\$\s?[\d,]+(?:\.\d{2})?/g, '[redacted]');
  cleaned = cleaned.replace(/[\d,]+(?:\.\d{2})?\s?(?:USD|usd|Dollars|dollars)/g, '[redacted]');
  cleaned = cleaned.replace(/(?<=Rate:?\s*)[\d,]+(?:\.\d{2})?/gi, '[redacted]');
  return cleaned.replace(/\s+\[redacted\]/g, ' [redacted]').replace(/\s+/g, ' ').trim();
}

function parseClinsFromSow(text) {
  const clins = [];
  if (!text) return clins;

  const pattern = /(Contract\s+Line\s+Item\s+Number|CLIN)\s*[-#:]*\s*([0-9]{4}[A-Z0-9]*)/ig;
  const matches = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({ index: match.index, number: match[2].toUpperCase() });
  }

  if (!matches.length) {
    return clins;
  }

  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const chunk = text.slice(start, end).trim();
    const lines = chunk.split(/\n/).map(l => l.trim()).filter(Boolean);
    const header = lines.shift() || '';
    let title = header.replace(/^(?:Contract\s+Line\s+Item\s+Number|CLIN)\s*[-#:]*\s*[0-9]{4}[A-Z0-9]*/i, '').replace(/^[-–—:\s]+/, '').trim();
    let description = lines.join(' ').trim();

    if (!description) {
      description = title;
    }
    if (!title) {
      title = description ? description.slice(0, 120).trim() : `Requirement ${matches[i].number}`;
    }
    if (description && description.length > 600) {
      description = description.slice(0, 600).trim() + '...';
    }

    clins.push({
      clin_number: matches[i].number,
      title: title.trim() || `Requirement ${matches[i].number}`,
      description: description || title
    });
  }

  return clins;
}

async function extractPlainTextFromSow(filePath, originalName = '', mimeType = '') {
  const ext = (originalName || '').toLowerCase().split('.').pop() || '';
  const warnings = [];
  let text = '';

  try {
    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || '';
    } else if (ext === 'pdf') {
      try {
        text = await ocrPdfText(filePath);
      } catch (error) {
        warnings.push(`PDF parsing warning: ${error.message || error}`);
        text = '';
      }
    } else if (ext === 'txt' || mimeType === 'text/plain') {
      text = await fsp.readFile(filePath, 'utf8');
    } else {
      try {
        text = await fsp.readFile(filePath, 'utf8');
        warnings.push(`Treated ${originalName} as plain text. Review extracted content carefully.`);
      } catch {
        warnings.push(`Unsupported SOW format (${ext || mimeType}).`);
      }
    }
  } catch (error) {
    warnings.push(`Extraction error: ${error.message || error}`);
    text = '';
  }

  return { text: normalizeSowText(text), warnings };
}

async function parseSowDocument(filePath, originalName, mimeType) {
  const { text, warnings } = await extractPlainTextFromSow(filePath, originalName, mimeType);
  if (!text) {
    return { requirements: '', summary: '', clins: [], warnings };
  }

  const clins = parseClinsFromSow(text);
  const firstClinMatch = text.match(/(Contract\s+Line\s+Item\s+Number|CLIN)\s*[-#:]*\s*[0-9]{4}[A-Z0-9]*/i);
  const firstClinIndex = firstClinMatch ? firstClinMatch.index : -1;
  const requirements = scrubSensitiveContent(buildRequirementsTextFromSow(text, firstClinIndex));
  const summary = scrubSensitiveContent(buildSummaryFromSow(requirements || text));
  const sanitizedClins = clins.map((clin, idx) => ({
    clin_number: clin.clin_number,
    title: scrubSensitiveContent(clin.title) || `Requirement ${String(idx + 1).padStart(4, '0')}`,
    description: scrubSensitiveContent(clin.description)
  }));

  return { requirements, summary, clins: sanitizedClins, warnings };
}
// SOW Document Processing API
app.post('/api/process-sow', upload.single('sow_document'), async (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No document uploaded');
    }
    
    console.log('Processing SOW document:', req.file.originalname);
    
    // Extract text from document based on file type
    let extractedText = '';
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    if (fileExtension === '.pdf') {
      // For PDF files, try OCR if available, otherwise provide fallback
      try {
        if (hasBin('ocrmypdf') || (hasBin('pdftoppm') && hasBin('tesseract'))) {
          extractedText = await ocrPdfText(req.file.path);
        } else {
          extractedText = 'PDF OCR tools not available on this system. Please extract text manually and enter in the SOW Summary field.';
        }
      } catch (error) {
        console.error('PDF OCR failed:', error);
        extractedText = 'PDF processing encountered an error. Please extract the key information from your PDF and enter it manually in the SOW Summary field.';
      }
    } else if (fileExtension === '.docx') {
      // For Word .docx documents, use mammoth
      try {
        const result = await mammoth.extractRawText({ path: req.file.path });
        extractedText = result.value || '';
        if (!extractedText.trim()) {
          extractedText = 'No text content found in the Word document. Please check the document and enter summary manually.';
        }
      } catch (error) {
        console.error('Word .docx processing failed:', error);
        extractedText = 'Unable to process Word .docx document. Please copy the text from your document and enter it manually.';
      }
    } else if (fileExtension === '.doc') {
      // For legacy .doc files, provide a helpful message
      extractedText = 'Legacy .doc format detected. Please save your document as .docx format and try again, or enter the summary manually.';
    } else {
      extractedText = 'Unsupported file format. Please upload PDF or Word (.docx) documents only.';
    }
    
    // Generate a summary from extracted text
    let summary = '';
    if (extractedText && extractedText.length > 50 && !extractedText.includes('unable to') && !extractedText.includes('error')) {
      try {
        // Clean the text first
        let cleanText = extractedText.replace(/\s+/g, ' ').trim();
        
        // Split into sentences
        const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 15);
        
        // Key terms to look for in SOW documents
        const keyTerms = [
          'scope', 'objective', 'requirement', 'deliverable', 'timeline', 'location', 'attendee',
          'event', 'conference', 'training', 'meeting', 'workshop', 'briefing', 'mission',
          'purpose', 'goal', 'outcome', 'schedule', 'venue', 'logistics', 'support'
        ];
        
        // Find sentences containing key terms
        const keySentences = sentences.filter(sentence => {
          const lowerSentence = sentence.toLowerCase();
          return keyTerms.some(term => lowerSentence.includes(term)) && 
                 sentence.length > 30 && sentence.length < 200;
        }).slice(0, 4);
        
        if (keySentences.length > 0) {
          summary = keySentences.join('. ').trim();
          if (!summary.endsWith('.')) summary += '.';
        } else {
          // Fallback: take first meaningful paragraph
          const paragraphs = cleanText.split(/\n\s*\n/).filter(p => p.trim().length > 50);
          if (paragraphs.length > 0) {
            summary = paragraphs[0].substring(0, 500);
            if (!summary.endsWith('.')) summary += '...';
          } else {
            summary = sentences.slice(0, 3).join('. ').trim() + '.';
          }
        }
        
        // Final cleanup
        summary = summary.replace(/\s+/g, ' ').trim();
        if (summary.length > 800) {
          summary = summary.substring(0, 800) + '...';
        }
        
        // Add a note about manual review
        summary += '\n\n[Auto-generated summary from uploaded document. Please review and edit as needed.]';
        
      } catch (summaryError) {
        console.error('Summary generation error:', summaryError);
        summary = 'Document text extracted successfully, but summary generation failed. Please review the document and create a summary manually.';
      }
    } else {
      // If text extraction failed or returned an error message, pass it through
      summary = extractedText || 'Document uploaded but text extraction failed. Please enter summary manually.';
    }
    
    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      console.warn('Could not delete temporary file:', e.message);
    }
    
    return ok(res, { 
      success: true, 
      summary: summary,
      message: 'SOW document processed successfully'
    });
    
  } catch (error) {
    console.error('SOW processing error:', error);
    return fail(res, 500, 'Failed to process SOW document');
  }
});

// Government Request Form Submission
app.post('/submit-request', upload.array('attachments', 10), async (req, res) => {
  try {
    console.log('📝 Government request form submission received');
    console.log('Form data:', req.body);
    console.log('Files:', req.files?.map(f => ({ name: f.originalname, size: f.size })));
    
    // Extract form data
    const {
      agency, requesting_role, primary_poc_name, primary_poc_title, primary_poc_email, primary_poc_mobile,
      contract_vehicle, decision_date, funding_status, event_name, sow_summary, objectives, constraints,
      pop_city, pop_state, pop_country, max_distance, distance_unit, start_date, end_date, timezone,
      attendee_count, room_nights, lodging_type, sla_acknowledgment, additional_notes
    } = req.body;
    
    // Validate required fields
    if (!agency || !requesting_role || !primary_poc_name || !primary_poc_email || !event_name || !sow_summary || !objectives || !decision_date || !funding_status) {
      return fail(res, 400, 'Missing required fields');
    }
    
    if (!sla_acknowledgment) {
      return fail(res, 400, 'SLA acknowledgment is required');
    }
    
    // Create request ID
    const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // Store in database
    const stmt = db.prepare(`
      INSERT INTO government_requests (
        request_id, agency, requesting_role, primary_poc_name, primary_poc_title, 
        primary_poc_email, primary_poc_mobile, contract_vehicle, decision_date, 
        funding_status, event_name, sow_summary, objectives, constraints,
        pop_city, pop_state, pop_country, max_distance, distance_unit,
        start_date, end_date, timezone, attendee_count, room_nights, 
        lodging_type, additional_notes, created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
    `);
    
    try {
      stmt.run(
        requestId, agency, requesting_role, primary_poc_name, primary_poc_title,
        primary_poc_email, primary_poc_mobile, contract_vehicle, decision_date,
        funding_status, event_name, sow_summary, objectives, constraints,
        pop_city, pop_state, pop_country, max_distance, distance_unit,
        start_date, end_date, timezone, attendee_count, room_nights,
        lodging_type, additional_notes
      );
    } catch (dbError) {
      console.error('Database insert error:', dbError);
      // Table might not exist, create it
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS government_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT UNIQUE NOT NULL,
            agency TEXT NOT NULL,
            requesting_role TEXT NOT NULL,
            primary_poc_name TEXT NOT NULL,
            primary_poc_title TEXT NOT NULL,
            primary_poc_email TEXT NOT NULL,
            primary_poc_mobile TEXT,
            contract_vehicle TEXT,
            decision_date TEXT NOT NULL,
            funding_status TEXT NOT NULL,
            event_name TEXT NOT NULL,
            sow_summary TEXT NOT NULL,
            objectives TEXT NOT NULL,
            constraints TEXT,
            pop_city TEXT,
            pop_state TEXT,
            pop_country TEXT,
            max_distance INTEGER,
            distance_unit TEXT,
            start_date TEXT,
            end_date TEXT,
            timezone TEXT,
            attendee_count INTEGER,
            room_nights INTEGER,
            lodging_type TEXT,
            additional_notes TEXT,
            created_at TEXT NOT NULL,
            status TEXT DEFAULT 'pending'
          )
        `);
        
        // Try insert again
        stmt.run(
          requestId, agency, requesting_role, primary_poc_name, primary_poc_title,
          primary_poc_email, primary_poc_mobile, contract_vehicle, decision_date,
          funding_status, event_name, sow_summary, objectives, constraints,
          pop_city, pop_state, pop_country, max_distance, distance_unit,
          start_date, end_date, timezone, attendee_count, room_nights,
          lodging_type, additional_notes
        );
      } catch (createError) {
        console.error('Failed to create table or insert:', createError);
        return fail(res, 500, 'Database error');
      }
    }
    
    // Handle file attachments
    if (req.files && req.files.length > 0) {
      const uploadsDir = path.join(__dirname, 'uploads');
      const attachmentDir = path.join(uploadsDir, 'requests', requestId);
      fs.mkdirSync(attachmentDir, { recursive: true });
      
      for (const file of req.files) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = path.join(attachmentDir, safeName);
        fs.writeFileSync(filePath, file.buffer);
      }
    }
    
    // Send confirmation email to requester
    if (process.env.SMTP_HOST) {
      try {
        const emailHtml = `
          <h2>Government Event Request Confirmation</h2>
          <p>Dear ${primary_poc_name},</p>
          <p>Thank you for submitting your government event request. We have received your submission and will review it within 24 hours.</p>
          
          <h3>Request Details:</h3>
          <ul>
            <li><strong>Request ID:</strong> ${requestId}</li>
            <li><strong>Agency:</strong> ${agency}</li>
            <li><strong>Event:</strong> ${event_name}</li>
            <li><strong>Decision Date:</strong> ${decision_date}</li>
            <li><strong>Attendees:</strong> ${attendee_count}</li>
            <li><strong>Location:</strong> ${pop_city}, ${pop_state}, ${pop_country}</li>
          </ul>
          
          <p>Our team will contact you shortly with initial options and next steps.</p>
          
          <p>Best regards,<br>
          FEDEVENT Team<br>
          Professional Government Event Solutions</p>
        `;
        
        await sendMail({
          from: process.env.SMTP_FROM || 'noreply@fedevent.com',
          to: primary_poc_email,
          subject: `Government Event Request Confirmation - ${requestId}`,
          html: emailHtml
        });
        
        console.log(`✅ Confirmation email sent to ${primary_poc_email}`);
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
    }
    
    // Redirect to success page
    res.redirect(`/request-success.html?id=${requestId}`);
    
  } catch (error) {
    console.error('Request submission error:', error);
    return fail(res, 500, 'Failed to process request');
  }
});
// Google Places API key endpoint
app.get('/api/google-places-key', (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    if (!apiKey) {
      // Return mock mode if no API key is configured
      return res.json({
        mockMode: true,
        message: 'Google Places API key not configured'
      });
    }
    
    return res.json({
      apiKey: apiKey,
      mockMode: false
    });
  } catch (error) {
    console.error('Error getting Google Places API key:', error);
    return res.status(500).json({
      error: 'Failed to get Google Places API key',
      mockMode: true
    });
  }
});

// ---------- Claude API Endpoints ----------

// Code review endpoint
app.post('/api/claude/code-review', requireAuth, async (req, res) => {
  const claude = await getClaude();
  if (!claude) {
    return res.status(503).json({ 
      error: 'Claude service not available',
      message: 'Claude API key not configured'
    });
  }

  try {
    const { code, language = 'javascript', focus = 'general' } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Code content is required' });
    }

    const prompts = {
      general: `Please review this ${language} code and provide feedback on:
1. Code quality and best practices
2. Potential bugs or issues
3. Security concerns
4. Performance optimizations
5. Maintainability suggestions

Code:
\`\`\`${language}
${code}
\`\`\``,
      
      security: `Please perform a security review of this ${language} code. Focus on:
1. Security vulnerabilities
2. Input validation
3. Authentication/authorization issues
4. Data exposure risks
5. Injection attacks

Code:
\`\`\`${language}
${code}
\`\`\``,
      
      performance: `Please analyze this ${language} code for performance issues:
1. Performance bottlenecks
2. Memory usage optimization
3. Algorithm efficiency
4. Database query optimization
5. Caching opportunities

Code:
\`\`\`${language}
${code}
\`\`\``,
      
      refactor: `Please suggest refactoring improvements for this ${language} code:
1. Code structure improvements
2. Function/method extraction
3. Design pattern applications
4. Readability enhancements
5. Code organization

Code:
\`\`\`${language}
${code}
\`\`\``
    };

    const prompt = prompts[focus] || prompts.general;

    const completion = await claude.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 1000,
      temperature: 0.3
    });

    const review = completion.content[0]?.text;
    
    res.json({
      review,
      focus,
      language,
      tokens_used: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('OpenAI code review error:', error);
    res.status(500).json({ 
      error: 'Code review failed',
      message: error.message
    });
  }
});

// Document analysis endpoint
app.post('/api/openai/analyze-document', requireAuth, async (req, res) => {
  if (!openai) {
    return res.status(503).json({ 
      error: 'OpenAI service not available',
      message: 'OpenAI API key not configured'
    });
  }

  try {
    const { text, analysis_type = 'summary' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Document text is required' });
    }

    const prompts = {
      summary: `Please provide a concise summary of this document:

${text}`,
      
      key_points: `Please extract the key points and important information from this document:

${text}`,
      
      requirements: `Please extract requirements, specifications, and constraints from this document:

${text}`,
      
      action_items: `Please identify action items, tasks, and deliverables from this document:

${text}`
    };

    const prompt = prompts[analysis_type] || prompts.summary;

    const completion = await claude.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 800,
      temperature: 0.3
    });

    const analysis = completion.content[0]?.text;
    
    res.json({
      analysis,
      analysis_type,
      tokens_used: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('OpenAI document analysis error:', error);
    res.status(500).json({ 
      error: 'Document analysis failed',
      message: error.message
    });
  }
});

// Contract proposal generation endpoint
app.post('/api/openai/generate-proposal', requireAuth, async (req, res) => {
  if (!openai) {
    return res.status(503).json({ 
      error: 'OpenAI service not available',
      message: 'OpenAI API key not configured'
    });
  }

  try {
    const { requirements, hotel_info, contract_type = 'hotel_services' } = req.body;

    if (!requirements || !requirements.trim()) {
      return res.status(400).json({ error: 'Requirements are required' });
    }

    const prompt = `Generate a professional contract proposal for hotel services based on these requirements:

REQUIREMENTS:
${requirements}

HOTEL INFORMATION:
${hotel_info || 'Standard hotel services provider'}

Please create a structured proposal including:
1. Executive Summary
2. Scope of Services
3. Deliverables
4. Timeline
5. Terms and Conditions
6. Pricing Structure (placeholder)

Format as a professional business proposal.`;

    const completion = await claude.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 1200,
      temperature: 0.4
    });

    const proposal = completion.content[0]?.text;
    
    res.json({
      proposal,
      contract_type,
      tokens_used: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('OpenAI proposal generation error:', error);
    res.status(500).json({ 
      error: 'Proposal generation failed',
      message: error.message
    });
  }
});

// General AI assistant endpoint
app.post('/api/openai/assistant', requireAuth, async (req, res) => {
  if (!openai) {
    return res.status(503).json({ 
      error: 'OpenAI service not available',
      message: 'OpenAI API key not configured'
    });
  }

  try {
    const { message, context = '' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const systemPrompt = `You are an AI assistant for FEDEVENT, a federal contracting and hotel management platform. Help users with:
- Government contracting questions
- Hotel management advice
- Federal procurement guidance
- Business process optimization

Be professional, helpful, and accurate.`;

    const userPrompt = context ? `Context: ${context}

Question: ${message}` : message;

    const completion = await claude.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\n${userPrompt}`
        }
      ],
      max_tokens: 800,
      temperature: 0.7
    });

    const response = completion.content[0]?.text;
    
    res.json({
      response,
      tokens_used: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('OpenAI assistant error:', error);
    res.status(500).json({ 
      error: 'Assistant request failed',
      message: error.message
    });
  }
});

// Hotel search endpoint
app.post('/api/hotels/search', async (req, res) => {
  try {
    const { location, placeId, lat, lng, startDate, endDate, roomCount, attendeeCount } = req.body;
    
    console.log('Hotel search request:', {
      location,
      placeId,
      lat,
      lng,
      startDate,
      endDate,
      roomCount,
      attendeeCount
    });
    
    // Query hotels from database based on location
    let query = `
      SELECT 
        h.*,
        hc.hotel_name,
        hc.hotel_address,
        hc.hotel_city,
        hc.hotel_state,
        hc.hotel_zip,
        hc.hotel_phone,
        hc.hotel_email,
        hc.hotel_website,
        hc.total_rooms,
        hc.single_rooms,
        hc.double_rooms,
        hc.ada_rooms,
        hc.suite_rooms
      FROM hotel_profiles h
      LEFT JOIN hotel_compliance hc ON h.hotel_id = hc.hotel_id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Add location-based search
    if (lat && lng) {
      // Search within radius (approximately 50 miles)
      query += ` AND (
        (6371 * acos(cos(radians(?)) * cos(radians(hc.hotel_lat)) * cos(radians(hc.hotel_lng) - radians(?)) + sin(radians(?)) * sin(radians(hc.hotel_lat)))) < 80.5
        OR hc.hotel_city LIKE ? 
        OR hc.hotel_state LIKE ?
        OR hc.hotel_address LIKE ?
      )`;
      params.push(lat, lng, lat, `%${location}%`, `%${location}%`, `%${location}%`);
    } else if (location) {
      // Text-based location search
      query += ` AND (
        hc.hotel_city LIKE ? 
        OR hc.hotel_state LIKE ?
        OR hc.hotel_address LIKE ?
        OR hc.hotel_name LIKE ?
      )`;
      params.push(`%${location}%`, `%${location}%`, `%${location}%`, `%${location}%`);
    }
    
    // Add room availability filter
    if (roomCount) {
      query += ` AND hc.total_rooms >= ?`;
      params.push(parseInt(roomCount));
    }
    
    // Add status filter (only active hotels)
    query += ` AND h.status = 'active'`;
    
    // Order by relevance (closest first if coordinates available)
    if (lat && lng) {
      query += ` ORDER BY (6371 * acos(cos(radians(?)) * cos(radians(hc.hotel_lat)) * cos(radians(hc.hotel_lng) - radians(?)) + sin(radians(?)) * sin(radians(hc.hotel_lat)))) ASC`;
      params.push(lat, lng, lat);
    } else {
      query += ` ORDER BY hc.hotel_name ASC`;
    }
    
    console.log('Executing hotel search query:', query);
    console.log('With parameters:', params);
    
    const [hotels] = await db.execute(query, params);
    
    console.log(`Found ${hotels.length} hotels matching search criteria`);
    
    res.json({
      success: true,
      hotels: hotels,
      searchCriteria: {
        location,
        placeId,
        lat,
        lng,
        startDate,
        endDate,
        roomCount,
        attendeeCount
      },
      totalFound: hotels.length
    });
    
  } catch (error) {
    console.error('Hotel search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search hotels',
      message: error.message
    });
  }
});

// Public AI chatbot endpoint - No authentication required for website visitors
app.post('/api/chat/assistant', async (req, res) => {
  try {
    const { message, conversationHistory = [], currentPage = '', formContext = {}, mode = 'default' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Initialize Claude client
    const claudeClient = await getClaude();
    
    if (!claudeClient) {
      // Fallback to rule-based responses if Claude is not available
      return res.json({
        response: "I'm here to help! While my AI capabilities are temporarily limited, I can still assist you. Please contact us at (305) 850-7848 or info@fedevent.com for immediate assistance.",
        isAiResponse: false
      });
    }

    // Comprehensive knowledge base about FEDEVENT
    const knowledgeBase = `
# FEDEVENT / CREATA Global Event Agency LLC - Complete Knowledge Base

## Company Overview
FEDEVENT is operated by CREATA Global Event Agency LLC, which serves as the prime contractor for all U.S. government contracts. We specialize in federal event planning, hotel partnerships, and emergency response coordination.

## Contact Information
- Phone: (305) 850-7848
- Email: info@fedevent.com
- Emergency: Available 24/7
- Business Hours: Monday-Friday, 9AM-6PM EST
- Response Time: Within 24 hours for non-emergency inquiries

## Contract Structure
- **CREATA Global Event Agency LLC** is the PRIME CONTRACTOR for all government contracts
- Hotels and service providers serve as SUBCONTRACTORS under CREATA
- U.S. government issues purchase orders (POs) directly to CREATA Global only
- CREATA manages subcontractors, ensures compliance, and distributes payments
- Only CREATA must be SAM.gov registered; hotels do NOT need individual registration

## Hotel Partnership Requirements
To join CREATA's Preferred Vendor Network, hotels must meet:
1. **AAA Rating**: A significant plus but NOT strictly required. Hotels with AAA ratings (2-5 Diamond) have higher chances of selection. Some government agencies may require specific AAA diamond levels for their events, while most prioritize quality and compliance over ratings.
2. **Facilities**: Indoor facilities only (no outdoor-only properties)
3. **Payment Terms**: Must accept NET30 payment terms (mandatory)
4. **Government POs**: Must accept government-backed purchase orders
5. **No Direct Bill**: CREATA does not complete direct bill applications
6. **U.S. Standards**: Must meet U.S. government safety and compliance standards

## Registration Process
1. Complete the hotel registration form on our website
2. Provide all required documentation (licenses, certifications, insurance)
3. Submit property information (rooms, meeting spaces, amenities)
4. **Review Timeline**: 2-4 business days for most applications
5. Extended timeline if additional verification needed
6. Email notification sent upon approval
### What We Review During Registration
- Proper business licensing and compliance
- U.S. government safety standards adherence
- CREATA Global subcontractor policy alignment
- NET30 payment term acceptance
- Government PO acknowledgment
- Facility requirements (indoor spaces, AAA rating)

## Payment Terms (Critical Information)
**NET30 Terms - MANDATORY:**
- CREATA operates STRICTLY under NET30 payment terms
- NO deposits or upfront payments permitted
- NO advance payments for government contracts
- All invoicing done through CREATA as prime contractor

**Payment Process Flow:**
1. Hotels/vendors invoice CREATA directly after service completion
2. CREATA invoices the U.S. Government
3. **NET30 countdown starts** when the governmental body (USG/UN) approves the submitted invoice
4. U.S. Government processes payment (typically 2-3 weeks after approval)
5. Once CREATA receives payment from the U.S. Government, CREATA issues payment to the hotel **within 2 business days**
6. This ensures rapid payment to subcontractors once government funds are received

**Important:** CREATA does NOT complete direct bill applications. All POs are issued to CREATA as the prime contractor.

## SAM.gov Registration
**For Hotels and Subcontractors:** NO SAM.gov registration required!
- Only CREATA Global, as prime contractor, must be SAM.gov registered
- Hotels and vendors are subcontractors - no individual registration needed
- You can choose to register anyway, but it's not required to participate
- All contracts must still be fulfilled through CREATA Global
- Hotels always act as subcontractors for government task orders

This structure simplifies the process while maintaining federal compliance.

## Contract Awards and Selection
**Award Process:**
1. Government issues a task order with specific requirements
2. CREATA identifies qualified hotels from Preferred Vendor Network
3. We present the most advantageous offer to the customer
4. If selected as best value, customer extends an award
5. Contract awarded through CREATA as prime contractor

**Selection Criteria:**
- Specific requirements of each government task order
- Compliance with federal standards
- Location and proximity to event site
- Pricing competitiveness (30% discount on per diem preferred)
- Facility capabilities (meeting spaces, capacity, amenities)
- Reliability and past performance
- Availability for requested dates

**Multiple Opportunities:**
- Hotels demonstrating reliability may be awarded multiple contracts over time
- Rare that hotels in our network don't meet requirements
- Registration ensures eligibility for future task orders

## Subcontractor Rules (CRITICAL)
**Government Contact Policy:**
- Subcontractors (including hotels) are NOT permitted to contact U.S. government officials directly
- If government contact info is accidentally shared, immediately notify CREATA and delete the information
- Direct communication with government may result in immediate termination from vendor network
- Only CREATA, as prime contractor, is authorized to engage with government representatives

**Compliance Requirements:**
- Violations of subcontractor policies may result in termination from CREATA's Preferred Vendor Network
- Compliance with rules is essential to maintaining credibility with U.S. government agencies
- Includes failing to honor payment terms or contacting government officials directly
- All communications must go through CREATA

## Services Offered
**Event Planning:**
- Corporate conferences and workshops
- Government training sessions and meetings
- Multi-day events with accommodation coordination
- Meeting space coordination and setup
- Catering and logistics management
- AV equipment and technical support

**Hotel Network:**
- 2+ Diamond AAA rated properties nationwide
- NET30 payment terms accepted
- Government per diem rates (30% discount preferred)
- Group block reservations
- Indoor facilities
- Nationwide coverage across all states

**Emergency Services:**
- 24/7 emergency response team available
- Rapid deployment capabilities
- Crisis accommodation solutions
- Emergency meeting coordination
- Priority booking status
- Immediate confirmation for urgent needs

**Pricing Structure:**
- NET30 payment terms (mandatory)
- Government-backed purchase orders
- 30% discount on per diem rates (preferred but not required)
- No upfront payments required
- Transparent pricing structure
- No hidden fees

## Per Diem Rates
- Government per diem rates apply for federal employees
- Based on GSA (General Services Administration) rates by location
- Rates vary by city/region and season
- 30% discount on per diem rates preferred
- Per diem covers lodging and meals & incidentals
- Updated annually by GSA

**How to Check Per Diem Rates:**
- Use our built-in **Resources page** at /resources.html to instantly look up current GSA per diem rates for any U.S. city
- Our system pulls real-time data directly from the official GSA API
- No need to visit external websites - we have the same official data integrated
- Simply enter the city and state to see current lodging and M&IE rates
- You can also visit gsa.gov/perdiem if you prefer the official government site

## Profile Updates
**Can hotels update their profile after approval?** YES!

**What You Can Update:**
- Room counts and availability
- Meeting space information and changes
- Amenities and services offered
- Contact information
- Service offerings and capabilities
- Pricing and rate structures

**Where Updates Are Stored:**
- All updates stored in CREATA's Preferred Vendor Network database
- Ensures accurate matching for future government opportunities
- Changes reflected in future contract matching and proposals
- Maintains current information for rapid response to task orders

**Access:** Update your profile anytime through the dashboard or contact support.

## Account Deactivation Policy
**Deactivation Process:**
- Accounts can be deactivated by FEDEVENT administrators for policy violations, inactivity, or at account holder's request
- Deactivated accounts cannot access the system or receive contract notifications
- Account data retained for 180 days to allow for reactivation if needed
- After 180 days, all account data permanently deleted

**Reactivation:**
- Deactivated accounts can be reactivated within 180 days by contacting FEDEVENT support
- Reactivation requests must include valid reason for restoration
- All account privileges restored upon successful reactivation

**Data Retention:**
- Account information retained for 180 days after deactivation
- After 180 days, all data permanently deleted from our systems
- Policy ensures compliance with data protection regulations

**Contact for Deactivation/Reactivation:** support@fedevent.com

## Frequently Asked Questions

**Q: Why does CREATA act as the prime contractor?**
A: The U.S. government prefers working with established prime contractors who manage subcontractors. This ensures federal compliance, proper documentation, and streamlined payment processing.

**Q: How long does approval take?**
A: Most applications are reviewed within 2-4 business days. Extended verification may take slightly longer.

**Q: Is AAA rating required?**
A: AAA rating is a significant advantage but NOT strictly required. Hotels with AAA ratings (2-5 Diamond) have better chances of selection for government contracts. Some specific government agencies may require certain AAA diamond levels for their premium events, while most agencies prioritize overall quality, compliance, and value. We encourage pursuing AAA certification to maximize your opportunities.

**Q: Can I negotiate different payment terms?**
A: No. NET30 is mandatory for all government contracts. No exceptions can be made.

**Q: Do I invoice the government directly?**
A: No. You invoice CREATA directly. CREATA invoices the government. Once paid, CREATA pays you within NET30 terms.

**Q: What happens after I'm approved?**
A: You're added to CREATA's Preferred Vendor Network. When relevant task orders arise, CREATA will contact qualified hotels for bids and proposals.

**Q: Is approval a guarantee of contracts?**
A: No. Approval adds you to our network for consideration, but contract selection depends on government requirements, availability, pricing, and compliance.

**Q: Can I contact the government agency directly?**
A: Absolutely not. This is a critical violation and will result in immediate termination from our vendor network. All government communication must go through CREATA.

## Technical Support
For technical issues with registration, forms, or website functionality:
- Email: info@fedevent.com
- Phone: (305) 850-7848
- Describe the issue in detail (browser, error messages, screenshots helpful)
- Our team will respond within 24 hours

## Form Filling Assistance
If users need help filling out the registration form:
1. **Hotel Name**: Official legal business name
2. **Contact Information**: Primary contact person who will manage bookings
3. **Property Details**: Address, phone, email, website
4. **Room Information**: Total rooms, room types, capacities
5. **Meeting Spaces**: Names, capacities, setups available
6. **Amenities**: List all available amenities (WiFi, parking, fitness center, etc.)
7. **AAA Rating**: Must be 2+ Diamonds
8. **NET30 Acceptance**: Must acknowledge and accept
9. **Government PO Acceptance**: Must confirm willingness to accept
10. **Licenses & Insurance**: Upload required documents

## Privacy & Data Protection
- All information submitted is stored securely
- Used only for contract matching and vendor network management
- Not shared with third parties except as required for government contracting
- Compliant with federal data protection standards
`;

    // Build conversation context
    const systemPromptDefault = `You are an intelligent AI assistant for FEDEVENT (CREATA Global Event Agency LLC). Your purpose is to help website visitors with:

1. **Registration Assistance**: Guide users step-by-step through the hotel registration form, explaining each field, requirements, and why the information is needed.

2. **Policy Questions**: Answer questions about company policies, payment terms, contract structure, subcontractor rules, and compliance requirements.

3. **Technical Support**: Help users troubleshoot website issues, form problems, and navigation questions.

4. **General Information**: Provide details about services, requirements, contact information, and processes.

**Your Personality:**
- Friendly, professional, and helpful
- Patient and thorough in explanations
- Proactive in offering relevant additional information
- Clear and concise in responses
- Empathetic to user concerns

**Guidelines:**
- Use the knowledge base provided to give accurate, detailed answers
- When discussing payment terms, always emphasize NET30 is mandatory
- Make it clear CREATA is the prime contractor, hotels are subcontractors
- Explain that SAM.gov registration is NOT required for hotels
- Be clear about the 2-4 day review timeline for applications
- If asked about specific form fields, explain what information is needed and why
- For technical issues beyond your scope, direct users to contact support
- Never make promises about contract awards or guarantees
- Always maintain professional boundaries regarding government contacts

**Current Context:**
- User is on page: ${currentPage || 'unknown'}
- Form context: ${JSON.stringify(formContext)}

Use the comprehensive knowledge base below to answer questions accurately:

${knowledgeBase}

## Hotel Evaluation System (INTERNAL ADMIN ACCESS ONLY)
**⚠️ IMPORTANT: This system is for internal admin use only. Do not discuss specific hotel scores or compliance details with external users.**

### Partnership Scoring System
FEDEVENT uses a comprehensive 100-point scoring system to evaluate hotel partnerships:

**Scoring Components:**
- Response Time Score: 0-20 points (how quickly hotels respond to RFPs)
- Rate Competitiveness: 0-25 points (pricing vs. per diem rates)
- Compliance Score: 0-25 points (business licenses, insurance, certifications)
- Performance History: 0-30 points (event feedback and performance ratings)

**Partnership Tiers:**
- 90-100 points: Platinum Partner (highest priority for RFPs)
- 75-89 points: Preferred Partner (first-tier RFP distribution)
- 60-74 points: Active Vendor (standard participation)
- Below 60: Probation or Inactive status

### Compliance Requirements
All hotels must maintain:
- Valid business licenses and local safety certifications
- Up-to-date insurance covering liability and property
- Commercial invoice capability
- US territory operation
- NET 30 payment terms acceptance
- No direct government contact (all communication through CREATA)

### Partnership Agreement Management
- Digital signature workflow (hotel signer + CREATA approver)
- Annual renewal cycles with automatic reminders
- Status tracking: pending, signed, active, expired, terminated
- Green status = fully signed and approved
- Red status = blocks all bidding functions

### Founding Partner Benefits
Early participants receive:
- Complimentary onboarding (no fees)
- Priority support and listing visibility
- Subscription discounts
- Beta feature access
- Lifetime tracking and marketing privileges

### Preferred Hotel Network (PHN)
- Management group tagging (e.g., "MasterKey Hospitality", "Aimbridge Hospitality")
- First-tier RFP distribution
- Enhanced visibility to federal event managers
- Automatic targeting for relevant management clusters

### Communication Standards
- Official channels only: info@creataglobal.com, support@creataglobal.com
- No direct government contact allowed
- All communication archived for audit
- Professional tone required for all interactions

### Performance Monitoring
- Event-based feedback collection
- Response time tracking
- Rate competitiveness analysis
- Compliance monitoring
- Automatic score updates after each event cycle

**Admin Access:**
- Hotel Evaluation Dashboard: /hotel-evaluation-dashboard.html
- Comprehensive scoring and compliance tracking
- Export functionality for reporting
- Real-time statistics and filtering
- Individual hotel detail views

**DANA's Role in Hotel Evaluation:**
- Explain the evaluation process to hotels (high-level only)
- Guide hotels on compliance requirements
- Assist with partnership agreement questions
- Provide general information about scoring system
- NEVER disclose specific hotel scores or internal data
- Direct detailed questions to admin team`;

    const systemPromptDana = `You are Dana, FEDEVENT's AI. On the public landing page, you have no topical restrictions. Freely explain all FEDEVENT services, processes, policies, and offerings in clear, direct language. If users ask for examples or templates, provide them. Keep responses helpful, candid, and solution-oriented. Avoid making legal guarantees or disclosing private data. When in doubt, be transparent and give best-practice guidance.

**IMPORTANT - Hotel Evaluation System:**
- You can explain the general evaluation process to hotels (scoring system, compliance requirements, partnership tiers)
- You can guide hotels on how to improve their scores and maintain compliance
- You can explain partnership agreement requirements and founding partner benefits
- You can provide general information about the Preferred Hotel Network
- NEVER disclose specific hotel scores, compliance status, or internal evaluation data
- NEVER reveal which hotels are in which tiers or their specific performance metrics
- If asked about specific hotel evaluations, redirect to admin team
- Always maintain confidentiality of internal scoring and evaluation data

Context:
- Page: ${currentPage || 'home'}
- Form context: ${JSON.stringify(formContext)}

Use the comprehensive knowledge base below to answer questions thoroughly:

${knowledgeBase}`;

    const systemPromptDanaPrelaunch = `You are Dana, FEDEVENT's AI, operating in Prelaunch mode. Be brief and high-level. Focus on inviting hotels to join the waitlist and verifying interest. Do not dive into detailed registration steps or internal processes. Emphasize benefits, eligibility (NET30, Gov PO acceptance, indoor facilities), and next steps (watch for invite, limited program). Avoid deep operational details.

Context:
- Page: ${currentPage || 'prelaunch'}
- Form context: ${JSON.stringify(formContext)}

Use the knowledge base for accurate high-level answers, but avoid granular walkthroughs.`;

    const messages = [];

    // Add conversation history (limit to last 10 exchanges to manage token usage)
    const recentHistory = conversationHistory.slice(-10);
    recentHistory.forEach(msg => {
      messages.push({
        role: msg.role || 'user',
        content: msg.content
      });
    });

    // Add current user message
    messages.push({
      role: 'user',
      content: message
    });

    // Call Claude API with system prompt as separate parameter
    const completion = await claudeClient.messages.create({
      model: 'claude-3-haiku-20240307',
      system: mode === 'dana_unrestricted' ? systemPromptDana : (mode === 'dana_prelaunch' ? systemPromptDanaPrelaunch : systemPromptDefault),
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7
    });

    const response = completion.content[0]?.text;
    
    if (!response) {
      return res.status(500).json({ error: 'No response generated' });
    }

    res.json({
      response,
      isAiResponse: true,
      tokensUsed: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('Chatbot assistant error:', error);
    
    // Friendly fallback response
    res.json({
      response: "I apologize, but I'm experiencing technical difficulties right now. Please feel free to contact us directly at (305) 850-7848 or info@fedevent.com, and our team will be happy to assist you immediately!",
      isAiResponse: false,
      error: error.message
    });
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 7070;

// Run log rotation on startup
try {
  rotateLogs();
} catch (error) {
  console.warn('Log rotation failed on startup:', error.message);
}

// Hotel Evaluation System Tables
try {
  // Partnership Agreements
  db.exec(`
    CREATE TABLE IF NOT EXISTS partnership_agreements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      agreement_version TEXT DEFAULT '1.0',
      status TEXT DEFAULT 'pending', -- pending, signed, expired, terminated
      hotel_signer_name TEXT,
      hotel_signer_title TEXT,
      hotel_signer_email TEXT,
      hotel_signed_at TEXT,
      creata_approver_name TEXT,
      creata_approver_email TEXT,
      creata_approved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      renewal_reminder_sent INTEGER DEFAULT 0,
      FOREIGN KEY (hotel_id) REFERENCES hotels (id)
    )
  `);

  // Hotel Partnership Scores
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotel_partnership_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      response_time_score INTEGER DEFAULT 0, -- 0-20 points
      rate_competitiveness_score INTEGER DEFAULT 0, -- 0-25 points
      compliance_score INTEGER DEFAULT 0, -- 0-25 points
      performance_score INTEGER DEFAULT 0, -- 0-30 points
      total_score INTEGER DEFAULT 0, -- 0-100 points
      tier TEXT DEFAULT 'Inactive', -- Platinum, Preferred, Active, Probation, Inactive
      last_updated TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hotel_id) REFERENCES hotels (id)
    )
  `);

  // Compliance Tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotel_compliance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      business_license_valid INTEGER DEFAULT 0,
      safety_certifications_valid INTEGER DEFAULT 0,
      insurance_coverage_valid INTEGER DEFAULT 0,
      commercial_invoice_capable INTEGER DEFAULT 0,
      us_territory_operating INTEGER DEFAULT 0,
      net_30_terms_accepted INTEGER DEFAULT 0,
      last_compliance_check TEXT DEFAULT (datetime('now')),
      compliance_notes TEXT,
      FOREIGN KEY (hotel_id) REFERENCES hotels (id)
    )
  `);

  // Performance History
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotel_performance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      event_id INTEGER,
      event_name TEXT,
      performance_rating INTEGER, -- 1-5 stars
      feedback_text TEXT,
      response_time_hours INTEGER,
      rate_competitiveness_score INTEGER,
      compliance_issues TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hotel_id) REFERENCES hotels (id)
    )
  `);

  // Preferred Hotel Network
  db.exec(`
    CREATE TABLE IF NOT EXISTS preferred_hotel_network (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      management_group TEXT,
      network_status TEXT DEFAULT 'pending', -- pending, active, suspended
      joined_at TEXT DEFAULT (datetime('now')),
      benefits_tier TEXT DEFAULT 'standard', -- standard, premium, platinum
      FOREIGN KEY (hotel_id) REFERENCES hotels (id)
    )
  `);

  // Founding Partner Status
  db.exec(`
    CREATE TABLE IF NOT EXISTS founding_partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      founding_status INTEGER DEFAULT 1, -- 1 = founding partner
      onboarding_fee_waived INTEGER DEFAULT 1,
      priority_support INTEGER DEFAULT 1,
      subscription_discount_percent INTEGER DEFAULT 0,
      beta_access INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (hotel_id) REFERENCES hotels (id)
    )
  `);

  // Communication Audit
  db.exec(`
    CREATE TABLE IF NOT EXISTS communication_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      communication_type TEXT NOT NULL, -- email, portal, phone, social
      channel TEXT NOT NULL, -- info@creataglobal.com, support@creataglobal.com, etc.
      subject TEXT,
      message_preview TEXT,
      sent_at TEXT DEFAULT (datetime('now')),
      compliance_violation INTEGER DEFAULT 0,
      violation_notes TEXT,
      FOREIGN KEY (hotel_id) REFERENCES hotels (id)
    )
  `);

  // Rate Commitments
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotel_rate_commitments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_id INTEGER NOT NULL,
      bpa_id TEXT,
      agreed_rate DECIMAL(10,2),
      rate_type TEXT, -- government, self_pay, group
      commitment_start TEXT,
      commitment_end TEXT,
      availability_updated_at TEXT DEFAULT (datetime('now')),
      capacity_limit INTEGER,
      current_availability INTEGER,
      FOREIGN KEY (hotel_id) REFERENCES hotels (id)
    )
  `);

  console.log('✅ Hotel Evaluation System tables created successfully');
} catch (error) {
  console.error('❌ Error creating hotel evaluation tables:', error);
}

// Hotel Evaluation System API Endpoints

// Get hotel partnership score and tier
app.get('/api/hotel/partnership-score/:hotelId', (req, res) => {
  try {
    const { hotelId } = req.params;
    
    const score = db.prepare(`
      SELECT * FROM hotel_partnership_scores 
      WHERE hotel_id = ? 
      ORDER BY last_updated DESC 
      LIMIT 1
    `).get(hotelId);
    
    if (!score) {
      return res.json({
        hotel_id: hotelId,
        response_time_score: 0,
        rate_competitiveness_score: 0,
        compliance_score: 0,
        performance_score: 0,
        total_score: 0,
        tier: 'Inactive',
        last_updated: new Date().toISOString()
      });
    }
    
    res.json(score);
  } catch (error) {
    console.error('Error fetching partnership score:', error);
    res.status(500).json({ error: 'Failed to fetch partnership score' });
  }
});

// Update hotel partnership score
app.post('/api/hotel/update-partnership-score', (req, res) => {
  try {
    const { 
      hotelId, 
      response_time_score, 
      rate_competitiveness_score, 
      compliance_score, 
      performance_score 
    } = req.body;
    
    const total_score = (response_time_score || 0) + 
                       (rate_competitiveness_score || 0) + 
                       (compliance_score || 0) + 
                       (performance_score || 0);
    
    // Determine tier based on total score
    let tier = 'Inactive';
    if (total_score >= 90) tier = 'Platinum Partner';
    else if (total_score >= 75) tier = 'Preferred Partner';
    else if (total_score >= 60) tier = 'Active Vendor';
    else if (total_score > 0) tier = 'Probation';
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO hotel_partnership_scores 
      (hotel_id, response_time_score, rate_competitiveness_score, compliance_score, 
       performance_score, total_score, tier, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    stmt.run(hotelId, response_time_score, rate_competitiveness_score, 
             compliance_score, performance_score, total_score, tier);
    
    res.json({ 
      success: true, 
      total_score, 
      tier,
      message: `Partnership score updated. Hotel is now ${tier}` 
    });
  } catch (error) {
    console.error('Error updating partnership score:', error);
    res.status(500).json({ error: 'Failed to update partnership score' });
  }
});

// Get hotel compliance status
app.get('/api/hotel/compliance/:hotelId', (req, res) => {
  try {
    const { hotelId } = req.params;
    
    const compliance = db.prepare(`
      SELECT * FROM hotel_compliance 
      WHERE hotel_id = ? 
      ORDER BY last_compliance_check DESC 
      LIMIT 1
    `).get(hotelId);
    
    if (!compliance) {
      return res.json({
        hotel_id: hotelId,
        business_license_valid: 0,
        safety_certifications_valid: 0,
        insurance_coverage_valid: 0,
        commercial_invoice_capable: 0,
        us_territory_operating: 0,
        net_30_terms_accepted: 0,
        compliance_status: 'Not Checked',
        last_compliance_check: new Date().toISOString()
      });
    }
    
    // Calculate overall compliance status
    const compliance_checks = [
      compliance.business_license_valid,
      compliance.safety_certifications_valid,
      compliance.insurance_coverage_valid,
      compliance.commercial_invoice_capable,
      compliance.us_territory_operating,
      compliance.net_30_terms_accepted
    ];
    
    const passed_checks = compliance_checks.filter(check => check === 1).length;
    const total_checks = compliance_checks.length;
    const compliance_percentage = Math.round((passed_checks / total_checks) * 100);
    
    let compliance_status = 'Non-Compliant';
    if (compliance_percentage === 100) compliance_status = 'Fully Compliant';
    else if (compliance_percentage >= 80) compliance_status = 'Mostly Compliant';
    else if (compliance_percentage >= 60) compliance_status = 'Partially Compliant';
    
    res.json({
      ...compliance,
      compliance_percentage,
      compliance_status,
      passed_checks,
      total_checks
    });
  } catch (error) {
    console.error('Error fetching compliance status:', error);
    res.status(500).json({ error: 'Failed to fetch compliance status' });
  }
});

// Update hotel compliance
app.post('/api/hotel/update-compliance', (req, res) => {
  try {
    const { 
      hotelId, 
      business_license_valid, 
      safety_certifications_valid, 
      insurance_coverage_valid, 
      commercial_invoice_capable, 
      us_territory_operating, 
      net_30_terms_accepted,
      compliance_notes 
    } = req.body;
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO hotel_compliance 
      (hotel_id, business_license_valid, safety_certifications_valid, 
       insurance_coverage_valid, commercial_invoice_capable, us_territory_operating, 
       net_30_terms_accepted, last_compliance_check, compliance_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);
    
    stmt.run(hotelId, business_license_valid, safety_certifications_valid, 
             insurance_coverage_valid, commercial_invoice_capable, us_territory_operating, 
             net_30_terms_accepted, compliance_notes);
    
    res.json({ success: true, message: 'Compliance status updated successfully' });
  } catch (error) {
    console.error('Error updating compliance:', error);
    res.status(500).json({ error: 'Failed to update compliance status' });
  }
});

// Get partnership agreement status
app.get('/api/hotel/partnership-agreement/:hotelId', (req, res) => {
  try {
    const { hotelId } = req.params;
    
    const agreement = db.prepare(`
      SELECT * FROM partnership_agreements 
      WHERE hotel_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(hotelId);
    
    if (!agreement) {
      return res.json({
        hotel_id: hotelId,
        status: 'Not Started',
        agreement_version: '1.0',
        hotel_signed: false,
        creata_approved: false,
        days_until_expiry: null,
        renewal_required: false
      });
    }
    
    const now = new Date();
    const expiry_date = agreement.expires_at ? new Date(agreement.expires_at) : null;
    const days_until_expiry = expiry_date ? Math.ceil((expiry_date - now) / (1000 * 60 * 60 * 24)) : null;
    const renewal_required = days_until_expiry !== null && days_until_expiry <= 30;
    
    res.json({
      ...agreement,
      hotel_signed: !!agreement.hotel_signed_at,
      creata_approved: !!agreement.creata_approved_at,
      days_until_expiry,
      renewal_required
    });
  } catch (error) {
    console.error('Error fetching partnership agreement:', error);
    res.status(500).json({ error: 'Failed to fetch partnership agreement' });
  }
});

// Update partnership agreement
app.post('/api/hotel/update-partnership-agreement', (req, res) => {
  try {
    const { 
      hotelId, 
      hotel_signer_name, 
      hotel_signer_title, 
      hotel_signer_email,
      creata_approver_name,
      creata_approver_email,
      action // 'hotel_sign' or 'creata_approve'
    } = req.body;
    
    let stmt;
    if (action === 'hotel_sign') {
      stmt = db.prepare(`
        INSERT OR REPLACE INTO partnership_agreements 
        (hotel_id, hotel_signer_name, hotel_signer_title, hotel_signer_email, 
         hotel_signed_at, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, datetime('now'), 'signed', datetime('now'), 
                datetime('now', '+1 year'))
      `);
      stmt.run(hotelId, hotel_signer_name, hotel_signer_title, hotel_signer_email);
    } else if (action === 'creata_approve') {
      stmt = db.prepare(`
        UPDATE partnership_agreements 
        SET creata_approver_name = ?, creata_approver_email = ?, 
            creata_approved_at = datetime('now'), status = 'active'
        WHERE hotel_id = ?
      `);
      stmt.run(creata_approver_name, creata_approver_email, hotelId);
    }
    
    res.json({ success: true, message: 'Partnership agreement updated successfully' });
  } catch (error) {
    console.error('Error updating partnership agreement:', error);
    res.status(500).json({ error: 'Failed to update partnership agreement' });
  }
});

// Get founding partner status
app.get('/api/hotel/founding-partner/:hotelId', (req, res) => {
  try {
    const { hotelId } = req.params;
    
    const foundingPartner = db.prepare(`
      SELECT * FROM founding_partners 
      WHERE hotel_id = ?
    `).get(hotelId);
    
    if (!foundingPartner) {
      return res.json({
        hotel_id: hotelId,
        is_founding_partner: false,
        benefits: {
          onboarding_fee_waived: false,
          priority_support: false,
          subscription_discount: 0,
          beta_access: false
        }
      });
    }
    
    res.json({
      ...foundingPartner,
      is_founding_partner: foundingPartner.founding_status === 1,
      benefits: {
        onboarding_fee_waived: foundingPartner.onboarding_fee_waived === 1,
        priority_support: foundingPartner.priority_support === 1,
        subscription_discount: foundingPartner.subscription_discount_percent,
        beta_access: foundingPartner.beta_access === 1
      }
    });
  } catch (error) {
    console.error('Error fetching founding partner status:', error);
    res.status(500).json({ error: 'Failed to fetch founding partner status' });
  }
});

// Get all hotels with evaluation data
app.get('/api/admin/hotel-evaluations', (req, res) => {
  try {
    const hotels = db.prepare(`
      SELECT 
        h.id, h.name, h.email, h.city, h.state,
        ps.total_score, ps.tier, ps.last_updated as score_updated,
        pa.status as agreement_status, pa.hotel_signed_at, pa.creata_approved_at,
        c.compliance_percentage, c.compliance_status,
        fp.founding_status, fp.onboarding_fee_waived,
        phn.network_status, phn.benefits_tier
      FROM hotels h
      LEFT JOIN hotel_partnership_scores ps ON h.id = ps.hotel_id
      LEFT JOIN partnership_agreements pa ON h.id = pa.hotel_id
      LEFT JOIN (
        SELECT hotel_id, 
               CASE 
                 WHEN (business_license_valid + safety_certifications_valid + 
                       insurance_coverage_valid + commercial_invoice_capable + 
                       us_territory_operating + net_30_terms_accepted) = 6 THEN 100
                 WHEN (business_license_valid + safety_certifications_valid + 
                       insurance_coverage_valid + commercial_invoice_capable + 
                       us_territory_operating + net_30_terms_accepted) >= 5 THEN 80
                 WHEN (business_license_valid + safety_certifications_valid + 
                       insurance_coverage_valid + commercial_invoice_capable + 
                       us_territory_operating + net_30_terms_accepted) >= 3 THEN 60
                 ELSE 40
               END as compliance_percentage,
               CASE 
                 WHEN (business_license_valid + safety_certifications_valid + 
                       insurance_coverage_valid + commercial_invoice_capable + 
                       us_territory_operating + net_30_terms_accepted) = 6 THEN 'Fully Compliant'
                 WHEN (business_license_valid + safety_certifications_valid + 
                       insurance_coverage_valid + commercial_invoice_capable + 
                       us_territory_operating + net_30_terms_accepted) >= 5 THEN 'Mostly Compliant'
                 WHEN (business_license_valid + safety_certifications_valid + 
                       insurance_coverage_valid + commercial_invoice_capable + 
                       us_territory_operating + net_30_terms_accepted) >= 3 THEN 'Partially Compliant'
                 ELSE 'Non-Compliant'
               END as compliance_status
        FROM hotel_compliance
      ) c ON h.id = c.hotel_id
      LEFT JOIN founding_partners fp ON h.id = fp.hotel_id
      LEFT JOIN preferred_hotel_network phn ON h.id = phn.hotel_id
      ORDER BY ps.total_score DESC, h.name ASC
    `).all();
    
    res.json(hotels);
  } catch (error) {
    console.error('Error fetching hotel evaluations:', error);
    res.status(500).json({ error: 'Failed to fetch hotel evaluations' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FEDEVENT server running on port ${PORT}`);
  console.log(`📍 Admin login: http://localhost:${PORT}/admin-login.html`);
  console.log(`🏨 Hotel portal: http://localhost:${PORT}/hotel-login.html`);
  console.log(`🌐 Main site: http://localhost:${PORT}`);
});