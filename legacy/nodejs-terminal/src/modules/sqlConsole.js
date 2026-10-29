'use strict';
// ============================================================================
//  MODULE 12 : INTERACTIVE SQL CONSOLE  (DDL / DML / DCL-like / queries)
//  Multi-line input ends with ';'. Dot-commands give quick catalog info.
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const session = require('../session');
const { friendlyError } = require('../ui/menu');

const HELP = [
  '.tables            list tables and views',
  '.schema <name>     show CREATE statement',
  '.desc <table>      column details (pragma table_info)',
  '.indexes [table]   list indexes',
  '.plan <query>      EXPLAIN QUERY PLAN for a query',
  '.begin / .commit / .rollback   manual transaction control',
  '.help              this help',
  '.exit              leave the console',
];

function runSql(sql) {
  const started = process.hrtime.bigint();
  const isQuery = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN|VALUES)\b/i.test(sql);
  if (!session.isAdmin() && !isQuery) {
    ui.warn('Faculty accounts have READ-ONLY console access (only SELECT / WITH / PRAGMA / EXPLAIN).');
    return;
  }
  if (isQuery) {
    const rows = db.all(sql);
    ui.table(rows, { limit: 100 });
  } else {
    const statements = sql.split(';').filter((s) => s.trim()).length;
    if (statements > 1) { db.exec(sql); ui.success(`${statements} statements executed.`); }
    else {
      const r = db.run(sql);
      ui.success(`OK - ${r.changes} row(s) affected${r.lastInsertRowid ? `, last rowid ${r.lastInsertRowid}` : ''}.`);
    }
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(ui.c.gray(`    (${ms.toFixed(2)} ms)`));
}

function dotCommand(line) {
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(' ').replace(/;$/, '');
  switch (cmd) {
    case '.help': HELP.forEach((h) => ui.note(h)); break;
    case '.tables':
      ui.table(db.all(`SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view')
                        AND name NOT LIKE 'sqlite_%' ORDER BY type, name`));
      break;
    case '.schema': {
      const r = db.get('SELECT sql FROM sqlite_master WHERE name = ?', arg);
      r && r.sql ? ui.printSQL(r.sql) : ui.warn('No such object.');
      break;
    }
    case '.desc': ui.table(db.all('SELECT cid, name, type, "notnull", dflt_value, pk FROM pragma_table_info(?)', arg)); break;
    case '.indexes':
      ui.table(db.all(`SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND (? = '' OR tbl_name = ?) ORDER BY tbl_name`, arg, arg));
      break;
    case '.plan': ui.table(db.all('EXPLAIN QUERY PLAN ' + arg), { columns: ['id', 'parent', 'detail'] }); break;
    case '.begin': db.exec('BEGIN'); ui.success('Transaction started - changes are pending until .commit'); break;
    case '.commit': db.exec('COMMIT'); ui.success('Committed (durable).'); break;
    case '.rollback': db.exec('ROLLBACK'); ui.success('Rolled back - all changes since .begin undone.'); break;
    default: ui.error(`Unknown command ${cmd} (try .help)`);
  }
}

async function consoleLoop() {
  ui.header('SQL CONSOLE', session.isAdmin() ? 'Full access (admin)' : 'Read-only (faculty)');
  ui.info("Type SQL ending with ';'  ·  .help for commands  ·  .exit to leave");
  ui.note("Example:  SELECT dept_id, COUNT(*) FROM student GROUP BY dept_id;");
  let buffer = '';
  for (;;) {
    const line = await ui.ask(buffer ? ui.c.gray('   ...> ') : ui.c.bCyan('  sql> '));
    if (!buffer && line.startsWith('.')) {
      if (line === '.exit' || line === '.quit') break;
      try { dotCommand(line); } catch (e) { ui.error(friendlyError(e)); }
      continue;
    }
    buffer += (buffer ? '\n' : '') + line;
    if (!buffer.trim().endsWith(';')) continue;
    const sql = buffer.trim();
    buffer = '';
    try { runSql(sql); } catch (e) { ui.error(friendlyError(e)); }
  }
  if (db.getDb().isTransaction) {
    db.exec('ROLLBACK');
    ui.warn('Open transaction was rolled back on exit.');
  }
}

module.exports = { menu: consoleLoop };
