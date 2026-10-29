'use strict';
// ============================================================================
//  LAB 11 : TRANSACTIONS, CONCURRENCY CONTROL & RECOVERY (Unit 6 + self-study)
//  Part A - REAL transactions on SQLite (ACID, savepoints, locking between
//           two connections)
//  Part B - schedule analysis & protocol simulators (pure algorithms in
//           ./algorithms/concurrency.js)
// ============================================================================
const { DatabaseSync } = require('node:sqlite');
const db = require('../db/connection');
const ui = require('../ui/term');
const { runMenu, friendlyError } = require('../ui/menu');
const cc = require('./algorithms/concurrency');

// --------------------------------------------------------- sandbox table --
function setupAccounts() {
  db.exec(`CREATE TABLE IF NOT EXISTS lab_account (
             acc_no  VARCHAR(5) PRIMARY KEY,
             holder  VARCHAR(40) NOT NULL,
             balance INTEGER NOT NULL CHECK (balance >= 0)   -- consistency rule
           );
           DELETE FROM lab_account;
           INSERT INTO lab_account VALUES ('A101', 'Aarav (student fee a/c)', 5000), ('B202', 'College account', 20000);`);
}
// the sandbox table is temporary: removed after every demo
const dropAccounts = () => db.exec('DROP TABLE IF EXISTS lab_account');
const balances = (title) => ui.table(db.all('SELECT acc_no, holder, balance, (SELECT SUM(balance) FROM lab_account) AS total_in_system FROM lab_account'), { title });

function transfer(amount, crashAfterDebit = false) {
  const d = db.getDb();
  console.log(ui.c.gray('    BEGIN TRANSACTION;                 -- state: ACTIVE'));
  d.exec('BEGIN');
  try {
    d.prepare("UPDATE lab_account SET balance = balance - ? WHERE acc_no = 'A101'").run(amount);
    console.log(ui.c.gray(`    UPDATE ... balance - ${amount} (A101) -- ok`));
    if (crashAfterDebit) throw new Error('simulated power failure after the debit!');
    d.prepare("UPDATE lab_account SET balance = balance + ? WHERE acc_no = 'B202'").run(amount);
    console.log(ui.c.gray(`    UPDATE ... balance + ${amount} (B202) -- ok   state: PARTIALLY COMMITTED`));
    d.exec('COMMIT');
    console.log(ui.c.green('    COMMIT;                            -- state: COMMITTED (durable)'));
  } catch (e) {
    d.exec('ROLLBACK');
    console.log(ui.c.red(`    ✗ ${friendlyError(e)}  -- state: FAILED`));
    console.log(ui.c.yellow('    ROLLBACK;                          -- state: ABORTED (all changes undone)'));
  }
}

async function acidDemo() {
  setupAccounts();
  ui.box('Transfer ₹ from A101 → B202  =  2 UPDATEs that must be ATOMIC', [
    'Atomicity   : both updates or none        Consistency : CHECK (balance >= 0), total unchanged',
    'Isolation   : others never see half-done  Durability  : after COMMIT it survives a crash',
  ]);
  balances('Initial state');
  ui.section('1) Valid transfer of 1500');
  transfer(1500);
  balances('After commit');
  ui.section('2) Transfer of 9999 (more than balance) → CHECK constraint fails');
  transfer(9999);
  balances('After rollback - unchanged');
  ui.section('3) Transfer of 1000 but the system crashes after the debit');
  transfer(1000, true);
  balances('After rollback - money did NOT vanish');
  ui.success('Total money in the system stayed constant in every case → consistency preserved.');
  dropAccounts();
}

async function savepointDemo() {
  setupAccounts();
  const d = db.getDb();
  const step = (sql, note) => { ui.printSQL(sql); d.exec(sql); if (note) ui.note(note); };
  step('BEGIN;');
  step("UPDATE lab_account SET balance = balance - 500 WHERE acc_no = 'A101';", 'fee instalment 1 debited');
  step('SAVEPOINT after_first;');
  step("UPDATE lab_account SET balance = balance - 700 WHERE acc_no = 'A101';", 'instalment 2 (wrong amount!)');
  balances('Inside transaction, before partial rollback');
  step('ROLLBACK TO after_first;', 'undo ONLY the work after the savepoint');
  step('COMMIT;');
  balances('Committed: first debit kept, second undone');
  dropAccounts();
}

async function statesDiagram() {
  console.log(ui.c.cyan(String.raw`
                       ┌──────────────────────┐   last statement    ┌─────────────────┐
     BEGIN ──────────► │        ACTIVE        │ ──────────────────► │ PARTIALLY       │
                       │ (executing reads and │                     │ COMMITTED       │
                       │  writes)             │                     └───────┬─────────┘
                       └──────────┬───────────┘                             │ log forced to disk
                                  │ error / constraint / crash              ▼
                                  ▼                                  ┌─────────────────┐
                       ┌──────────────────────┐                      │    COMMITTED    │
                       │        FAILED        │ ◄─── cannot write ── └─────────────────┘
                       └──────────┬───────────┘      log (crash)
                                  │ ROLLBACK (undo using log)
                                  ▼
                       ┌──────────────────────┐
                       │       ABORTED        │ ──► restart the transaction  or  kill it
                       └──────────────────────┘`));
  ui.note('Option 1 of this lab shows every state live on the lab_account table.');
}

async function isolationDemo() {
  setupAccounts();
  const B = new DatabaseSync(db.DB_PATH, { timeout: 0 });
  const A = db.getDb();
  const bal = (conn) => conn.prepare("SELECT balance FROM lab_account WHERE acc_no = 'A101'").get().balance;
  try {
    ui.info('Two independent connections to the same database file: A (this app) and B (a second user).');
    console.log(`    A: BEGIN IMMEDIATE  ${ui.c.gray('-- takes a RESERVED (write-intent) lock')}`);
    A.exec('BEGIN IMMEDIATE');
    A.prepare("UPDATE lab_account SET balance = 0 WHERE acc_no = 'A101'").run();
    console.log(`    A: UPDATE balance = 0  (not committed)    A sees ${ui.c.bold(bal(A))}`);
    console.log(`    B: SELECT balance                          B sees ${ui.c.bold(bal(B))}  ${ui.c.green('← no dirty read (old committed value)')}`);
    try {
      B.exec('BEGIN IMMEDIATE');
      console.log('    B: got a write lock?!');
      B.exec('ROLLBACK');
    } catch (e) {
      console.log(`    B: BEGIN IMMEDIATE → ${ui.c.red(e.message)}  ${ui.c.gray('← writers are serialised (lock conflict)')}`);
    }
    A.exec('COMMIT');
    console.log('    A: COMMIT');
    console.log(`    B: SELECT balance                          B sees ${ui.c.bold(bal(B))}  ${ui.c.green('← committed change now visible')}`);
    const C = new DatabaseSync(db.DB_PATH);
    console.log(`    C: brand-new connection (like after a restart) sees ${ui.c.bold(bal(C))}  ${ui.c.green('← durability')}`);
    C.close();
    ui.box('What SQLite guarantees', [
      'SQLite runs transactions as SERIALIZABLE: one writer at a time, many readers.',
      'Locks: SHARED (read) → RESERVED (intent to write) → EXCLUSIVE (during commit).',
      'This is lock-based concurrency control at DATABASE granularity.',
    ]);
  } finally {
    if (A.isTransaction) A.exec('ROLLBACK');
    B.close();
    dropAccounts();
  }
}

// ----------------------------------------------------- schedule presets ---
const SCHEDULES = [
  ['Serializable interleaving', 'R1(A) W1(A) R2(A) W2(A) R1(B) W1(B) C1 R2(B) W2(B) C2'],
  ['Lost update (not serializable)', 'R1(A) R2(A) W1(A) W2(A) C1 C2'],
  ['Blind writes: view- but NOT conflict-serializable', 'R1(A) W2(A) C2 W1(A) C1 W3(A) C3'],
  ['Non-recoverable (dirty read then early commit)', 'W1(A) R2(A) C2 C1'],
  ['Cascading rollback', 'W1(A) R2(A) W2(B) R3(B) A1'],
  ['Deadlock under 2PL', 'R1(A) R2(B) W1(B) W2(A) C1 C2'],
  ['Timestamp ordering conflict', 'R1(A) R2(A) W2(A) W1(A) C1 C2'],
  ["Thomas' write rule case", 'R1(A) W2(A) W1(A) C1 C2'],
];

async function getSchedule(defIdx = 0) {
  const p = await ui.pick('Schedule', [...SCHEDULES, ['Type my own schedule', null]], (s) => (s[1] ? `${ui.padEnd(s[0], 50)} ${ui.c.gray(s[1])}` : s[0]));
  if (!p) return null;
  const text = p[1] || await ui.askText('Schedule (e.g. R1(A) W2(A) C1 C2)', { def: SCHEDULES[defIdx][1] });
  const ops = cc.parseSchedule(text);
  drawSchedule(ops);
  return ops;
}

function drawSchedule(ops) {
  const txs = cc.txList(ops).sort((a, b) => a - b);
  ui.section('Schedule (time flows downward)');
  console.log('    ' + ui.c.gray('t   ') + txs.map((t) => ui.c.bold(ui.padEnd(`T${t}`, 10))).join(''));
  ops.forEach((o, i) => {
    console.log('    ' + ui.c.gray(String(i + 1).padEnd(4)) + txs.map((t) => ui.padEnd(t === o.tx ? ui.c.cyan(cc.opStr(o)) : ui.c.gray('·'), 10)).join(''));
  });
}

async function analyzeSchedule() {
  const ops = await getSchedule();
  if (!ops) return;
  const cs = cc.conflictSerializable(ops);
  ui.section('Conflicting pairs → precedence graph edges');
  cs.reasons.length ? cs.reasons.forEach((r) => ui.note(r)) : ui.note('no conflicts');
  console.log(`    Edges: ${cs.edges.map(([a, b]) => `T${a}→T${b}`).join(', ') || 'none'}`);
  if (cs.serializable) ui.success(`CONFLICT SERIALIZABLE - no cycle. Equivalent serial order: ${cs.order.map((t) => 'T' + t).join(' → ')}`);
  else ui.error(`NOT conflict serializable - cycle ${cs.cycle.map((t) => 'T' + t).join(' → ')}`);
  const vs = cc.viewSerializable(ops);
  if (vs.checked) {
    if (vs.serializable) ui.success(`VIEW SERIALIZABLE - view-equivalent to ${vs.order.map((t) => 'T' + t).join(' → ')}`);
    else ui.error('NOT view serializable');
    if (vs.serializable && !cs.serializable) ui.note('View- but not conflict-serializable ⇒ the schedule must contain BLIND WRITES.');
  }
  const rc = cc.recoverability(ops);
  ui.section('Recoverability');
  for (const [k, label] of [['recoverable', 'Recoverable'], ['cascadeless', 'Cascadeless (avoids cascading rollback)'], ['strict', 'Strict']]) {
    console.log(`    ${rc[k] ? ui.c.green('✓') : ui.c.red('✗')} ${label}`);
    rc.problems[k].forEach((p) => ui.note('    ' + p));
  }
  ui.note('Every strict schedule is cascadeless, every cascadeless schedule is recoverable.');
}

async function twoPL() {
  const ops = await getSchedule(5);
  if (!ops) return;
  const scheme = await ui.pick('Deadlock handling', [
    ['detect', 'Detection: wait-for graph, abort youngest victim'],
    ['wait-die', 'Prevention: WAIT-DIE (non-preemptive)'],
    ['wound-wait', 'Prevention: WOUND-WAIT (preemptive)'],
  ], (s) => s[1]);
  if (!scheme) return;
  const r = cc.simulate2PL(ops, scheme[0]);
  ui.info(`Strict 2PL: S-lock to read, X-lock to write, ALL locks released only at commit/abort.   Timestamps: ${Object.entries(r.ts).map(([t, v]) => `T${t}=${v}`).join(' ')}`);
  ui.table(r.log, { columns: ['step', 'action'], maxWidth: 110 });
  console.log(`    Executed order : ${r.executed.join(' ')}`);
  if (r.aborted.length) ui.warn(`Aborted: ${r.aborted.map((t) => 'T' + t).join(', ')}`);
  ui.note('Growing phase = acquiring locks; shrinking phase = releasing them. Never acquire after releasing.');
}

async function timestampOrdering() {
  const ops = await getSchedule(6);
  if (!ops) return;
  const thomas = await ui.confirm("Apply Thomas' write rule?", false);
  const r = cc.simulateTimestamp(ops, thomas);
  ui.info(`TS(Ti) = order of arrival: ${Object.entries(r.ts).map(([t, v]) => `T${t}=${v}`).join(' ')}.  R-TS / W-TS = largest TS that read / wrote the item`);
  ui.table(r.log, { columns: ['op', 'ts', 'r_ts', 'w_ts', 'decision'], maxWidth: 90 });
  if (r.aborted.length) ui.warn(`Rolled back: ${r.aborted.map((t) => 'T' + t).join(', ')} (restarted later with a NEW timestamp)`);
  else ui.success('All operations accepted.');
}

async function validation() {
  const ops = await getSchedule(0);
  if (!ops) return;
  ui.info('Optimistic: READ phase (local copies) → VALIDATION at commit → WRITE phase.');
  ui.note('Ti passes if for every earlier-validated Tj: finish(Tj) < start(Ti)  OR  WS(Tj) ∩ RS(Ti) = ∅');
  ui.table(cc.simulateValidation(ops), { maxWidth: 70 });
}

async function granularity() {
  const modes = ['IS', 'IX', 'S', 'SIX', 'X'];
  const ok = { IS: ['IS', 'IX', 'S', 'SIX'], IX: ['IS', 'IX'], S: ['IS', 'S'], SIX: ['IS'], X: [] };
  ui.section('Compatibility matrix (✓ = can be granted together)');
  console.log('          ' + modes.map((m) => ui.padEnd(m, 6)).join(''));
  for (const a of modes) console.log('    ' + ui.padEnd(a, 6) + modes.map((b) => ui.padEnd(ok[a].includes(b) ? ui.c.green('✓') : ui.c.red('✗'), 6)).join(''));
  console.log(ui.c.cyan(String.raw`
    Hierarchy:      college_db (database)
                        ├── student (table / file)
                        │      ├── 23CS001 (row / record)
                        │      └── 23CS002
                        └── attendance ...`));
  const held = [];
  const request = (tx, path) => {
    console.log('\n  ' + ui.c.bold(`T${tx}: ${path.map((p) => `${p[1]}(${p[0]})`).join(' → ')}`));
    for (const [node, mode] of path) {
      const clash = held.find((h) => h.node === node && h.tx !== tx && !ok[mode].includes(h.mode));
      if (clash) { console.log(`    ${ui.c.red('WAIT')} ${mode} on ${node} conflicts with T${clash.tx}'s ${clash.mode}`); return; }
      held.push({ tx, node, mode });
      console.log(`    ${ui.c.green('GRANT')} ${mode} on ${node}`);
    }
  };
  request(1, [['college_db', 'IX'], ['student', 'IX'], ['23CS001', 'X']]);
  request(2, [['college_db', 'IS'], ['student', 'IS'], ['23CS002', 'S']]);
  request(3, [['college_db', 'IS'], ['student', 'S']]);
  ui.note('Rules: lock root first, top-down; to get S/IS on a node hold IS/IX on its parent; to get X/IX/SIX hold IX/SIX on parent.');
  ui.note('T3 wants to read the WHOLE table, but T1 is writing one row inside it → intention lock IX blocks S.');
}

const LOGS = [
  ['Checkpoint + one committed, one incomplete tx',
    '<T0 start> <T0, A, 1000, 950> <T1 start> <T0, B, 2000, 2050> <T0 commit> <T1, C, 700, 600> <checkpoint T1> <T2 start> <T2, A, 950, 500> <T1 commit> <T2, D, 100, 200>',
    { A: 1000, B: 2000, C: 700, D: 100 }],
  ['No checkpoint, two losers',
    '<T1 start> <T1, X, 50, 80> <T2 start> <T2, Y, 10, 20> <T1 commit> <T3 start> <T3, X, 80, 90> <T2, Z, 5, 6>',
    { X: 50, Y: 10, Z: 5 }],
];

async function recovery() {
  const p = await ui.pick('Log before the crash', LOGS, (l) => l[0]);
  if (!p) return;
  const recs = cc.parseLog(p[1]);
  ui.section('Write-ahead log (stable storage)');
  recs.forEach((r, i) => console.log(`    ${ui.c.gray(String(i + 1).padStart(2))}  ${r.kind === 'checkpoint' ? ui.c.yellow(r.raw) : r.raw}`));
  console.log('    ' + ui.c.bRed('CRASH'));
  const res = cc.recover(recs, p[2]);
  const row = (title, s) => ({ state: title, ...s });
  ui.section('Recovery = ANALYSIS → REDO (repeat history) → UNDO (losers)   (ARIES idea)');
  ui.info(`Committed (winners): ${res.committed.map((t) => 'T' + t).join(', ') || 'none'}     Incomplete (losers → undo-list): ${res.losers.map((t) => 'T' + t).join(', ') || 'none'}`);
  ui.table(res.steps, { columns: ['phase', 'record', 'effect'] });
  ui.table([row('disk at crash', res.atCrash), row('after REDO', res.afterRedo), row('after UNDO = final', res.final)], { title: 'Data item values' });
  ui.info(`Compensation log records written during undo: ${res.clr.join(' ')}`);
  ui.note('Redo from the last checkpoint only - that is why checkpoints make recovery fast.');
}

module.exports = {
  menu: () => runMenu('TRANSACTIONS & CONCURRENCY LAB', 'ACID · serializability · locking · timestamps · recovery', [
    { label: 'ACID demo: atomic money transfer', hint: 'real COMMIT / ROLLBACK', action: acidDemo },
    { label: 'Savepoints (partial rollback)', hint: 'SAVEPOINT / ROLLBACK TO', action: savepointDemo },
    { label: 'Transaction state diagram', hint: 'active → committed', action: statesDiagram },
    { label: 'Isolation & locking: 2 real connections', hint: 'no dirty read, lock conflict', action: isolationDemo },
    { label: 'Schedule analyser (serializability)', hint: 'precedence graph, recoverable', action: analyzeSchedule },
    { label: 'Two-phase locking simulator + deadlocks', hint: 'detect / wait-die / wound-wait', action: twoPL },
    { label: 'Timestamp-ordering protocol', hint: "+ Thomas' write rule", action: timestampOrdering },
    { label: 'Validation-based (optimistic) protocol', hint: 'read / validate / write', action: validation },
    { label: 'Multiple-granularity locking', hint: 'IS IX S SIX X (self-study)', action: granularity },
    { label: 'Crash recovery from the log', hint: 'redo / undo, ARIES (self-study)', action: recovery },
  ]),
};
