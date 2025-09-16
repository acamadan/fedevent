import fs from 'fs';

const file = 'server.js';
let src = fs.readFileSync(file, 'utf8');

// New extractHotelFacts implementation
const NEW_FN = `
function extractHotelFacts(text) {
  const facts = {
    total_guestrooms: null,
    total_meeting_space_sqft: null,
    meeting_rooms: []
  };

  const lines = normalizeText(text).split(/\\n/).map(s => s.trim()).filter(Boolean);

  // overall stats
  for (const ln of lines) {
    if (facts.total_guestrooms == null) {
      const mG =
        ln.match(/\\b(\\d{2,4})\\s*(?:guest\\s*rooms|guestrooms|rooms)\\b/i) ||
        ln.match(/\\brooms?\\s*[:\\-]\\s*(\\d{2,4})\\b/i);
      if (mG) facts.total_guestrooms = toInt(mG[1]);
    }
    if (facts.total_meeting_space_sqft == null) {
      const mM =
        ln.match(/\\b([\\d,]+)\\s*(?:sq\\.??\\s*ft|square\\s*feet|sf)\\b.*\\b(meeting|event)\\b.*\\b(space|area)\\b/i) ||
        ln.match(/\\btotal\\s*(meeting|event)\\s*(space|area)\\s*[:\\-]\\s*([\\d,]+)\\s*(sq\\.??\\s*ft|sf)\\b/i);
      if (mM) {
        const n = mM[1] || mM[3];
        facts.total_meeting_space_sqft = toInt(n);
      }
    }
  }

  // bullet-style: "• Room - 3,456 sq. ft."
  for (const ln of lines) {
    const m = ln.match(/^[•\\-—*]?\\s*([A-Za-z0-9 .&'()\\/+-]+?)\\s*[-–—]\\s*([\\d,]+)\\s*(?:sq\\.??\\s*ft|sf)\\b/i);
    if (m) {
      const name = m[1].trim().replace(/\\s{2,}/g,' ');
      const sqft = toInt(m[2]);
      const existing = facts.meeting_rooms.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (existing) existing.sqft = existing.sqft || sqft;
      else facts.meeting_rooms.push({ name, dimensions:null, sqft, ceiling_ft:null, capacities:{} });
      continue;
    }
  }

  // capacity chart rows:
  // "<name> .... 27 x 51 ... 17  1,377  87 168 46 140 ..."
  for (const ln of lines) {
    const dimMatch = ln.match(/(\\d+(?:\\.\\d+)?\\s*'?)[\\s×xX]\\s*(\\d+(?:\\.\\d+)?\\s*'?)/);
    if (!dimMatch) continue;

    const before = ln.slice(0, dimMatch.index).trim().replace(/\\s{2,}/g,' ');
    if (!before || before.length < 3) continue;

    const after = ln.slice(dimMatch.index + dimMatch[0].length).trim();
    const rawNums = (after.match(/-?\\d[\\d,.]*/g) || []);
    const nums = rawNums.map(v => v.replace(/,/g,''));
    const vals = nums.map(v => parseFloat(v));

    if (nums.length === 0) continue;

    const length_ft = toFloatFeet(dimMatch[1]);
    const width_ft  = toFloatFeet(dimMatch[2]);

    // Heuristics:
    // - sqft: first number >= 300 (or >=200 as fallback)
    // - ceiling_ft: first number 7..40
    // Use the one that appears *after* the other as start for capacities.
    let sqftIdx = vals.findIndex(v => v >= 300);
    if (sqftIdx === -1) sqftIdx = vals.findIndex(v => v >= 200);

    let ceilIdx = vals.findIndex(v => v > 6 && v <= 40);

    const row = {
      name: before,
      dimensions: { length_ft, width_ft },
      sqft: (sqftIdx >= 0 ? toInt(nums[sqftIdx]) : null),
      ceiling_ft: (ceilIdx >= 0 ? toFloatFeet(nums[ceilIdx]) : null),
      capacities: {}
    };

    const lastIdx = Math.max(sqftIdx, ceilIdx);
    const capStart = (lastIdx >= 0 ? lastIdx + 1 : 0);
    const caps = ['reception','banquet','theater','schoolroom','conference','u_shape','hollow_square'];

    for (let i = 0; i < caps.length; i++) {
      const n = nums[capStart + i];
      if (n != null) row.capacities[caps[i]] = toInt(n);
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

// Replace the whole function body
const fnRegex = /function\\s+extractHotelFacts\\s*\\(text\\)\\s*{[\\s\\S]*?}\\s*/m;

if (!fnRegex.test(src)) {
  console.error('❌ Could not find function extractHotelFacts(text) in server.js');
  process.exit(1);
}

src = src.replace(fnRegex, NEW_FN + '\n');
fs.writeFileSync(file, src, 'utf8');
console.log('✅ Replaced extractHotelFacts() in server.js');
