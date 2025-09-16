import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import nodemailer from 'nodemailer';

// --- ensure folders exist ---
fs.mkdirSync('./uploads', { recursive: true });
fs.mkdirSync('./data', { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());
app.use('/', express.static('./public'));
app.use('/uploads', express.static('./uploads'));

// --- DB ---
const db = new Database('./data/creata.db');
db.exec(`
create table if not exists hotels (
  id integer primary key autoincrement,
  name text not null,
  email text,
  city text,
  state text,
  country text,
  tags text,
  created_at text default (datetime('now'))
);
`);

// --- auth disabled (no token) ---
function auth(_req, _res, next) { return next(); }

// --- uploads ---
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, './uploads'),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g,'_')}`)
});
const upload = multer({ storage });

// --- SAM.gov search: real if key present, else stub ---
app.get('/api/sam/search', auth, async (req, res) => {
  try {
    const { q = '', naics = '', state = '', postedFrom = '', postedTo = '', limit = '25', page = '0' } = req.query;

    if (!process.env.SAM_API_KEY) {
      const seed = (q + state + naics) || 'Event';
      const results = [
        { notice_number:'SAM-001', agency:'DOS', state: state || 'FL', deadline:'2025-09-01', title:`${seed} Support Services`, url:'https://sam.gov/opportunity/1' },
        { notice_number:'SAM-002', agency:'HHS', state: state || 'VA', deadline:'2025-09-15', title:`${seed} Conference & Lodging`, url:'https://sam.gov/opportunity/2' }
      ];
      return res.json({ ok:true, total: results.length, page: 0, limit: results.length, results });
    }

    const params = new URLSearchParams();
    params.set('api_key', process.env.SAM_API_KEY);
    if (q) params.set('q', q);
    if (naics) params.set('naics', naics);
    if (state) params.set('place_of_performance_state', state);
    if (postedFrom) params.set('postedFrom', postedFrom);
    if (postedTo) params.set('postedTo', postedTo);
    params.set('limit', limit);
    params.set('page', page);

    const url = `https://api.sam.gov/prod/opportunities/v2/search?${params.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ ok:false, error:`SAM.gov error ${resp.status}`, detail: text });
    }
    const data = await resp.json();
    const items = (data.opportunitiesData || []).map(r => ({
      notice_number: r.noticeId || r.noticeNumber || '',
      agency: r.department || r.agency || r.departmentName || '',
      state: (r.placeOfPerformance && r.placeOfPerformance.state) || r.placeOfPerformanceState || '',
      deadline: r.responseDeadLine || r.responseDate || r.archiveDate || '',
      title: r.title || r.description || '',
      url: r.uiLink || r.link || ''
    }));
    return res.json({ ok:true, total: data.totalRecords || items.length, page: Number(page)||0, limit: Number(limit)||items.length, results: items });
  } catch (err) {
    console.error('SAM search failed:', err);
    return res.status(500).json({ ok:false, error:'Server error during SAM search' });
  }
});

// --- Hotels ---
app.get('/api/hotels', auth, (_req, res) => {
  const rows = db.prepare('select * from hotels order by id desc').all();
  res.json({ ok:true, hotels: rows });
});
app.post('/api/hotels', auth, (req, res) => {
  const { name, email, city, state, country, tags = '' } = req.body || {};
  if (!name) return res.status(400).json({ ok:false, error:'name required' });
  const info = db.prepare('insert into hotels(name,email,city,state,country,tags) values (?,?,?,?,?,?)')
    .run(name, email, city, state, country, tags);
  res.json({ ok:true, id: info.lastInsertRowid });
});

// --- Outreach uploads & send ---
app.post('/api/outreach/upload', auth, upload.array('files', 10), (req, res) => {
  const files = (req.files || []).map(f => ({ name: f.originalname, path: f.path }));
  res.json({ ok:true, files });
});
app.post('/api/outreach/send', auth, async (req, res) => {
  const { subject = '', body_html = '', hotelIds = [], attachmentPaths = [] } = req.body || {};
  const attachments = attachmentPaths.map(p => ({ filename: path.basename(p), path: p }));
  let sent = 0;
  for (const id of hotelIds) {
    const h = db.prepare('select * from hotels where id=?').get(id);
    if (!h || !h.email) continue;
    await sendMail({ to: h.email, subject, html: body_html, attachments });
    sent++;
  }
  res.json({ ok:true, sent });
});

// --- AI endpoints (optional) ---
app.post('/api/ai/summarize', auth, async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ ok:false, error:'Missing OPENAI_API_KEY' });
    const { title = '', agency = '', state = '', deadline = '', description = '' } = req.body || {};
    const prompt = `
Summarize the following opportunity for a hotel outreach brief. Keep it 120-180 words.
Include: agency, state, deadline/dates, requirements if present. Then 3-5 action bullets.
Title: ${title}
Agency: ${agency}
State: ${state}
Deadline: ${deadline}
Description: ${description}`.trim();

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4 })
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || 'No summary.';
    res.json({ ok:true, summary: text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'AI summarize failed' });
  }
});

app.post('/api/ai/outreach-email', auth, async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ ok:false, error:'Missing OPENAI_API_KEY' });
    const { company='CREATA Global', contact='CREATA Sourcing', brief='', net30=true } = req.body || {};
    const prompt = `
Draft a professional outreach email to hotels requesting a proposal based on the brief below.
<=220 words, clear bullets, include requested info (dates, rooms, space, concessions, cutoff, taxes/fees).
${net30 ? 'Include a line: Payment terms NET30 upon PO and invoice acceptance.' : ''}
Company: ${company}
From: ${contact}
Brief:
${brief}`.trim();

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.5 })
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || 'No draft.';
    res.json({ ok:true, email_html: text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'AI email draft failed' });
  }
});

// --- health ---
app.get('/api/health', (_req, res) => res.json({ ok:true }));

// --- start ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('CREATA full system running on ' + port));

// --- email helper ---
async function sendMail({ to, subject, html, attachments = [] }) {
  if (!process.env.SMTP_HOST || !to) return { skipped: true };
  const tx = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  await tx.sendMail({
    from: process.env.NOTIFY_FROM || process.env.SMTP_USER || 'noreply@yourdomain.com',
    to, subject, html, attachments
  });
  return { ok: true };
}

