import 'dotenv/config';
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
import { guessFields } from "./scripts/guess-fields.js";
import { spawnSync } from 'child_process';

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
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
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

  // Rooms totals in narrative (“X guest rooms/keys”)
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
  const str = String(s).replace(/feet|ft|’|″|”/gi, "'").replace(/"/g, '"').trim();
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
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'data'),    { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- database ----------
const db = new Database(path.join(__dirname, 'data', 'creata.db'));

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
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS hotel_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    json TEXT NOT NULL,
    files_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ---------- uploads ----------
const allowed = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'image/png','image/jpeg','image/webp','image/tiff','image/bmp'
]);
function sanitizeFilename(name) {
  const base = path.basename(name);
  const parsed = path.parse(base);
  const safeName = parsed.name.normalize('NFKD').replace(/[^\w.-]+/g, '_');
  const ext = (parsed.ext || '').toLowerCase();
  return `${safeName}${ext}`;
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, 'uploads')),
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

// ---------- utils ----------
function ok(res, data={}) { return res.json({ ok: true, ...data }); }
function fail(res, code=400, error='Bad request', extra={}) { return res.status(code).json({ ok:false, error, ...extra }); }

async function sendMail({ to, subject, html, attachments = [] }) {
  if (!process.env.SMTP_HOST || !to) return { skipped: true };
  const tx = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
  await tx.sendMail({
    from: process.env.NOTIFY_FROM || process.env.SMTP_USER || 'noreply@example.com',
    to, subject, html, attachments
  });
  return { ok: true };
}

// ---------- endpoints ----------
app.get('/api/health', (_req, res) => ok(res, { scope: 'hotel-reg-form', ts: new Date().toISOString() }));

const DEV_AUTH = String(process.env.DEV_AUTH).toLowerCase() === 'true';
app.post('/api/signup', (_req, res) => {
  if (!DEV_AUTH) return fail(res, 501, 'Signup disabled');
  return ok(res, { devVerifyUrl: '/dev-verify/example' });
});
app.post('/api/signin', (req, res) => {
  if (!DEV_AUTH) return fail(res, 501, 'Signin disabled');
  const { user = 'guest' } = req.body || {};
  return ok(res, { user: { id: 1, username: user } });
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
fixRoomHeuristics(facts);
const fieldsKV = kvParse(raw);
const fieldsGuess = guessFields(raw);
const fields = { ...fieldsGuess, ...fieldsKV };
if (facts.total_guestrooms) fields.total_guestrooms = String(facts.total_guestrooms);
if (facts.total_meeting_space_sqft) fields.total_meeting_space_sqft = String(facts.total_meeting_space_sqft);
if (!Object.keys(fieldsKV).length) {
  console.log('[autofill] no KV labels found; OCR preview:', raw.slice(0, 800));
}
    if (facts.total_guestrooms) fields.total_guestrooms = String(facts.total_guestrooms);
    if (facts.total_meeting_space_sqft) fields.total_meeting_space_sqft = String(facts.total_meeting_space_sqft);

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
    if ((data.accepts_net30 || '').toLowerCase() !== 'yes') {
      return fail(res, 400, 'NET30 is required to submit.');
    }

    const ins = db.prepare(`INSERT INTO hotel_profiles (json, files_json) VALUES (?, ?)`);
    const info = ins.run(JSON.stringify(data), JSON.stringify(files));
    const hotelId = Number(info.lastInsertRowid);

    const name    = data.hotel_name || '';
    const email   = data.sales_director_email || data.ar_email || '';
    const city    = data.city || '';
    const state   = data.state || '';
    const country = data.country || '';
    if (name) {
      db.prepare(`INSERT INTO hotels (name, email, city, state, country, tags) VALUES (?,?,?,?,?,?)`)
        .run(name, email, city, state, country, 'reg-form');
    }

    if (process.env.NOTIFY_TO && process.env.SMTP_HOST) {
      const subject = `New hotel profile #${hotelId} – ${name || '(unnamed)'}`;
      const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
          <h2>New Hotel Profile Submitted</h2>
          <p><b>ID:</b> ${hotelId}</p>
          <p><b>Hotel:</b> ${name || '(unnamed)'}<br/>
             <b>City:</b> ${city} ${state ? ',' : ''} ${state} ${country ? '('+country+')' : ''}</p>
          <p><b>Sales Dir Email:</b> ${email || '(none)'} </p>
          <hr/>
          <pre style="white-space:pre-wrap;background:#f7f9fc;padding:10px;border-radius:8px">${JSON.stringify(data,null,2)}</pre>
        </div>`;
      try {
        await sendMail({
          to: process.env.NOTIFY_TO,
          subject,
          html,
          attachments: files.slice(0,8).map(f => ({ filename: path.basename(f.path), path: f.path }))
        });
      } catch (mailErr) {
        console.warn('notify email failed (continuing):', mailErr?.message || mailErr);
      }
    }

    return ok(res, { hotelId });
  } catch (e) {
    console.error('submit error:', e);
    return fail(res, 500, 'Submit failed');
  }
});

// ---------- start ----------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`CREATA hotel form running at http://localhost:${port}`);
});
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
