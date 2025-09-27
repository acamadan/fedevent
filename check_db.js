import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'data', 'creata.db'));

console.log('Database tables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(table => {
  console.log('- ' + table.name);
});

console.log('\nUsers table schema:');
const userSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
console.log(userSchema ? userSchema.sql : 'Table not found');

console.log('\nHotels table schema:');
const hotelSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='hotels'").get();
console.log(hotelSchema ? hotelSchema.sql : 'Table not found');

console.log('\nExisting users:');
const users = db.prepare('SELECT * FROM users').all();
users.forEach(user => {
  console.log('- ' + user.email + ' (' + user.role + ')');
});