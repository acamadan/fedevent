import fs from 'fs';

const file = 'server.js';
const src = fs.readFileSync(file, 'utf8');

const START = '// capacity chart / table-like rows';
const END   = '// de-dup by name';

const i = src.indexOf(START);
if (i === -1) {
  console.error('❌ Start marker not found:', START);
  process.exit(1);
}
const j = src.indexOf(END, i);
if (j === -1) {
  console.error('❌ End marker not found:', END);
  process.exit(1);
}

const replacement = `// capacity chart / table-like rows with dimensions + numbers (Height comes before Area in many sheets)
for (const ln of lines) {
  const dimMatch = ln.match(/(\\d+(?:\\.\\d+)?\\s*'?)[\\s×xX]\\s*(\\d+(?:\\.\\d+)?\\s*'?)/);
  if (!dimMatch) continue;

  const before = ln.slice(0, dimMatch.index).trim().replace(/\\s{2,}/g,' ');
  if (!before || before.length < 3) continue;

  const after = ln.slice(dimMatch.index + dimMatch[0].length).trim();

  // strip N/A tokens and grab numbers in order as they appear after dims
  const nums = (after.replace(/\\bN\\/A\\b/gi,'').match(/\\d[\\d,\\.*/-]*/g) || [])
    .map(v => v.replace(/,/g,''))
    .map(v => v.replace(/\\*.*$/, '')); // drop "8x10 booths" tails etc.

  if (nums.length < 2) continue;

  // Heuristics: many charts list Height then Area.
  // Choose 'area' as the largest number among the first 3 tokens (>= 200),
  // and 'ceil' as a plausible height (6–45 ft) among the first 3.
  const firstThree = nums.slice(0, 3);
  let area = null, ceil = null;

  for (const n of firstThree) {
    const vi = toInt(n);
    const vf = toFloatFeet(n);
    if (vi != null && vi >= 200 && area == null) area = vi;
    if (vf != null && vf >= 6 && vf <= 45 && ceil == null) ceil = vf;
  }

  // Fallbacks if the above didn’t find both
  if (area == null) area = toInt(firstThree[1] ?? firstThree[0]);
  if (ceil == null) ceil = toFloatFeet(firstThree[0] ?? firstThree[1]);

  const length_ft = toFloatFeet(dimMatch[1]);
  const width_ft  = toFloatFeet(dimMatch[2]);

  const row = {
    name: before,
    dimensions: { length_ft, width_ft },
    sqft: area || null,
    ceiling_ft: ceil || null,
    capacities: {}
  };

  // Capacities usually start after the first two tokens (Ht, Area)
  const capNums = nums.slice(2);
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
`;

const out =
  src.slice(0, i) + START + '\n' + replacement + '\n' + END + src.slice(j + END.length);

fs.writeFileSync(file, out, 'utf8');
console.log('✅ Parser block patched.');
