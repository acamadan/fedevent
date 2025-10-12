#!/usr/bin/env node
/**
 * View all hotel leads collected from prelaunch page
 */

import Database from 'better-sqlite3';

const db = new Database('./data/creata.db');

try {
  const leads = db.prepare(`
    SELECT 
      user_code,
      hotel_name,
      hotel_address,
      hotel_phone,
      city,
      state,
      contact_name,
      title,
      email,
      phone,
      currently_operating,
      accept_net30,
      accept_direct_bill,
      interests,
      datetime(created_at, 'localtime') as submitted_at
    FROM hotel_leads 
    ORDER BY created_at DESC
  `).all();

  if (leads.length === 0) {
    console.log('📭 No leads yet. Share your landing page to start collecting!');
    console.log('\n🔗 Landing Page: http://localhost:7777/prelaunch.html\n');
  } else {
    console.log('\n🎯 FEDEVENT PRELAUNCH LEADS\n');
    console.table(leads);
    console.log(`\n📊 Total Leads: ${leads.length}`);
    
    // Show breakdown by state
    const byState = {};
    leads.forEach(lead => {
      byState[lead.state] = (byState[lead.state] || 0) + 1;
    });
    
    console.log('\n📍 Leads by State:');
    Object.entries(byState)
      .sort((a, b) => b[1] - a[1])
      .forEach(([state, count]) => {
        console.log(`   ${state}: ${count}`);
      });
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n💡 Make sure the server has been started at least once to create the database.');
}

db.close();

