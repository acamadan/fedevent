#!/usr/bin/env node

// Replicate the exact logic used in the per diem results page
import 'dotenv/config';

console.log('Replicating Per Diem Results Page Logic');
console.log('=====================================');

async function fetchPerDiemOnce(params) {
  const url = new URL('http://localhost:7070/api/perdiem');
  if (params.state) url.searchParams.set('state', params.state);
  if (params.city) url.searchParams.set('city', params.city);
  if (params.zip) url.searchParams.set('zip', params.zip);
  if (params.year) url.searchParams.set('year', params.year);
  if (params.month) url.searchParams.set('month', params.month);
  
  console.log('Fetching:', url.toString());
  
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('API error');
  return res.json();
}

async function replicateLoadPerDiemData() {
  const q = {
    state: 'MT',
    city: '',
    zip: '',
    year: '2025'
  };
  
  console.log('Parameters:', q);

  const months = Array.from({length:12}, (_,i)=>String(i+1).padStart(2,'0'));
  const monthToRowsMap = {};

  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    try {
      console.log(`Fetching data for month ${m}...`);
      const data = await fetchPerDiemOnce({ state: q.state, city: q.city, zip: q.zip, year: q.year, month: m });
      const rows = Array.isArray(data?.rows) ? data.rows : (data ? [data] : []);
      monthToRowsMap[m] = rows;
      console.log(`Month ${m}: ${rows.length} rows`);
    } catch (e) {
      console.log(`Error for month ${m}:`, e.message);
      monthToRowsMap[m] = [];
    }
  }

  // Display the results
  console.log('\n=== Month to Rows Mapping ===');
  for (const [month, rows] of Object.entries(monthToRowsMap)) {
    console.log(`Month ${month}:`);
    rows.forEach(row => {
      console.log(`  ${row.location}: $${row.lodging} lodging, $${row.mie} M&IE`);
    });
  }
  
  // Collect all unique locations
  const locationSet = new Set();
  Object.values(monthToRowsMap).forEach(m => m.forEach(r => locationSet.add(r.location || '—')));
  const allLocations = Array.from(locationSet).sort((a,b)=>a.localeCompare(b));
  
  console.log('\n=== All Locations ===');
  allLocations.forEach(loc => console.log(`  ${loc}`));
  
  // Display in table format
  console.log('\n=== Table Format ===');
  console.log('Location\t\t\t\t\t', months.map(m => `${m} FY${getFiscalYear(q.year, m)}`).join('\t'));
  
  allLocations.forEach(loc => {
    const row = months.map(m => {
      const data = (monthToRowsMap[m] || []).find(r => (r.location || '—') === loc) || null;
      return data ? `$${Number(data.lodging || 0).toFixed(2)}` : '';
    });
    console.log(`${loc.padEnd(40)}\t${row.join('\t')}`);
  });
}

function getFiscalYear(year, month) {
  const monthNum = parseInt(month, 10);
  // Federal fiscal year starts October 1st
  // October-December belong to the next fiscal year
  // January-September belong to the current fiscal year
  if (monthNum >= 10) {
    return parseInt(year) + 1; // October-December belong to next fiscal year
  } else {
    return parseInt(year); // January-September belong to current fiscal year
  }
}

// Run the replication
replicateLoadPerDiemData().catch(console.error);