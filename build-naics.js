
import fs from 'fs';
import path from 'path';

function looksLikeCode(val){
  const s = String(val || '').trim();
  // 2–6 digits (official NAICS are usually 2,3,4,5,6-digit codes)
  return /^[0-9]{2,6}$/.test(s);
}

function pickTitle(obj){
  // Try common header names first
  const pref = [
    'Title','NAICS Title','Industry Title','Description','2017 NAICS US Title','2022 NAICS US Title','2017 Title','2022 Title'
  ];
  for (const k of pref){
    if (obj[k] && String(obj[k]).trim()) return String(obj[k]).trim();
  }
  // Otherwise pick the first longish text field
  for (const [k,v] of Object.entries(obj)){
    const s = String(v||'').trim();
    if (s && !looksLikeCode(s) && /[A-Za-z]/.test(s) && s.length >= 3) return s;
  }
  return '';
}

async function fromCSV(csvPath){
  const { parse } = await import('csv-parse/sync');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const recs = parse(raw, { columns: true, skip_empty_lines: true });
  const out = [];
  for (const r of recs){
    // Try common code headers first
    const candidates = [
      r.code, r.Code, r.NAICS, r['NAICS Code'], r['Naics Code'], r['2017 NAICS US Code'], r['2022 NAICS US Code']
    ];
    // Or scan all columns for a 2–6 digit code
    let code = (candidates.find(looksLikeCode) || '');
    if (!code){
      for (const v of Object.values(r)){ if (looksLikeCode(v)){ code = String(v).trim(); break; } }
    }
    const title = pickTitle(r);
    if (code && title) out.push({ code, title });
  }
  return out;
}

async function fromXLSX(xlsxPath){
  const XLSXmod = await import('xlsx');
  const XLSX = XLSXmod.default || XLSXmod;  // works in ESM
  const wb = XLSX.readFile(xlsxPath);
  const out = [];
  for (const name of wb.SheetNames){
    const sheet = wb.Sheets[name];
    const recs = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    for (const r of recs){
      const candidates = [
        r.code, r.Code, r.NAICS, r['NAICS Code'], r['Naics Code'], r['2017 NAICS US Code'], r['2022 NAICS US Code']
      ];
      let code = (candidates.find(looksLikeCode) || '');
      if (!code){
        for (const v of Object.values(r)){ if (looksLikeCode(v)){ code = String(v).trim(); break; } }
      }
      const title = pickTitle(r);
      if (code && title) out.push({ code, title });
    }
  }
  return out;
}

async function main(){
  const csv = path.resolve('data/naics.csv');
  const xlsx = path.resolve('data/naics.xlsx');
  let list = [];

  if (fs.existsSync(csv)){
    console.log('Building NAICS from CSV:', csv);
    list = await fromCSV(csv);
  } else if (fs.existsSync(xlsx)){
    console.log('Building NAICS from XLSX:', xlsx);
    list = await fromXLSX(xlsx);
  } else {
    console.error('Place NAICS file at data/naics.csv OR data/naics.xlsx, then run: npm run build:naics');
    process.exit(1);
  }

  // de-dup and sort
  const seen = new Set();
  list = list.filter(x=>{
    const k = `${x.code}|${x.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a,b)=> a.code.localeCompare(b.code));

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/naics.json', JSON.stringify(list, null, 2));
  console.log(`Wrote ${list.length} entries to data/naics.json`);
  console.log('Restart the server to reload NAICS.');
}

main().catch(e=>{ console.error(e); process.exit(1); });

