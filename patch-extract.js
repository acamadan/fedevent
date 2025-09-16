import fs from 'fs';

const file = 'server.js';
const src = fs.readFileSync(file, 'utf8');

const startTag = 'function extractHotelFacts(';
const endTag   = '\nfunction normalizeText';

const start = src.indexOf(startTag);
if (start === -1) {
  console.error('❌ Could not find "function extractHotelFacts(" in server.js');
  process.exit(1);
}
const end = src.indexOf(endTag, start);
if (end === -1) {
  console.error('❌ Could not find "function normalizeText" after extractHotelFacts in server.js');
  process.exit(1);
}

const before = src.slice(0, start);
const after  = src.slice(end);

const replacement = `function extractHotelFacts(text) {
  const facts = {
    total_guestrooms: null,
    total_meeting_space_sqft: null,
    meeting_rooms: [] // { name, dimensions:{length_ft,width_ft}, sqft, ceiling_ft, capacities:{} }
  };

  const lines = normalizeText(text).split(/\\n/).map(s => s.trim()).filter(Boolean);

  // overall stats (tries multiple phrasings)
  for (const ln of lines) {
    if (facts.total_guestrooms == null) {
      const mG =
        ln.match(/\\b(\\d{2,4})\\s*(?:guest\\s*rooms|guestrooms|rooms)\\b/i) ||
        ln.match(/\\brooms?\\s*[:\\-]\\s*(\\d{2,4})\\b/i);
      if (mG) facts.total_guestrooms = toInt(mG[1]);
    }
    if (facts.total_meeting_space_sqft == null) {
      const mM =
        ln.match(/\\b([\\d,]+)\\s*(?:sq\\.?\\s*ft|square\\s*feet|sf)\\b.*\\b(meeting|event)\\b.*\\b(space|area)\\b/i) ||
        ln.match(/\\btotal\\s*(meeting|event)\\s*(space|area)\\s*[:\\-]\\s*([\\d,]+)\\s*(sq\\.?\\s*ft|sf)\\b/i);
      if (mM) {
        const n = mM[1] || mM[3];
        facts.total_meeting_space_sqft = toInt(n);
      }
    }
  }

  // bullet-style: "• Grand Ballroom - 3,456 sq. ft."
  for (const ln of lines) {
    const m = ln.match(/^[•\\-—*]?\\s*([A-Za-z0-9 .&'()\\/+-]+?)\\s*[-–—]\\s*([\\d,]+)\\s*(?:sq\\.?\\s*ft|sf)\\b/i);
    if (m) {
      const name = m[1].trim().replace(/\\s{2,}/g,' ');
      const sqft = toInt(m[2]);
      const existing = facts.meeting_rooms.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (existing) existing.sqft = existing.sqft || sqft;
      else facts.meeting_rooms.push({ name, dimensions:null, sqft, ceiling_ft:null, capacities:{} });
      continue;
    }
  }

  // table-like rows with dimensions + numbers (often Height comes before Area)
  for (const ln of lines) {
    // common formats: 53' x 94'  |  53 x 94  |  53′ × 94′
    const dimMatch = ln.match(/(\\d+(?:\\.\\d+)?\\s*'?)[\\s×xX]\\s*(\\d+(?:\\.\\d+)?\\s*'?)/);
    if (!dimMatch) continue;

    const before = ln.slice(0, dimMatch.index).trim().replace(/\\s{2,}/g,' ');
    if (!before || before.length < 3) continue;

    // collect numeric-ish tokens after dims; remove N/A and 8x10 style booth tokens
    const after = ln.slice(dimMatch.index + dimMatch[0].length).trim();
    const tokens = (after
      .replace(/\\bN\\/A\\b/gi,' ')
      .match(/\\d[\\d,\\.*/-]*/g) || [])
      .map(v => v.replace(/,/g,''))
      .map(v => v.replace(/\\*.*$/, ''))
      .filter(Boolean);

    if (tokens.length < 2) continue;

    // Heuristic:
    // - In many hotel sheets, the first token is HEIGHT (ft), second token is AREA (sq ft).
    // - Sometimes area sneaks first; pick HEIGHT as something in ~6–45 ft, AREA as >= 200.
    const firstThree = tokens.slice(0, 3);
    let ceil = null, area = null;

    // try height first from the very first token
    if (ceil == null) {
      const v0 = toFloatFeet(firstThree[0]);
      if (v0 != null && v0 >= 6 && v0 <= 45) ceil = v0;
    }
    // try area among first three (>= 200 sq ft)
    for (const t of firstThree) {
      const vi = toInt(t);
      if (vi != null && vi >= 200) { area = vi; break; }
    }
    // fallbacks
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

    // capacities usually start after first two tokens (Ht, Area)
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
`;

const newSrc = before + replacement + after;
fs.writeFileSync(file, newSrc, 'utf8');
console.log('✅ Replaced extractHotelFacts() successfully.');
