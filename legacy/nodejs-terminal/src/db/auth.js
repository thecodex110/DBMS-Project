'use strict';
// ============================================================================
//  AUTHENTICATION  - passwords are never stored in plain text.
//  hash = scrypt(password, random 16-byte salt)
// ============================================================================
const crypto = require('node:crypto');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return [hash, salt];
}

function verifyPassword(password, hash, salt) {
  const [candidate] = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function login(username, password) {
  const db = require('./connection');
  const user = db.get(`SELECT u.username, u.password_hash, u.salt, u.role, u.faculty_id, f.name
                         FROM app_user u LEFT JOIN faculty f ON f.faculty_id = u.faculty_id
                        WHERE u.username = ?`, String(username).trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash, user.salt)) return null;
  db.run("UPDATE app_user SET last_login = datetime('now', 'localtime') WHERE username = ?", user.username);
  return { username: user.username, role: user.role, facultyId: user.faculty_id, name: user.name || 'Administrator' };
}

module.exports = { hashPassword, verifyPassword, login };
