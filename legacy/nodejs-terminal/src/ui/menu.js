'use strict';
// ============================================================================
//  GENERIC MENU LOOP - every screen in the app is built with runMenu().
//  items: [{ label, hint, action: async () => {}, adminOnly }]
//  Errors thrown by an action (e.g. SQLite constraint failures) are caught and
//  shown, so one bad input never crashes the whole program.
// ============================================================================
const ui = require('./term');
const session = require('../session');

async function runMenu(title, subtitle, items, { banner } = {}) {
  for (;;) {
    ui.header(title, subtitle);
    if (banner) banner();
    const shown = items.filter((it) => !it.adminOnly || session.isAdmin());
    const visible = shown.filter((it) => !it.divider);
    console.log();
    let n = 0;
    for (const it of shown) {
      if (it.divider) { console.log(ui.c.gray(`   ── ${it.divider} ${'─'.repeat(Math.max(4, 60 - it.divider.length))}`)); continue; }
      const num = ui.c.bCyan(ui.padStart(String(++n), 3));
      console.log(`  ${num}  ${ui.padEnd(it.label, 44)} ${ui.c.gray(it.hint || '')}`);
    }
    console.log(`  ${ui.c.gray('  0  Back / Exit')}`);
    console.log();
    const choice = await ui.ask(`  ${ui.c.bYellow('>')} Enter choice [0-${visible.length}]: `);
    if (choice === '0' || choice.toLowerCase() === 'q') return;
    const item = visible[Number(choice) - 1];
    if (!item) { ui.error('Invalid choice'); await ui.pause(); continue; }
    try {
      ui.header(`${title}  ›  ${item.label}`, item.hint);
      await item.action();
    } catch (err) {
      if (err instanceof ui.InputClosed) throw err;
      console.log();
      ui.error(friendlyError(err));
    }
    await ui.pause();
  }
}

// translate raw SQLite errors into readable messages (+ keep the original)
function friendlyError(err) {
  const msg = err && err.message ? err.message : String(err);
  const map = [
    [/UNIQUE constraint failed: (.+)/, (m) => `Duplicate value - UNIQUE/PRIMARY KEY violated on ${m[1]}`],
    [/FOREIGN KEY constraint failed/, () => 'Referential integrity violated - FOREIGN KEY constraint failed (parent row missing or child rows exist)'],
    [/CHECK constraint failed: (.+)/, (m) => `Domain constraint violated - CHECK failed: ${m[1]}`],
    [/NOT NULL constraint failed: (.+)/, (m) => `NOT NULL constraint failed on ${m[1]}`],
  ];
  for (const [re, f] of map) {
    const m = msg.match(re);
    if (m) return f(m);
  }
  return msg;
}

module.exports = { runMenu, friendlyError };
