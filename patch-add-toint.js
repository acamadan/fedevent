import fs from 'fs';

const FILE = 'server.js';
let src = fs.readFileSync(FILE, 'utf8');

if (src.includes('function toInt(')) {
  console.log('✅ toInt() already exists — nothing to do.');
  process.exit(0);
}

const needle = 'function extractHotelFacts(';
const i = src.indexOf(needle);
if (i === -1) {
  console.error('❌ Could not find "function extractHotelFacts(" in server.js');
  process.exit(1);
}

const toIntFn = `function toInt(s) {
  if (!s) return null;
  const m = String(s).match(/-?\\d[\\d,]*/);
  return m ? parseInt(m[0].replace(/,/g,''), 10) : null;
}

// --- inserted helper above extractHotelFacts() ---
`;

src = src.slice(0, i) + toIntFn + src.slice(i);
fs.writeFileSync(FILE, src, 'utf8');
console.log('✅ Inserted toInt() above extractHotelFacts().');
