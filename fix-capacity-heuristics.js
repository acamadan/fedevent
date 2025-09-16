import fs from 'fs';

const file = 'server.js';
let src = fs.readFileSync(file, 'utf8');

const pattern = /const nums = \(after\.match\([^)]*\) \|\| \[\]\)\.map\(v => v\.replace\(\/,\/g,''\)\);\s*if \(nums\.length < 2\) continue;\s*const length_ft = toFloatFeet\(dimMatch\[1\]\);\s*const width_ft\s+= toFloatFeet\(dimMatch\[2\]\);\s*const row = \{\s*name: before,\s*dimensions: \{ length_ft, width_ft \},\s*sqft: toInt\(nums\[0\]\),\s*ceiling_ft: toFloatFeet\(nums\[1\]\),\s*capacities: \{\}\s*\};\s*const caps = \['reception','banquet','theater','schoolroom','conference','u_shape','hollow_square'\];\s*for \(let k = 0; k < caps\.length; k\+\+\) \{\s*if \(nums\[2 \+ k\]\) row\.capacities\[caps\[k\]\] = toInt\(nums\[2 \+ k\]\);\s*\}/s;

const replacement = `
const rawNums = (after.match(/-?\\d[\\d,.]*/g) || []);
const nums = rawNums.map(v => v.replace(/,/g, ''));
const vals = nums.map(v => parseFloat(v));

const length_ft = toFloatFeet(dimMatch[1]);
const width_ft  = toFloatFeet(dimMatch[2]);

// Heuristics:
// - sqft = first number >= 300 (or containing a comma originally)
// - ceiling = first number in 7..40 (feet)
// Capacities begin right after whichever of (sqft, ceiling) appears last
let sqftIdx = vals.findIndex(v => v >= 300);
if (sqftIdx === -1) {
  // try any number >= 200 if no big one found
  sqftIdx = vals.findIndex(v => v >= 200);
}
let ceilIdx = vals.findIndex(v => v > 6 && v <= 40);

// Build row with safe defaults
const row = {
  name: before,
  dimensions: { length_ft, width_ft },
  sqft:  (sqftIdx >= 0 ? toInt(nums[sqftIdx]) : null),
  ceiling_ft: (ceilIdx >= 0 ? toFloatFeet(nums[ceilIdx]) : null),
  capacities: {}
};

const lastIdx = Math.max(sqftIdx, ceilIdx);
const capStart = (lastIdx >= 0 ? lastIdx + 1 : 0);
const caps = ['reception','banquet','theater','schoolroom','conference','u_shape','hollow_square'];

// Map capacities in order from capStart forward
for (let i = 0; i < caps.length; i++) {
  const n = nums[capStart + i];
  if (n != null) row.capacities[caps[i]] = toInt(n);
}
`;

if (!pattern.test(src)) {
  console.error('❌ Could not locate the old capacity parsing block. No changes made.');
  process.exit(1);
}
src = src.replace(pattern, replacement);
fs.writeFileSync(file, src, 'utf8');
console.log('✅ Updated capacity parsing heuristics in server.js');
