import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Connect to the database
const dbPath = join(__dirname, 'data', 'creata.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath);

// Check current sessions
console.log('\n=== Current Sessions ===');
const sessions = db.prepare(`
  SELECT id, user_id, expires_at, datetime('now') as now, 
         datetime(expires_at) as expires_datetime,
         datetime(expires_at) > datetime('now') as is_valid
  FROM sessions
`).all();

console.log('Session count:', sessions.length);
sessions.forEach((session, index) => {
  console.log(`\nSession ${index + 1}:`);
  console.log('  ID:', session.id);
  console.log('  User ID:', session.user_id);
  console.log('  Expires At:', session.expires_at);
  console.log('  Current Time:', session.now);
  console.log('  Expires Datetime:', session.expires_datetime);
  console.log('  Is Valid:', session.is_valid ? 'YES' : 'NO');
});

// Test the specific query that's used in getSessionUser
console.log('\n=== Testing getSessionUser Query ===');
if (sessions.length > 0) {
  const sessionId = sessions[0].id;
  console.log('Testing with session ID:', sessionId);
  
  // Original query (problematic)
  const originalQuery = db.prepare(`
    SELECT s.*, u.* FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `);
  const originalResult = originalQuery.get(sessionId);
  console.log('Original query result:', originalResult ? 'FOUND' : 'NOT FOUND');
  
  // Fixed query
  const fixedQuery = db.prepare(`
    SELECT s.*, u.* FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
  `);
  const fixedResult = fixedQuery.get(sessionId);
  console.log('Fixed query result:', fixedResult ? 'FOUND' : 'NOT FOUND');
}

// Check database schema for sessions table
console.log('\n=== Sessions Table Schema ===');
const schema = db.prepare("PRAGMA table_info(sessions)").all();
schema.forEach(column => {
  console.log(`  ${column.name} (${column.type}) ${column.notnull ? 'NOT NULL' : ''} ${column.pk ? 'PRIMARY KEY' : ''}`);
});

console.log('\n=== Debug Complete ===');