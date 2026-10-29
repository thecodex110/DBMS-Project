'use strict';
// ============================================================================
//  LAB 10 : INDEXING & HASHING (Unit 5)
//  Visual B+ tree, static hashing, extendible (dynamic) hashing, bitmap
//  indices, plus REAL index experiments on SQLite (EXPLAIN QUERY PLAN +
//  benchmark on 200,000 rows).
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const { runMenu } = require('../ui/menu');
const { BPlusTree, StaticHash, ExtendibleHash, bitmapIndex, hashKey } = require('./algorithms/indexStructures');

function parseKeys(text) {
  const toks = text.split(/[\s,]+/).filter(Boolean);
  return toks.every((t) => /^-?\d+$/.test(t)) ? toks.map(Number) : toks;
}

function drawTree(tree) {
  const levels = tree.levels();
  levels.forEach((lvl, i) => {
    const leaf = i === levels.length - 1;
    const nodes = lvl.map((keys) => (leaf ? ui.c.green : ui.c.cyan)(`[${keys.join('|')}]`));
    const label = i === 0 ? 'root ' : leaf ? 'leaf ' : `L${i}   `;
    console.log(`    ${ui.c.gray(label)} ${nodes.join(leaf ? ui.c.gray(' → ') : '  ')}`);
  });
}

async function bplus() {
  const n = await ui.askInt('Order n (max pointers per node, 3-6)', { min: 3, max: 6, def: 4 });
  const src = await ui.pick('Keys to insert', ['Type my own keys', 'Silberschatz example (instructor names)', 'Roll numbers from the student table', 'Numbers 1..20 in random order'], (x) => x);
  if (!src) return;
  let keys;
  if (src.startsWith('Type')) keys = parseKeys(await ui.askText('Keys (comma separated)', { def: '10, 20, 5, 6, 12, 30, 7, 17, 3, 25' }));
  else if (src.startsWith('Silberschatz')) keys = ['Srinivasan', 'Wu', 'Mozart', 'Einstein', 'El Said', 'Gold', 'Katz', 'Califieri', 'Singh', 'Crick', 'Brandt', 'Kim'];
  else if (src.startsWith('Roll')) keys = db.all('SELECT roll_no FROM student ORDER BY random() LIMIT 14').map((r) => r.roll_no);
  else keys = [7, 14, 2, 19, 11, 4, 16, 1, 9, 20, 5, 13, 18, 3, 10, 6, 15, 8, 12, 17];
  const tree = new BPlusTree(n);
  ui.info(`Order n = ${n}:  leaf holds ≤ ${n - 1} keys,  internal node ≤ ${n} children,  every node (except root) ≥ half full`);
  for (const k of keys) {
    tree.insert(k);
    const before = tree.events.length;
    console.log('\n  ' + ui.c.bYellow('insert ' + k));
    tree.events.splice(0, before).forEach((e) => ui.note(e));
    drawTree(tree);
  }
  ui.success(`Final height = ${tree.height()} for ${keys.length} keys (all leaves at the same depth → balanced).`);
  for (;;) {
    const q = await ui.askText('Search key, or range "lo..hi" (blank = done)', { def: '' });
    if (!q) break;
    if (q.includes('..')) {
      const [lo, hi] = parseKeys(q.replace('..', ' '));
      const r = tree.range(lo, hi);
      ui.info(`Range [${lo}, ${hi}] → ${r.keys.join(', ') || '(none)'}   (walked ${r.leavesVisited} leaf node(s) using next-leaf pointers)`);
    } else {
      const [k] = parseKeys(q);
      const r = tree.search(k);
      ui.info(`Path: ${r.path.join(' → ')}   ${r.found ? ui.c.green('FOUND') : ui.c.red('NOT FOUND')}   (${r.path.length} node reads = height)`);
    }
  }
}

async function staticHash() {
  const N = await ui.askInt('Number of buckets N', { min: 2, max: 12, def: 5 });
  const cap = await ui.askInt('Bucket capacity (records per page)', { min: 1, max: 5, def: 2 });
  const keys = parseKeys(await ui.askText('Keys', { def: '15, 22, 7, 31, 40, 5, 12, 27, 33, 10, 20, 45' }));
  const h = new StaticHash(N, cap);
  keys.forEach((k) => h.insert(k));
  ui.section(`h(K) = K mod ${N}`);
  h.events.forEach((e) => ui.note(e));
  ui.section('Bucket layout (primary page → overflow chain)');
  h.table.forEach((pages, b) => {
    console.log(`    bucket ${String(b).padStart(2)}: ${pages.map((p, i) => (i === 0 ? ui.c.cyan : ui.c.yellow)(`[${p.join(', ').padEnd(cap * 4)}]`)).join(ui.c.gray(' → '))}`);
  });
  const longest = Math.max(...h.table.map((p) => p.length));
  ui.note(`Longest chain = ${longest} page(s). Static hashing cannot grow N, so chains get long as data grows → dynamic hashing.`);
  const k = await ui.askText('Search a key (blank = skip)', { def: '' });
  if (k) {
    const r = h.search(parseKeys(k)[0]);
    ui.info(`bucket ${r.bucket}, pages read = ${r.pagesRead}, ${r.found ? 'found' : 'not found'}`);
  }
}

async function extendible() {
  const cap = await ui.askInt('Bucket capacity', { min: 1, max: 4, def: 2 });
  const keys = parseKeys(await ui.askText('Keys (integers → hash = value itself, easy to follow in binary)', { def: '4, 12, 32, 16, 1, 5, 21, 13, 10, 15, 7, 19' }));
  const h = new ExtendibleHash(cap);
  for (const k of keys) {
    h.insert(k);
    console.log('\n  ' + ui.c.bYellow(`insert ${k}`) + ui.c.gray(`  (binary ${hashKey(k).toString(2)})`));
    h.events.splice(0).forEach((e) => ui.note(e));
  }
  ui.section(`Final directory  (global depth = ${h.global}, ${h.dir.length} entries)`);
  const seen = new Set();
  h.dir.forEach((b, i) => {
    const first = !seen.has(b.id);
    seen.add(b.id);
    const bits = h.global ? i.toString(2).padStart(h.global, '0') : '-';
    console.log(`    ${ui.c.cyan(bits.padStart(Math.max(h.global, 1)))} → ${b.id} ${ui.c.gray(`(local depth ${b.local})`)} ${first ? `[${b.keys.join(', ')}]` : ui.c.gray('(shared)')}`);
  });
  ui.note('Several directory entries can share one bucket when local depth < global depth.');
}

async function bitmap() {
  const rows = db.all('SELECT roll_no, gender, year, dept_id FROM student ORDER BY roll_no');
  const g = bitmapIndex(rows, 'gender');
  const y = bitmapIndex(rows, 'year');
  const d = bitmapIndex(rows, 'dept_id');
  const str = (bits) => bits.map((b) => (b ? ui.c.green('1') : ui.c.gray('0'))).join('');
  ui.section(`Bitmap index on student (${rows.length} records, record i = bit i)`);
  for (const [name, m] of [['gender', g], ['year', y], ['dept_id', d]]) {
    for (const v of Object.keys(m)) console.log(`    ${ui.padEnd(`${name}=${v}`, 14)} ${str(m[v])}`);
  }
  const and = g.F.map((b, i) => b & (y[3] ? y[3][i] : 0) & (d.CS ? d.CS[i] : 0));
  ui.section("Query:  gender = 'F' AND year = 3 AND dept_id = 'CS'   →  bitwise AND");
  console.log(`    ${ui.padEnd('result', 14)} ${str(and)}`);
  const hits = rows.filter((_, i) => and[i]).map((r) => r.roll_no);
  ui.success(`${hits.length} match(es): ${hits.join(', ')}`);
  ui.note('Bitmaps shine on low-cardinality columns (gender, year): tiny, and AND/OR are single CPU instructions per 64 rows.');
}

async function explainPlans() {
  const roll = db.get('SELECT roll_no FROM student LIMIT 1 OFFSET 2').roll_no;
  const cases = [
    ['Primary-key lookup', `SELECT * FROM student WHERE roll_no = '${roll}'`],
    ['Secondary index (idx_attendance_roll)', `SELECT * FROM attendance WHERE roll_no = '${roll}'`],
    ['Same query with index DISABLED', `SELECT * FROM attendance NOT INDEXED WHERE roll_no = '${roll}'`],
    ['Composite index prefix (dept_id, year)', "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3"],
    ['Index cannot help: function on column', "SELECT * FROM student WHERE lower(dept_id) = 'cs'"],
    ['Range scan on (subject_id, session_date)', "SELECT * FROM class_session WHERE subject_id = 'CS501' AND session_date BETWEEN '2026-08-01' AND '2026-09-01'"],
  ];
  for (const [title, sql] of cases) {
    const runs = 300;
    const stmt = db.getDb().prepare(sql);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < runs; i++) stmt.all();
    const us = Number(process.hrtime.bigint() - t0) / 1e3 / runs;
    const plan = db.all('EXPLAIN QUERY PLAN ' + sql).map((p) => p.detail).join('  |  ');
    console.log('\n  ' + ui.c.bold(title));
    ui.printSQL(sql);
    const scan = /^SCAN/.test(plan);
    console.log(`    ${scan ? ui.c.red('PLAN') : ui.c.green('PLAN')}: ${plan}`);
    console.log(ui.c.gray(`    avg ${us.toFixed(1)} µs per query (${runs} runs)`));
  }
  ui.note('SEARCH = B-tree lookup (log n)   ·   SCAN = read every row (n)   ·   COVERING INDEX = answered from the index alone');
}

async function benchmark() {
  const n = await ui.askInt('Rows to generate', { min: 10000, max: 1000000, def: 200000 });
  ui.info('Creating TEMP table bench(id, roll_no, score) with a recursive CTE…');
  db.exec('DROP TABLE IF EXISTS temp.bench');
  db.exec('CREATE TEMP TABLE bench (id INTEGER PRIMARY KEY, roll_no TEXT, score INTEGER)');
  let t = Date.now();
  db.run(`WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < ?)
          INSERT INTO bench SELECT i, 'R' || (abs(random()) % 50000), abs(random()) % 100 FROM seq`, n);
  ui.success(`${n.toLocaleString()} rows inserted in ${Date.now() - t} ms`);
  const sql = "SELECT COUNT(*) AS c FROM bench WHERE roll_no = 'R4242'";
  const time = () => { const s = process.hrtime.bigint(); for (let i = 0; i < 20; i++) db.get(sql); return Number(process.hrtime.bigint() - s) / 1e6 / 20; };
  const plan = () => db.all('EXPLAIN QUERY PLAN ' + sql).map((p) => p.detail).join(' | ');
  const before = time();
  console.log(`    without index : ${ui.c.red(before.toFixed(3) + ' ms')}   plan: ${plan()}`);
  t = Date.now();
  db.exec('CREATE INDEX temp.idx_bench_roll ON bench(roll_no)');
  ui.info(`CREATE INDEX took ${Date.now() - t} ms (sorting ${n.toLocaleString()} keys into a B+ tree)`);
  const after = time();
  console.log(`    with index    : ${ui.c.green(after.toFixed(3) + ' ms')}   plan: ${plan()}`);
  ui.box('Result', [`Speed-up ≈ ${ui.c.bold((before / Math.max(after, 0.0001)).toFixed(0) + '×')}`,
    `B+ tree height ≈ log_fanout(${n.toLocaleString()}) ≈ ${Math.ceil(Math.log(n) / Math.log(100))} levels (fan-out ~100)`,
    'Trade-off: every INSERT/UPDATE must now also update the index.'], ui.c.green);
  db.exec('DROP TABLE temp.bench');
}

async function listIndexes() {
  ui.table(db.all(`SELECT m.tbl_name AS "table", il.name AS index_name, il."unique",
                          CASE il.origin WHEN 'pk' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' ELSE 'CREATE INDEX' END AS created_by,
                          (SELECT group_concat(name, ', ') FROM pragma_index_info(il.name)) AS columns
                     FROM sqlite_master m, pragma_index_list(m.name) il
                    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
                    ORDER BY m.tbl_name`), { title: 'All indexes in the database' });
  ui.note('PRIMARY KEY / UNIQUE indexes are created automatically. Tables themselves are B+ trees keyed by rowid (clustered).');
}

module.exports = {
  menu: () => runMenu('INDEXING & HASHING LAB', 'B+ tree · static & extendible hashing · bitmap · real query plans', [
    { label: 'B+ tree: insert, split, search, range', hint: 'ordered index', action: bplus },
    { label: 'Static hashing with overflow chains', hint: 'h(K) = K mod N', action: staticHash },
    { label: 'Extendible (dynamic) hashing', hint: 'directory doubling', action: extendible },
    { label: 'Bitmap index on student table', hint: 'self-study', action: bitmap },
    { label: 'EXPLAIN QUERY PLAN: index vs scan', hint: 'real SQLite', action: explainPlans },
    { label: 'Benchmark: index vs full scan', hint: 'real speed-up', action: benchmark },
    { label: 'List every index in our database', hint: 'catalog', action: listIndexes },
  ]),
};
