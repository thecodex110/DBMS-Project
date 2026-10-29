'use strict';
// Run with:  npm test      (uses a throw-away database file)
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');

process.env.CAAMS_DB = path.join(os.tmpdir(), `caams_test_${process.pid}.db`);
const db = require('../src/db/connection');
const init = require('../src/db/init');
const fd = require('../src/labs/algorithms/fd');
const cc = require('../src/labs/algorithms/concurrency');
const { BPlusTree, ExtendibleHash } = require('../src/labs/algorithms/indexStructures');

test.before(() => init.resetDatabase());
test.after(() => db.deleteDatabaseFiles());

test('database builds with data in every core table', () => {
  for (const t of ['department', 'faculty', 'student', 'subject', 'enrollment', 'class_session', 'attendance', 'exam_result']) {
    assert.ok(db.get(`SELECT COUNT(*) AS n FROM ${t}`).n > 0, t);
  }
});

test('constraints reject bad data', () => {
  assert.throws(() => db.run("INSERT INTO student (roll_no, first_name, last_name, gender, dob, year, dept_id) VALUES ('X1','a','b','Z','2005-01-01',3,'CS')"), /CHECK/);
  assert.throws(() => db.run("INSERT INTO student (roll_no, first_name, last_name, gender, dob, year, dept_id) VALUES ('X1','a','b','M','2005-01-01',3,'NOPE')"), /FOREIGN KEY/);
  assert.throws(() => db.run("DELETE FROM department WHERE dept_id = 'CS'"), /FOREIGN KEY/);
});

test('trigger blocks attendance for a non-enrolled student', () => {
  const sid = db.get("SELECT session_id FROM class_session WHERE subject_id = 'CS501' LIMIT 1").session_id;
  assert.throws(() => db.run("INSERT INTO attendance (session_id, roll_no, status) VALUES (?, '23ME001', 'P')", sid), /not enrolled/);
});

test('transaction rolls back atomically', () => {
  const before = db.get('SELECT COUNT(*) AS n FROM class_session').n;
  assert.throws(() => db.transaction(() => {
    db.run("INSERT INTO class_session (subject_id, faculty_id, session_date, start_time) VALUES ('CS501','FAC101','2026-01-05','08:00')");
    throw new Error('boom');
  }));
  assert.strictEqual(db.get('SELECT COUNT(*) AS n FROM class_session').n, before);
});

test('normalization: keys and normal forms', () => {
  const rel = fd.parseRelation('ABCDE');
  const fds = fd.parseFDs('A -> BC; CD -> E; B -> D; E -> A', rel);
  const a = fd.analyze(rel.attrs, fds);
  assert.deepStrictEqual(a.keys.map((k) => k.join('')).sort(), ['A', 'BC', 'CD', 'E']);
  assert.strictEqual(a.nf, '3NF');
  const b = fd.bcnfDecompose(rel.attrs, fds);
  assert.ok(fd.losslessChase(rel.attrs, b.relations, fds).lossless);
});

test('concurrency: precedence graph and 2PL deadlock', () => {
  assert.strictEqual(cc.conflictSerializable(cc.parseSchedule('R1(A) R2(A) W1(A) W2(A)')).serializable, false);
  assert.strictEqual(cc.viewSerializable(cc.parseSchedule('R1(A) W2(A) W1(A) W3(A)')).serializable, true);
  const r = cc.simulate2PL(cc.parseSchedule('R1(A) R2(B) W1(B) W2(A) C1 C2'));
  assert.deepStrictEqual(r.aborted, [2]);
});

test('B+ tree stays sorted and balanced; extendible hash keeps all keys', () => {
  const t = new BPlusTree(4);
  const keys = [7, 14, 2, 19, 11, 4, 16, 1, 9, 20, 5, 13, 18, 3, 10, 6, 15, 8, 12, 17];
  keys.forEach((k) => t.insert(k));
  assert.deepStrictEqual(t.range(1, 20).keys, [...keys].sort((x, y) => x - y));
  const h = new ExtendibleHash(2);
  keys.forEach((k) => h.insert(k));
  assert.strictEqual(new Set(h.dir).size > 1, true);
  assert.deepStrictEqual([...new Set(h.dir)].flatMap((b) => b.keys).sort((x, y) => x - y), [...keys].sort((x, y) => x - y));
});
