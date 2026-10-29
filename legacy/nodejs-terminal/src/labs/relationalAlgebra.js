'use strict';
// ============================================================================
//  LAB 8 : RELATIONAL ALGEBRA  (Unit 3)
//  Every operator is implemented HERE in JavaScript on tuples loaded from the
//  database, then the equivalent SQL is executed and the two results are
//  compared -> proves that SQL is built on relational algebra.
// ============================================================================
const db = require('../db/connection');
const ui = require('../ui/term');
const { runMenu } = require('../ui/menu');

// ---------- relation helpers:  relation = { name, cols:[...], rows:[{}] } --
const load = (name, sql) => {
  const rows = db.all(sql || `SELECT * FROM ${name}`).map((r) => ({ ...r }));
  return { name, cols: rows.length ? Object.keys(rows[0]) : [], rows };
};
const key = (row, cols) => JSON.stringify(cols.map((c) => row[c]));
const distinct = (rows, cols) => {
  const seen = new Set();
  return rows.filter((r) => { const k = key(r, cols); if (seen.has(k)) return false; seen.add(k); return true; });
};

const RA = {
  select: (r, pred) => ({ ...r, rows: r.rows.filter(pred) }),
  project: (r, cols) => ({ name: r.name, cols, rows: distinct(r.rows.map((t) => Object.fromEntries(cols.map((c) => [c, t[c]]))), cols) }),
  rename: (r, newName, map = {}) => {
    const cols = r.cols.map((c) => map[c] || `${newName}.${c.split('.').pop()}`);
    return { name: newName, cols, rows: r.rows.map((t) => Object.fromEntries(r.cols.map((c, i) => [cols[i], t[c]]))) };
  },
  union: (a, b) => ({ name: 'union', cols: a.cols, rows: distinct([...a.rows, ...b.rows], a.cols) }),
  intersect: (a, b) => { const kb = new Set(b.rows.map((t) => key(t, b.cols))); return { name: 'intersect', cols: a.cols, rows: a.rows.filter((t) => kb.has(key(t, a.cols))) }; },
  minus: (a, b) => { const kb = new Set(b.rows.map((t) => key(t, b.cols))); return { name: 'minus', cols: a.cols, rows: a.rows.filter((t) => !kb.has(key(t, a.cols))) }; },
  product: (a, b) => {
    const pa = RA.rename(a, a.name), pb = RA.rename(b, b.name);
    return { name: `${a.name}×${b.name}`, cols: [...pa.cols, ...pb.cols], rows: pa.rows.flatMap((x) => pb.rows.map((y) => ({ ...x, ...y }))) };
  },
  naturalJoin: (a, b) => {
    const common = a.cols.filter((c) => b.cols.includes(c));
    const cols = [...a.cols, ...b.cols.filter((c) => !common.includes(c))];
    return { name: `${a.name}⋈${b.name}`, cols, common, rows: a.rows.flatMap((x) => b.rows.filter((y) => common.every((c) => x[c] === y[c])).map((y) => ({ ...y, ...x }))) };
  },
  thetaJoin: (a, b, theta) => RA.select(RA.product(a, b), theta),
  leftOuterJoin: (a, b) => {
    const nj = RA.naturalJoin(a, b);
    const extra = b.cols.filter((c) => !a.cols.includes(c));
    const matched = new Set(nj.rows.map((t) => key(t, a.cols)));
    const padded = a.rows.filter((t) => !matched.has(key(t, a.cols))).map((t) => ({ ...t, ...Object.fromEntries(extra.map((c) => [c, null])) }));
    return { ...nj, name: `${a.name}⟕${b.name}`, rows: [...nj.rows, ...padded] };
  },
  // r ÷ s : tuples t over (R - S) such that for EVERY u in s, (t,u) is in r
  divide: (r, s) => {
    const restCols = r.cols.filter((c) => !s.cols.includes(c));
    const have = new Set(r.rows.map((t) => key(t, r.cols)));
    const cand = RA.project(r, restCols);
    return { name: 'quotient', cols: restCols, rows: cand.rows.filter((t) => s.rows.every((u) => have.has(key({ ...t, ...u }, r.cols)))) };
  },
  // grouping attrs  𝒢  aggregate functions
  aggregate: (r, groupCols, aggs) => {
    const groups = new Map();
    for (const t of r.rows) {
      const k = key(t, groupCols);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const fns = {
      count: (v) => v.length, sum: (v) => v.reduce((a, b) => a + b, 0),
      avg: (v) => Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100,
      min: (v) => Math.min(...v), max: (v) => Math.max(...v),
    };
    const cols = [...groupCols, ...aggs.map(([f, c]) => `${f}(${c})`)];
    const rows = [...groups.values()].map((g) => ({
      ...Object.fromEntries(groupCols.map((c) => [c, g[0][c]])),
      ...Object.fromEntries(aggs.map(([f, c]) => [`${f}(${c})`, fns[f](g.map((t) => t[c]).filter((v) => v !== null))])),
    }));
    return { name: 'aggregate', cols, rows };
  },
};

function show(expr, rel, sql, limit = 15) {
  console.log('\n  ' + ui.c.bgMagenta(' RA ') + ' ' + ui.c.bold(ui.c.magenta(expr)));
  ui.table(rel.rows, { columns: rel.cols, limit });
  if (sql) {
    console.log('  ' + ui.c.bgBlue(' SQL ') + ' equivalent:');
    ui.printSQL(sql);
    const n = db.all(sql).length;
    if (n === rel.rows.length) ui.success(`SQL returned the same ${n} tuple(s) as the algebra expression.`);
    else ui.warn(`SQL returned ${n} rows vs ${rel.rows.length} tuples (SQL keeps duplicates unless DISTINCT).`);
  }
}

// ------------------------------------------------------------ predicates --
function parsePredicate(text) {
  const parts = text.split(/\s+and\s+/i).map((p) => {
    const m = p.trim().match(/^([\w.]+)\s*(=|!=|<>|<=|>=|<|>)\s*'?([^']*?)'?$/);
    if (!m) throw new Error(`Cannot parse condition "${p}". Use: column op value  (e.g. year = 3 AND dept_id = CS)`);
    const val = m[3] !== '' && !Number.isNaN(Number(m[3])) ? Number(m[3]) : m[3];
    return { col: m[1], op: m[2] === '<>' ? '!=' : m[2], val };
  });
  const test = (t) => parts.every(({ col, op, val }) => {
    const v = t[col];
    switch (op) {
      case '=': return v == val; // eslint-disable-line eqeqeq
      case '!=': return v != val; // eslint-disable-line eqeqeq
      case '<': return v < val;
      case '>': return v > val;
      case '<=': return v <= val;
      default: return v >= val;
    }
  });
  const sql = parts.map(({ col, op, val }) => `${col} ${op === '!=' ? '<>' : op} ${typeof val === 'number' ? val : `'${val.replace(/'/g, "''")}'`}`).join(' AND ');
  const ra = parts.map(({ col, op, val }) => `${col}${op === '!=' ? '≠' : op}${typeof val === 'number' ? val : `'${val}'`}`).join(' ∧ ');
  return { test, sql, ra, cols: parts.map((p) => p.col) };
}

const TABLES = ['student', 'faculty', 'subject', 'department', 'exam_result', 'leave_request'];

async function selection() {
  const t = await ui.pick('Relation', TABLES);
  if (!t) return;
  const r = load(t);
  ui.note(`Attributes: ${r.cols.join(', ')}`);
  const cond = await ui.askText('Condition', { def: t === 'student' ? "year = 3 AND dept_id = 'CS'" : t === 'faculty' ? 'salary > 100000' : '' , required: true });
  const p = parsePredicate(cond);
  for (const c of p.cols) if (!r.cols.includes(c)) throw new Error(`Unknown attribute ${c}`);
  show(`σ ${p.ra} (${t})`, RA.select(r, p.test), `SELECT * FROM ${t} WHERE ${p.sql};`);
}

async function projection() {
  const t = await ui.pick('Relation', TABLES);
  if (!t) return;
  const r = load(t);
  ui.note(`Attributes: ${r.cols.join(', ')}`);
  const cols = (await ui.askText('Attributes to keep (comma separated)', { def: t === 'student' ? 'city' : r.cols.slice(1, 3).join(',') }))
    .split(',').map((s) => s.trim()).filter(Boolean);
  for (const c of cols) if (!r.cols.includes(c)) throw new Error(`Unknown attribute ${c}`);
  show(`π ${cols.join(', ')} (${t})`, RA.project(r, cols), `SELECT DISTINCT ${cols.join(', ')} FROM ${t};`);
  ui.note(`${r.rows.length} tuples in → ${RA.project(r, cols).rows.length} out: projection removes duplicates (it is a SET operation).`);
}

async function setOps() {
  const A = load('A', "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3");
  const B = load('B', 'SELECT DISTINCT roll_no FROM v_defaulters');
  ui.info("A = π roll_no (σ dept_id='CS' ∧ year=3 (student))      B = π roll_no (defaulters)");
  ui.note('Both have the same schema (roll_no) → they are UNION-COMPATIBLE.');
  show('A ∪ B   (CS-3rd-year OR defaulter)', RA.union(A, B), "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3\nUNION\nSELECT roll_no FROM v_defaulters;", 8);
  show('A ∩ B   (CS-3rd-year AND defaulter)', RA.intersect(A, B), "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3\nINTERSECT\nSELECT roll_no FROM v_defaulters;");
  show('A − B   (CS-3rd-year but NOT defaulter)', RA.minus(A, B), "SELECT roll_no FROM student WHERE dept_id = 'CS' AND year = 3\nEXCEPT\nSELECT roll_no FROM v_defaulters;");
  ui.note('Identity:  A ∩ B = A − (A − B)');
}

async function product() {
  const d = load('department', 'SELECT dept_id, dept_name FROM department');
  const s = load('subject', "SELECT subject_id, dept_id FROM subject WHERE semester = 5");
  const p = RA.product(d, s);
  ui.info(`|department| = ${d.rows.length},  |subject| = ${s.rows.length}  ⇒  |department × subject| = ${p.rows.length}`);
  show('department × subject', p, 'SELECT * FROM department CROSS JOIN subject WHERE subject.semester = 5;', 6);
  const eqj = RA.select(p, (t) => t['department.dept_id'] === t['subject.dept_id']);
  show("σ department.dept_id = subject.dept_id (department × subject)   ← this IS a join", eqj,
    'SELECT * FROM department d JOIN subject s ON d.dept_id = s.dept_id WHERE s.semester = 5;', 10);
}

async function joins() {
  const f = load('faculty', 'SELECT faculty_id, name, dept_id FROM faculty');
  const d = load('department', 'SELECT dept_id, dept_name, building FROM department');
  const nj = RA.naturalJoin(f, d);
  ui.info(`Common attribute(s): ${nj.common.join(', ')} → matched automatically`);
  show('faculty ⋈ department', nj, 'SELECT * FROM faculty NATURAL JOIN department;', 10);

  const t = load('teaches', 'SELECT faculty_id, subject_id FROM teaches');
  const loj = RA.leftOuterJoin(f, t);
  show('faculty ⟕ teaches   (left outer join - faculty without subjects get NULL)', loj,
    'SELECT f.faculty_id, f.name, f.dept_id, t.subject_id FROM faculty f LEFT JOIN teaches t ON t.faculty_id = f.faculty_id;', 20);
  ui.note('NULL subject_id → that faculty teaches nothing. A plain ⋈ would silently drop this tuple.');
}

async function thetaRename() {
  const f = load('faculty', 'SELECT faculty_id, name, dept_id, salary FROM faculty');
  const f1 = RA.rename(f, 'F1');
  const f2 = RA.rename(f, 'F2');
  ui.info('Self-join needs RENAME:  ρ F1(faculty),  ρ F2(faculty)');
  const joined = RA.thetaJoin(f1, f2, (t) => t['F1.dept_id'] === t['F2.dept_id'] && t['F1.salary'] < t['F2.salary']);
  const res = RA.project(joined, ['F1.name', 'F1.salary', 'F2.name', 'F2.salary', 'F1.dept_id']);
  show('π F1.name, F2.name (ρF1(faculty) ⋈ F1.dept_id = F2.dept_id ∧ F1.salary < F2.salary  ρF2(faculty))', res,
    'SELECT F1.name, F1.salary, F2.name, F2.salary, F1.dept_id\nFROM faculty F1 JOIN faculty F2\n  ON F1.dept_id = F2.dept_id AND F1.salary < F2.salary;');
}

async function division() {
  const r = load('r', `SELECT DISTINCT a.roll_no, a.session_id FROM attendance a
                        JOIN class_session cs ON cs.session_id = a.session_id
                       WHERE cs.subject_id = 'CS501' AND a.status = 'P'`);
  const s = load('s', "SELECT session_id FROM class_session WHERE subject_id = 'CS501'");
  ui.info(`r(roll_no, session_id) = present-records in DBMS (${r.rows.length} tuples)`);
  ui.info(`s(session_id)          = all DBMS sessions (${s.rows.length} tuples)`);
  const q = RA.divide(r, s);
  show('r ÷ s   = students present in EVERY DBMS lecture', q,
    `SELECT DISTINCT e.roll_no FROM enrollment e
WHERE e.subject_id = 'CS501'
  AND NOT EXISTS (SELECT cs.session_id FROM class_session cs WHERE cs.subject_id = 'CS501'
                  AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = cs.session_id
                                  AND a.roll_no = e.roll_no AND a.status = 'P'));`);
  ui.note('SQL has no ÷ operator → we write it as "NOT EXISTS ... NOT EXISTS" (for-all = not-exists-not).');
  if (!q.rows.length) ui.note('Empty result is valid: nobody attended every single lecture.');
  const r2 = load('r2', `SELECT DISTINCT roll_no, exam_type FROM exam_result WHERE subject_id = 'CS501' AND marks_obtained IS NOT NULL`);
  const s2 = load('s2', `SELECT DISTINCT exam_type FROM exam_result`);
  show('π roll_no,exam_type(σ subject=CS501 ∧ marks≠NULL (exam_result)) ÷ π exam_type(exam_result)  = appeared in ALL exams', RA.divide(r2, s2),
    `SELECT roll_no FROM exam_result WHERE subject_id = 'CS501' AND marks_obtained IS NOT NULL
GROUP BY roll_no HAVING COUNT(DISTINCT exam_type) = (SELECT COUNT(DISTINCT exam_type) FROM exam_result);`);
}

async function aggregation() {
  const f = load('faculty', 'SELECT faculty_id, dept_id, salary FROM faculty');
  show('dept_id 𝒢 count(faculty_id), avg(salary), max(salary) (faculty)', RA.aggregate(f, ['dept_id'], [['count', 'faculty_id'], ['avg', 'salary'], ['max', 'salary']]),
    'SELECT dept_id, COUNT(faculty_id), ROUND(AVG(salary), 2), MAX(salary) FROM faculty GROUP BY dept_id;');
  const gp = { name: 'gp', cols: ['name', 'annual_salary'], rows: load('faculty').rows.map((t) => ({ name: t.name, annual_salary: t.salary * 12 })) };
  show('Generalised projection:  π name, salary*12 → annual_salary (faculty)', gp, 'SELECT name, salary * 12 AS annual_salary FROM faculty;');
  const e = load('exam_result', "SELECT roll_no, marks_obtained FROM exam_result WHERE subject_id = 'CS501' AND exam_type = 'MidSem'");
  show('𝒢 count(marks_obtained), avg(marks_obtained) (σ CS501 MidSem)  - NULLs are ignored', RA.aggregate(e, [], [['count', 'marks_obtained'], ['avg', 'marks_obtained']]),
    "SELECT COUNT(marks_obtained), ROUND(AVG(marks_obtained), 2) FROM exam_result WHERE subject_id = 'CS501' AND exam_type = 'MidSem';");
}

async function modification() {
  let d = load('department');
  ui.info('Database modification in relational algebra is expressed with assignment (←). Shown on an in-memory copy.');
  const ins = { name: 'E', cols: d.cols, rows: [{ dept_id: 'CIVIL', dept_name: 'Civil Engineering', building: 'E-Block', established_year: 2005 }] };
  d = RA.union(d, ins);
  show("INSERT:  department ← department ∪ {('CIVIL', 'Civil Engineering', 'E-Block', 2005)}", d);
  d = RA.minus(d, RA.select(d, (t) => t.established_year < 1995));
  show('DELETE:  department ← department − σ established_year < 1995 (department)', d);
  d = { ...d, rows: d.rows.map((t) => ({ ...t, building: t.building.replace('Block', 'Wing') })) };
  show("UPDATE:  department ← π dept_id, dept_name, replace(building,'Block','Wing'), established_year (department)", d);
  ui.note('SQL equivalents: INSERT INTO ... VALUES / DELETE FROM ... WHERE / UPDATE ... SET (see Lab Assignment 3).');
}

async function nulls() {
  ui.info('Three-valued logic: comparisons with NULL give UNKNOWN, and σ keeps only TRUE tuples.');
  ui.table(db.all(`SELECT NULL = NULL AS "NULL = NULL", NULL IS NULL AS "NULL IS NULL", 5 + NULL AS "5 + NULL",
                          (NULL AND 0) AS "unknown AND false", (NULL OR 1) AS "unknown OR true", COALESCE(NULL, 'x') AS "COALESCE(NULL,'x')"`));
  ui.table(db.all(`SELECT (SELECT COUNT(*) FROM exam_result WHERE marks_obtained > 10)          AS "marks > 10",
                          (SELECT COUNT(*) FROM exam_result WHERE NOT (marks_obtained > 10))    AS "NOT (marks > 10)",
                          (SELECT COUNT(*) FROM exam_result WHERE marks_obtained IS NULL)       AS "marks IS NULL",
                          (SELECT COUNT(*) FROM exam_result)                                     AS "total"`), { title: 'Why the counts do not add up' });
  ui.note('marks > 10  +  NOT(marks > 10)  ≠  total, because NULL rows are UNKNOWN in both.');
}

module.exports = {
  menu: () => runMenu('RELATIONAL ALGEBRA LAB', 'operators implemented in JS · verified against SQL', [
    { label: 'σ  Selection (your own condition)', hint: 'σ p (r)', action: selection },
    { label: 'π  Projection (duplicate removal)', hint: 'π A (r)', action: projection },
    { label: '∪ ∩ −  Set operations', hint: 'union-compatible', action: setOps },
    { label: '×  Cartesian product → join', hint: 'r × s', action: product },
    { label: '⋈ ⟕  Natural & outer joins', hint: 'r ⋈ s', action: joins },
    { label: 'ρ  Rename + θ-join (self join)', hint: 'ρ x (E)', action: thetaRename },
    { label: '÷  Division ("for all" queries)', hint: 'r ÷ s', action: division },
    { label: '𝒢  Aggregation & generalised projection', hint: 'extended RA', action: aggregation },
    { label: '←  Modification of the database', hint: 'insert / delete / update', action: modification },
    { label: '∅  NULL values & 3-valued logic', hint: 'unknown', action: nulls },
  ]),
  RA,
};
