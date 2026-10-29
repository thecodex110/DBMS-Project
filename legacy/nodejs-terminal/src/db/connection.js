'use strict';
// ============================================================================
//  DATABASE CONNECTION LAYER
//  Every module talks to SQLite ONLY through the helpers exported here.
//    all()  -> SELECT returning many rows
//    get()  -> SELECT returning one row
//    run()  -> INSERT / UPDATE / DELETE  (returns { changes, lastInsertRowid })
//    exec() -> run a multi-statement SQL script
//    transaction(fn) -> BEGIN ... COMMIT, or ROLLBACK if fn throws (atomicity)
// ============================================================================
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SQL_DIR = path.join(ROOT, 'sql');
const DB_PATH = process.env.CAAMS_DB || path.join(ROOT, 'data', 'college.db');

let db = null;

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  // SQLite keeps foreign-key enforcement OFF by default -> switch it on per connection
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

function getDb() {
  return db || open();
}

// node:sqlite cannot bind `undefined` or booleans -> normalise parameters
function clean(params) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));
}

function all(sql, ...params) {
  return getDb().prepare(sql).all(...clean(params));
}

function get(sql, ...params) {
  return getDb().prepare(sql).get(...clean(params));
}

function run(sql, ...params) {
  return getDb().prepare(sql).run(...clean(params));
}

function exec(sql) {
  getDb().exec(sql);
}

function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

function runSqlFile(fileName) {
  exec(fs.readFileSync(path.join(SQL_DIR, fileName), 'utf8'));
}

function isInitialized() {
  return !!get("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'student'");
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

function deleteDatabaseFiles() {
  close();
  for (const suffix of ['', '-journal', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
}

module.exports = {
  ROOT, SQL_DIR, DB_PATH,
  getDb, all, get, run, exec, transaction, runSqlFile, isInitialized, close, deleteDatabaseFiles,
};
