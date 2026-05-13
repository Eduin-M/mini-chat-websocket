const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./chat.db");

db.serialize(() => {
    db.run("PRAGMA journal_mode = WAL");

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        room TEXT NOT NULL DEFAULT 'general',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(
        "CREATE INDEX IF NOT EXISTS idx_messages_room_timestamp ON messages(room, timestamp)"
    );

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
    )`);
});

module.exports = db;
