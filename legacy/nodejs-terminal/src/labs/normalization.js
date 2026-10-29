'use strict';
// ============================================================================
//  LAB 9 : NORMALIZATION (Unit 4)  - 1NF → 2NF → 3NF → BCNF
//  Enter ANY relation + functional dependencies and the lab computes
//  closures, candidate keys, canonical cover, normal form, and both
//  decompositions (3NF synthesis, BCNF) with lossless/dependency checks.
// ============================================================================
const ui = require('../ui/term');
const { runMenu } = require('../ui/menu');
const fd = require('./algorithms/fd');

const PRESETS = [
  {
    name: 'OUR PROJECT: un-normalised attendance sheet (how our schema was derived)',
    rel: 'roll_no, student_name, dept_id, dept_name, subject_id, subject_name, faculty_id, faculty_name, session_id, session_date, status',
    fds: 'roll_no -> student_name, dept_id; dept_id -> dept_name; subject_id -> subject_name; faculty_id -> faculty_name; session_id -> subject_id, faculty_id, session_date; session_id, roll_no -> status',
  },
  {
    name: 'OUR PROJECT: exam marks sheet with grade',
    rel: 'roll_no, subject_id, exam_type, marks, max_marks, student_name, credits',
    fds: 'roll_no, subject_id, exam_type -> marks; exam_type -> max_marks; roll_no -> student_name; subject_id -> credits',
  },
  { name: 'Silberschatz: R(A,B,C,D,E)', rel: 'ABCDE', fds: 'A -> BC; CD -> E; B -> D; E -> A' },
  { name: 'Classic BCNF-but-not-dependency-preserving: R(A,B,C)', rel: 'ABC', fds: 'AB -> C; C -> B' },
  { name: 'Classic 2NF violation: EMP_PROJ', rel: 'ssn, pnumber, hours, ename, pname, plocation', fds: 'ssn, pnumber -> hours; ssn -> ename; pnumber -> pname, plocation' },
  { name: 'Transitive dependency: R(A,B,C,D)', rel: 'ABCD', fds: 'A -> B; B -> C; C -> D' },
];

const set = (a) => `{${a.join(', ')}}`;

async function getInput() {
  const choice = await ui.pick('Choose a relation', [...PRESETS, { name: 'Enter my own relation + FDs' }], (p) => p.name);
  if (!choice) return null;
  if (choice.rel) return { relText: choice.rel, fdText: choice.fds };
  ui.note('Attributes: "ABCDE" (single letters) or "roll_no, name, dept" (comma separated)');
  const relText = await ui.askText('Relation attributes', { required: true });
  ui.note('FDs separated by ";"   e.g.   A -> B; B,C -> D     or   roll_no -> name; dept -> hod');
  const fdText = await ui.askText('Functional dependencies', { required: true });
  return { relText, fdText };
}

function parse({ relText, fdText }) {
  const rel = fd.parseRelation(relText);
  const fds = fd.parseFDs(fdText, rel);
  return { attrs: rel.attrs, fds, rel };
}

async function fullAnalysis() {
  const input = await getInput();
  if (!input) return;
  const { attrs, fds } = parse(input);
  ui.box('Relation', [`R(${attrs.join(', ')})`, ...fds.map((f) => `  ${fd.fdStr(f)}`)]);

  const a = fd.analyze(attrs, fds);
  ui.section('Step 1 - Attribute closures of the LHS of each FD');
  for (const f of fds) {
    const cl = fd.closure(f.lhs, fds);
    const sk = cl.length === attrs.length;
    console.log(`    ${ui.padEnd(set(f.lhs) + '⁺', 28)} = ${set(cl)} ${sk ? ui.c.green('← superkey') : ''}`);
  }
  ui.section('Step 2 - Candidate keys');
  a.keys.forEach((k) => console.log(`    ${ui.c.bold(set(k))}`));
  console.log(`    Prime attributes     : ${set(a.prime)}`);
  console.log(`    Non-prime attributes : ${set(a.nonPrime)}`);

  ui.section('Step 3 - Canonical (minimal) cover');
  fd.combineByLhs(a.cover).forEach((f) => console.log(`    ${fd.fdStr(f)}`));

  ui.section('Step 4 - Normal form tests');
  console.log(`    1NF : ${ui.c.green('✓')} assumed (all attributes atomic - multivalued attrs moved to own table)`);
  if (a.partial.length) a.partial.forEach((p) => console.log(`    2NF : ${ui.c.red('✗')} partial dependency ${set(p.lhs)} → ${set(p.rhs)}  (${set(p.lhs)} is part of key ${set(p.key)})`));
  else console.log(`    2NF : ${ui.c.green('✓')} no non-prime attribute depends on part of a candidate key`);
  if (a.v3.length) a.v3.forEach((v) => console.log(`    3NF : ${ui.c.red('✗')} ${fd.fdStr(v)}  - LHS not a superkey and ${v.rhs[0]} is non-prime${a.transitive.includes(v) ? ' (transitive)' : ''}`));
  else console.log(`    3NF : ${ui.c.green('✓')} for every X → A: X is a superkey or A is prime`);
  if (a.vBcnf.length) a.vBcnf.forEach((v) => console.log(`    BCNF: ${ui.c.red('✗')} ${fd.fdStr(v)}  - LHS is not a superkey`));
  else console.log(`    BCNF: ${ui.c.green('✓')} every determinant is a superkey`);
  const colour = a.nf === 'BCNF' ? ui.c.bgGreen : a.nf === '3NF' ? ui.c.bgYellow : ui.c.bgRed;
  console.log(`\n    Highest normal form satisfied:  ${colour(` ${a.nf} `)}`);

  if (a.nf !== 'BCNF') {
    ui.section('Step 5a - 3NF decomposition (synthesis algorithm)');
    const s3 = fd.synthesis3NF(attrs, fds);
    s3.forEach((s, i) => console.log(`    R${i + 1}(${s.attrs.join(', ')})  ${ui.c.gray('from ' + s.from)}`));
    report(attrs, s3.map((s) => s.attrs), fds);

    ui.section('Step 5b - BCNF decomposition');
    const b = fd.bcnfDecompose(attrs, fds);
    b.steps.forEach((s) => console.log(`    split (${s.relation.join(',')}) on ${set(s.violating.lhs)} → ${set(s.violating.rhs)}  ⇒  (${s.r1.join(',')}) + (${s.r2.join(',')})`));
    b.relations.forEach((r, i) => {
      const proj = fd.projectFDs(r, fds);
      console.log(`    R${i + 1}(${r.join(', ')})  ${ui.c.gray(proj.map(fd.fdStr).join('; ') || 'no non-trivial FDs')}`);
    });
    report(attrs, b.relations, fds);
  }
}

function report(attrs, decomposition, fds) {
  const ll = fd.losslessChase(attrs, decomposition, fds);
  const dp = fd.dependencyPreserved(decomposition, fds);
  console.log(`      Lossless join (chase test)  : ${ll.lossless ? ui.c.green('✓ yes') : ui.c.red('✗ NO')}`);
  console.log(`      Dependency preserving       : ${dp.preserved ? ui.c.green('✓ yes') : ui.c.yellow('✗ no - lost ' + dp.lost.map(fd.fdStr).join(', '))}`);
}

async function closureCalc() {
  const input = await getInput();
  if (!input) return;
  const { attrs, fds, rel } = parse(input);
  ui.note(`R(${attrs.join(', ')})`);
  const x = await ui.askText('Attribute set X to compute X⁺', { def: attrs[0] });
  const xs = x.split(/[\s,]+/).filter(Boolean).flatMap((t) => (rel.singleChar && t.length > 1 ? [...t] : [t]));
  const trace = [];
  const cl = fd.closure(xs, fds, trace);
  ui.section(`Computing {${xs.join(',')}}⁺`);
  console.log(`    start: {${xs.join(',')}}`);
  trace.forEach((t) => console.log('    ' + t));
  console.log(`\n    ${ui.c.bold(`{${xs.join(',')}}⁺ = ${set(cl)}`)}  ${cl.length === attrs.length ? ui.c.green('→ X is a SUPERKEY') : ui.c.yellow('→ not a superkey')}`);
}

async function decompositionCheck() {
  const input = await getInput();
  if (!input) return;
  const { attrs, fds, rel } = parse(input);
  ui.note(`R(${attrs.join(', ')})`);
  ui.note('Enter the decomposition as relations separated by "|",  e.g.  AB | BC   or   roll_no,name | roll_no,dept');
  const text = await ui.askText('Decomposition', { required: true });
  const parts = text.split('|').map((p) => {
    const toks = p.split(/[\s,]+/).filter(Boolean);
    const list = rel.singleChar ? toks.flatMap((t) => [...t]) : toks;
    for (const a of list) if (!attrs.includes(a)) throw new Error(`Attribute "${a}" is not in R`);
    return [...new Set(list)].sort();
  });
  const ll = fd.losslessChase(attrs, parts, fds);
  ui.section('Chase tableau after applying all FDs (a = known, bᵢ = unknown)');
  ui.table(ll.tableau.map((row, i) => ({ relation: `R${i + 1}`, ...Object.fromEntries(attrs.map((a, j) => [a, row[j]])) })));
  report(attrs, parts, fds);
}

async function mvdNote() {
  ui.box('Multivalued dependency (self-study) - how our schema handles it', [
    'A student can have MANY phone numbers and is enrolled in MANY subjects,',
    'and these two facts are independent of each other:',
    '',
    '     roll_no ↠ phone          roll_no ↠ subject_id',
    '',
    'If we stored  STUDENT_INFO(roll_no, phone, subject_id)  every phone would be',
    'repeated for every subject (2 phones × 4 subjects = 8 rows) → redundancy',
    'even though the table is in BCNF (key = all three attributes).',
    '',
    '4NF fix (what we did):  student_phone(roll_no, phone)',
    '                        enrollment(roll_no, subject_id)',
  ]);
}

module.exports = {
  menu: () => runMenu('NORMALIZATION LAB', 'FDs · keys · 1NF → BCNF · decomposition', [
    { label: 'Full analysis + decomposition', hint: 'keys, NF, 3NF & BCNF', action: fullAnalysis },
    { label: 'Attribute closure X⁺ (step by step)', hint: 'closure algorithm', action: closureCalc },
    { label: 'Test MY decomposition', hint: 'lossless + dep. preserving', action: decompositionCheck },
    { label: '↠  Multivalued dependencies & 4NF', hint: 'self-study', action: mvdNote },
  ]),
};
