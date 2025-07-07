const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./chat.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        room TEXT NOT NULL DEFAULT 'general',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
    )`);
});
const bcrypt = require('bcrypt');
const hash = bcrypt.hashSync('admin', 10);
db.run(`INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)`, ['admin', hash]);
module.exports = db;