import 'dotenv/config';
console.log('SAM key prefix:', (process.env.SAM_API_KEY || '').slice(0, 12) + '…');
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import nodemailer from 'nodemailer';
import mammoth from 'mammoth';
import unzipper from 'unzipper';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import OpenAI from 'openai';
// guessFields will be imported dynamically in the autofill endpoint
import { spawnSync } from 'child_process';
import { rotateLogs } from './scripts/log-rotation.js';

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
  if (!hasBin('pdftoppm') || !hasBin('tesseract')) {
    throw new Error('OCR fallback requires pdftoppm and tesseract in PATH');
  }
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
async function ocrImageText(imgPath) {
  if (!hasBin('tesseract')) throw new Error('tesseract not found');
  return run('tesseract', [imgPath, 'stdout', '-l', 'eng']);
}
function extOf(name) {
  return (name.split('.').pop() || '').toLowerCase();
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

// For Render deployment - create production directories if possible
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  try {
    fs.mkdirSync('/opt/render/project/src/uploads', { recursive: true });
    console.log('Render production directories created');
  } catch (e) {
    console.log('Using local directories for uploads');
  }
}

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
// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve landing page as main page
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Index page not found');
  }
});

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
    // Use Render persistent disk if available, fallback to local
    let uploadDir = path.join(__dirname, 'uploads');
    
    // Check for Render production environment
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
      const renderUploadDir = '/opt/render/project/src/uploads';
      if (fs.existsSync(renderUploadDir)) {
        uploadDir = renderUploadDir;
      }
    }
    
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- database ----------
// Use local data directory (persists in Render's container filesystem)
const db = new Database(path.join(__dirname, 'data', 'creata.db'));

// ---------- OpenAI client ----------
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('OpenAI client initialized');
} else {
  console.log('OpenAI API key not found - OpenAI features disabled');
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
    const r = await fetch(`http://localhost:${process.env.PORT || 5050}/api/sam/notice/${encodeURIComponent(req.params.id)}`);
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
      const r = await fetch(`http://localhost:${process.env.PORT || 5050}/api/sam/notice/${encodeURIComponent(noticeid)}`);
      const data = await r.json();
      if (!data || data.error) return fail(res, 404, data?.error || 'Not found', { detail: data?.detail, raw: data?.raw });
      return ok(res, { ok: true, totalRecords: 1, results: [data.notice] });
    }

    // Otherwise, perform a search with provided window (SAM requires a window)
    const params = new URLSearchParams();
    if (postedFrom) params.set('postedFrom', postedFrom);
    if (postedTo) params.set('postedTo', postedTo);
    params.set('limit', limit);

    const r = await fetch(`http://localhost:${process.env.PORT || 5050}/api/sam/search?${params.toString()}`);
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
    const searchResponse = await fetch(`http://localhost:${process.env.PORT || 5050}/api/sam/search?${new URLSearchParams({ q, naics, limit: '20' })}`);
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
      from: from || process.env.NOTIFY_FROM || process.env.SMTP_USER || 'noreply@example.com',
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
    const { email, password, username, hotelName, contactName } = req.body;
    
    // Use contactName as username if provided, otherwise fall back to username
    const displayName = contactName || username || hotelName;
    
    if (!email || !password || !displayName) {
      return fail(res, 400, 'Email, password, and contact name are required');
    }
    
    // Check if user already exists
    const existingUser = db.prepare(`SELECT id, email FROM users WHERE email = ?`).get(email);
    if (existingUser) {
      return fail(res, 400, 'A user with this email already exists. Please use the sign-in option or try a different email address.');
    }
    
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
    const passwordHash = hashPassword(password);
    const userResult = db.prepare(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, fedevent_account_number)
      VALUES (?, ?, ?, ?, 'hotel', ?)
    `).run(email, passwordHash, displayName, '', fedeventAccountNumber);
    
    const sessionId = createSession(userResult.lastInsertRowid);
    
    // Send welcome email if SMTP is configured
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const welcomeSubject = 'Welcome to FEDEVENT - Your Account is Ready';
      const welcomeHtml = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial; max-width:600px; margin:0 auto;">
          <div style="background:#1f2937; padding:2rem; text-align:center;">
            <h1 style="color:white; margin:0;">Welcome to FEDEVENT</h1>
            <p style="color:#d1d5db; margin:0.5rem 0 0;">Professional Government Event Solutions</p>
          </div>
          
          <div style="padding:2rem; background:#ffffff;">
            <h2 style="color:#1f2937; margin-top:0;">Hello ${displayName}!</h2>
            
            <p>Thank you for joining FEDEVENT! Your account is now active and ready to use. Here's what you can do:</p>
            
            <ul style="color:#374151; line-height:1.6;">
              <li>Complete your hotel profile to get matched with government contracts</li>
              <li>Access the hotel dashboard to manage your profile and bids</li>
              <li>Receive notifications about relevant contract opportunities</li>
              <li>Track your submissions and responses</li>
            </ul>
            
            <div style="margin:2rem 0; padding:1rem; background:#f3f4f6; border-radius:8px;">
              <p style="margin:0; color:#374151;"><strong>Your Account Details:</strong></p>
              <p style="margin:0.5rem 0 0; color:#6b7280;">Email: ${email}</p>
              <p style="margin:0.5rem 0 0; color:#6b7280;">Contact Name: ${displayName}</p>
              <p style="margin:0.5rem 0 0; color:#1f2937; font-weight:600;">FEDEVENT Account #: ${fedeventAccountNumber}</p>
            </div>
            
            <div style="text-align:center; margin:2rem 0;">
              <a href="https://fedevent.com/hotel-dashboard.html" 
                 style="background:#3b82f6; color:white; padding:12px 24px; text-decoration:none; border-radius:8px; display:inline-block;">
                Access Your Dashboard
              </a>
            </div>
            
            <p style="color:#6b7280; font-size:0.875rem;">
              Need help? Contact us at <a href="mailto:info@fedevent.com">info@fedevent.com</a> or call (305) 850-7848.
            </p>
          </div>
          
          <div style="background:#f9fafb; padding:1rem; text-align:center; color:#6b7280; font-size:0.875rem;">
            <p style="margin:0;">
              This email was sent because you created an account on FEDEVENT.
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

// Authenticated file upload for hotel profile registration
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No file uploaded');
    }

    // Prefer Render uploads path if present; otherwise local uploads
    const uploadsBase = (process.env.NODE_ENV === 'production' || process.env.RENDER)
      ? '/opt/render/project/src/uploads'
      : path.join(__dirname, 'uploads');

    // Build a public URL for the file
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
    
    const resetUrl = `${process.env.BASE_URL || 'http://localhost:5050'}/reset-password.html?token=${resetToken}`;
    
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
    const baseUrl = process.env.BASE_URL || 'http://localhost:5050';
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

  // Content stream (simple text)
  const text = [
    'BT',
    '/F1 12 Tf',
    '72 760 Td',
    `(CREATA Hotel Partner Terms of Participation - v${version}) Tj`,
    'T*',
    `(Hotel: ${hotelName}) Tj`,
    'T*',
    `(Representative: ${repName}) Tj`,
    'T*',
    `(Title: ${title}) Tj`,
    'T*',
    `(Email: ${email}) Tj`,
    'T*',
    `(Effective: ${effective}) Tj`,
    'T*',
    '(By signing electronically, you agree to the Terms shown on the website.) Tj',
    'ET'
  ].join('\n');
  const stream = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  const contentsId = addObj(stream);

  // Page
  const pageId = addObj(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /Contents ${contentsId} 0 R >>`);

  // Pages
  const pagesId = addObj(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);

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
            <p><a href="${process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 5050)}/approve-agreement.html?token=${token}">Click here to review and sign</a></p>
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
    const requiredFields = ['hotel_name', 'address', 'city', 'country', 'sales_director_name', 'sales_director_email', 'ar_name', 'ar_email'];
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
            <p><strong>Sales Director:</strong> ${data.sales_director_name || 'Not provided'} (${data.sales_director_email || 'No email'})</p>
            <p><strong>A/R Contact:</strong> ${data.ar_name || 'Not provided'} (${data.ar_email || 'No email'})</p>
            ${data.csm_name ? `<p><strong>CSM:</strong> ${data.csm_name} (${data.csm_email || 'No email'})</p>` : ''}
          </div>
          
          <div style="margin:2rem 0;">
            <a href="${process.env.BASE_URL || 'http://localhost:5050'}/admin-dashboard.html" 
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
      // Determine upload directory (same logic as multer storage)
      let uploadsDir = path.join(__dirname, 'uploads');
      if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
        const renderUploadDir = '/opt/render/project/src/uploads';
        if (fs.existsSync(renderUploadDir)) {
          uploadsDir = renderUploadDir;
        }
      }
      
      const attachmentDir = path.join(uploadsDir, 'requests', requestId);
      fs.mkdirSync(attachmentDir, { recursive: true });
      
      for (const file of req.files) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = path.join(attachmentDir, safeName);
        fs.writeFileSync(filePath, file.buffer);
      }
    }
    
    // Send confirmation email to requester
    if (transporter) {
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
        
        await transporter.sendMail({
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

// ---------- OpenAI API Endpoints ----------

// Code review endpoint
app.post('/api/openai/code-review', requireAuth, async (req, res) => {
  if (!openai) {
    return res.status(503).json({ 
      error: 'OpenAI service not available',
      message: 'OpenAI API key not configured'
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 1000,
      temperature: 0.3
    });

    const review = completion.choices[0]?.message?.content;
    
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 800,
      temperature: 0.3
    });

    const analysis = completion.choices[0]?.message?.content;
    
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 1200,
      temperature: 0.4
    });

    const proposal = completion.choices[0]?.message?.content;
    
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      max_tokens: 800,
      temperature: 0.7
    });

    const response = completion.choices[0]?.message?.content;
    
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

// ---------- Start Server ----------
const PORT = process.env.PORT || 5050;

// Run log rotation on startup
try {
  rotateLogs();
} catch (error) {
  console.warn('Log rotation failed on startup:', error.message);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FEDEVENT server running on port ${PORT}`);
  console.log(`📍 Admin login: http://localhost:${PORT}/admin-login.html`);
  console.log(`🏨 Hotel portal: http://localhost:${PORT}/hotel-login.html`);
  console.log(`🌐 Main site: http://localhost:${PORT}`);
});
