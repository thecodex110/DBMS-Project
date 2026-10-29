# ============================================================================
#  GENERIC MENU LOOP - every screen in the app is built with run_menu().
#  items: [{'label', 'hint', 'action': fn, 'admin_only'}]  or  {'divider': text}
#  Errors raised by an action (e.g. SQLite constraint failures) are caught and
#  shown, so one bad input never crashes the whole program.
# ============================================================================
import re

from . import term as ui
from .. import session


def run_menu(title, subtitle, items, banner=None):
    while True:
        ui.header(title, subtitle)
        if banner:
            banner()
        shown = [it for it in items if not it.get('admin_only') or session.is_admin()]
        visible = [it for it in shown if 'divider' not in it]
        print()
        n = 0
        for it in shown:
            if 'divider' in it:
                print(ui.c.gray('   ── %s %s' % (it['divider'], '─' * max(4, 60 - len(it['divider'])))))
                continue
            n += 1
            num = ui.c.bCyan(ui.pad_start(str(n), 3))
            print('  %s  %s %s' % (num, ui.pad_end(it['label'], 44), ui.c.gray(it.get('hint') or '')))
        print('  %s' % ui.c.gray('  0  Back / Exit'))
        print()
        choice = ui.ask('  %s Enter choice [0-%d]: ' % (ui.c.bYellow('>'), len(visible)))
        if choice == '0' or choice.lower() == 'q':
            return
        item = visible[int(choice) - 1] if choice.isdigit() and 1 <= int(choice) <= len(visible) else None
        if not item:
            ui.error('Invalid choice')
            ui.pause()
            continue
        try:
            ui.header('%s  ›  %s' % (title, item['label']), item.get('hint'))
            item['action']()
        except ui.InputClosed:
            raise
        except Exception as err:  # noqa: BLE001 - any failure is shown, never fatal
            print()
            ui.error(friendly_error(err))
        ui.pause()


_MAP = [
    (re.compile(r'UNIQUE constraint failed: (.+)'), lambda m: 'Duplicate value - UNIQUE/PRIMARY KEY violated on %s' % m.group(1)),
    (re.compile(r'FOREIGN KEY constraint failed'), lambda m: 'Referential integrity violated - FOREIGN KEY constraint failed (parent row missing or child rows exist)'),
    (re.compile(r'CHECK constraint failed: (.+)'), lambda m: 'Domain constraint violated - CHECK failed: %s' % m.group(1)),
    (re.compile(r'NOT NULL constraint failed: (.+)'), lambda m: 'NOT NULL constraint failed on %s' % m.group(1)),
]


def friendly_error(err):
    """Translate raw SQLite errors into readable messages (+ keep the original)."""
    msg = str(err) if err is not None else ''
    for rx, f in _MAP:
        m = rx.search(msg)
        if m:
            return f(m)
    return msg
