const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'pokecardex.db');

// sql.js is WebAssembly-based, no native compilation needed
let db;
let SQL;

async function initDB() {
  if (db) return db;
  
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  // Load existing DB from file if it exists
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      avatar TEXT DEFAULT 'pikachu',
      trainer_level INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      card_image TEXT,
      card_set TEXT,
      card_rarity TEXT,
      card_price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      condition TEXT DEFAULT 'Near Mint',
      notes TEXT,
      added_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, card_id)
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cache_key ON api_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_cache_date ON api_cache(cached_at);


    CREATE INDEX IF NOT EXISTS idx_collection_user ON user_collection(user_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_user ON refresh_tokens(user_id);
  `);

  persist();
  console.log('✅ Database initialized');
  return db;
}

// Persist DB to disk after every write
function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// Helper: run a single query (INSERT/UPDATE/DELETE)
function run(sql, params = []) {
  db.run(sql, params);
  persist();
  // Get last insert rowid
  const result = db.exec('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: result[0]?.values[0]?.[0] ?? null, changes: db.getRowsModified() };
}

// Helper: get one row
function get(sql, params = []) {
  const result = db.exec(sql, params);
  if (!result.length || !result[0].values.length) return null;
  const cols = result[0].columns;
  const vals = result[0].values[0];
  return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
}

// Helper: get all rows
function all(sql, params = []) {
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

module.exports = { initDB, run, get, all, persist };
