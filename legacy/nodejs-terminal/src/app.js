#!/usr/bin/env node
'use strict';
// ============================================================================
//  CAAMS - College Academic & Attendance Management System
//  ENTRY POINT:  npm start   (node src/app.js)
//    1. make sure the database exists (build it on first run)
//    2. login (admin / faculty)
//    3. main menu → modules (application) and labs (syllabus concepts)
// ============================================================================
const db = require('./db/connection');
const init = require('./db/init');
const auth = require('./db/auth');
const session = require('./session');
const ui = require('./ui/term');
const { runMenu } = require('./ui/menu');

const modules = {
  students: require('./modules/students'),
  faculty: require('./modules/faculty'),
  attendance: require('./modules/attendance'),
  results: require('./modules/results'),
  defaulters: require('./modules/defaulters'),
  reports: require('./modules/reports'),
  labs: require('./modules/labAssignments'),
  sql: require('./modules/sqlConsole'),
  admin: require('./modules/admin'),
};
const labs = {
  concepts: require('./labs/concepts'),
  algebra: require('./labs/relationalAlgebra'),
  normalization: require('./labs/normalization'),
  indexing: require('./labs/indexing'),
  transactions: require('./labs/transactions'),
};

async function login() {
  ui.clear();
  console.log('\n   ' + ui.c.bold('CAAMS - College Academic & Attendance Management System'));
  console.log(ui.c.gray('   DBMS mini project (Node.js + SQLite)\n'));
  ui.note('Login: admin / admin@123   or   fac101 / fac101@123 (fac101 to fac110)');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const user = await ui.ask(`\n  ${ui.c.cyan('Username')}: `);
    const pass = await ui.ask(`  ${ui.c.cyan('Password')}: `);
    const u = auth.login(user, pass);
    if (u) {
      session.set(u);
      ui.success(`Welcome, ${u.name} (${u.role})`);
      return true;
    }
    ui.error(`Invalid username or password (${3 - attempt} attempt(s) left)`);
  }
  return false;
}

function statusBar() {
  const s = db.get(`SELECT (SELECT COUNT(*) FROM student) AS st, (SELECT COUNT(*) FROM class_session) AS se,
                           (SELECT COUNT(DISTINCT roll_no) FROM v_defaulters) AS df,
                           (SELECT COUNT(*) FROM leave_request WHERE status = 'Pending') AS pl`);
  const u = session.user;
  console.log(ui.c.gray(`   Logged in: ${u.name} (${u.role})  |  Students: ${s.st}  |  Sessions: ${s.se}  |  `) +
    ui.c.red(`Defaulters: ${s.df}`) + ui.c.gray('  |  ') + ui.c.yellow(`Pending leaves: ${s.pl}`));
}

async function main() {
  const created = init.ensureDatabase();
  if (created) {
    ui.success('First run: database created from sql/*.sql and sample data generated.');
    modules.labs.exportSql();
  }
  if (!(await login())) return;

  await runMenu('CAAMS - MAIN MENU', 'College Academic & Attendance Management System', [
    { divider: 'APPLICATION' },
    { label: 'Student management', hint: 'CRUD', action: modules.students.menu },
    { label: 'Faculty, subjects & departments', hint: 'master data', action: modules.faculty.menu },
    { label: 'Attendance', hint: 'take / view / correct', action: modules.attendance.menu },
    { label: 'Exams & results', hint: 'marks, grades, SGPA', action: modules.results.menu },
    { label: 'Defaulters & leaves', hint: '75% rule', action: modules.defaulters.menu },
    { label: 'Reports & analytics', hint: 'dashboard', action: modules.reports.menu },
    { divider: 'SYLLABUS LABS' },
    { label: 'DBMS concepts tour', hint: 'Unit 1', action: labs.concepts.menu },
    { label: 'Relational algebra lab', hint: 'Unit 3', action: labs.algebra.menu },
    { label: 'Lab assignments 1-4 (SQL)', hint: 'Unit 3 + lab', action: modules.labs.menu },
    { label: 'Normalization lab', hint: 'Unit 4', action: labs.normalization.menu },
    { label: 'Indexing & hashing lab', hint: 'Unit 5', action: labs.indexing.menu },
    { label: 'Transactions & concurrency lab', hint: 'Unit 6', action: labs.transactions.menu },
    { divider: 'TOOLS' },
    { label: 'SQL console', hint: 'run any SQL', action: modules.sql.menu },
    { label: 'Database administration', hint: 'ER, backup, export', action: modules.admin.menu },
  ], { banner: statusBar });
}

main()
  .catch((err) => {
    if (!(err instanceof ui.InputClosed)) {
      console.error(ui.c.red('\nFatal error: ' + (err.stack || err.message)));
      process.exitCode = 1;
    }
  })
  .finally(() => {
    console.log(ui.c.gray('\n  Exiting. Database closed.\n'));
    db.close();
    ui.close();
  });
