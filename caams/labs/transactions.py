# ============================================================================
#  LAB 11 : TRANSACTIONS, CONCURRENCY CONTROL & RECOVERY (Unit 6 + self-study)
#  Part A - REAL transactions on SQLite (ACID, savepoints, locking between
#           two connections)
#  Part B - schedule analysis & protocol simulators (pure algorithms in
#           ./algorithms/concurrency.py)
# ============================================================================
from ..db import connection as db
from ..ui import term as ui
from ..ui.menu import friendly_error, run_menu
from .algorithms import concurrency as cc


# --------------------------------------------------------- sandbox table --
def setup_accounts():
    db.exec_("""CREATE TABLE IF NOT EXISTS lab_account (
                  acc_no  VARCHAR(5) PRIMARY KEY,
                  holder  VARCHAR(40) NOT NULL,
                  balance INTEGER NOT NULL CHECK (balance >= 0)   -- consistency rule
                );
                DELETE FROM lab_account;
                INSERT INTO lab_account VALUES ('A101', 'Aarav (student fee a/c)', 5000), ('B202', 'College account', 20000);""")


def drop_accounts():
    """The sandbox table is temporary: removed after every demo."""
    db.exec_('DROP TABLE IF EXISTS lab_account;')


def balances(title):
    ui.table(db.all_('SELECT acc_no, holder, balance, (SELECT SUM(balance) FROM lab_account) AS total_in_system FROM lab_account'), title=title)


def transfer(amount, crash_after_debit=False):
    d = db.get_db()
    print(ui.c.gray('    BEGIN TRANSACTION;                 -- state: ACTIVE'))
    d.execute('BEGIN')
    try:
        d.execute("UPDATE lab_account SET balance = balance - ? WHERE acc_no = 'A101'", (amount,))
        print(ui.c.gray('    UPDATE ... balance - %d (A101) -- ok' % amount))
        if crash_after_debit:
            raise RuntimeError('simulated power failure after the debit!')
        d.execute("UPDATE lab_account SET balance = balance + ? WHERE acc_no = 'B202'", (amount,))
        print(ui.c.gray('    UPDATE ... balance + %d (B202) -- ok   state: PARTIALLY COMMITTED' % amount))
        d.execute('COMMIT')
        print(ui.c.green('    COMMIT;                            -- state: COMMITTED (durable)'))
    except Exception as e:  # noqa: BLE001
        d.execute('ROLLBACK')
        print(ui.c.red('    ✗ %s  -- state: FAILED' % friendly_error(e)))
        print(ui.c.yellow('    ROLLBACK;                          -- state: ABORTED (all changes undone)'))


def acid_demo():
    setup_accounts()
    ui.box('Transfer ₹ from A101 → B202  =  2 UPDATEs that must be ATOMIC', [
        'Atomicity   : both updates or none        Consistency : CHECK (balance >= 0), total unchanged',
        'Isolation   : others never see half-done  Durability  : after COMMIT it survives a crash',
    ])
    balances('Initial state')
    ui.section('1) Valid transfer of 1500')
    transfer(1500)
    balances('After commit')
    ui.section('2) Transfer of 9999 (more than balance) → CHECK constraint fails')
    transfer(9999)
    balances('After rollback - unchanged')
    ui.section('3) Transfer of 1000 but the system crashes after the debit')
    transfer(1000, True)
    balances('After rollback - money did NOT vanish')
    ui.success('Total money in the system stayed constant in every case → consistency preserved.')
    drop_accounts()


def savepoint_demo():
    setup_accounts()
    d = db.get_db()

    def step(sql, note=None):
        ui.print_sql(sql)
        d.execute(sql)
        if note:
            ui.note(note)
    step('BEGIN;')
    step("UPDATE lab_account SET balance = balance - 500 WHERE acc_no = 'A101';", 'fee instalment 1 debited')
    step('SAVEPOINT after_first;')
    step("UPDATE lab_account SET balance = balance - 700 WHERE acc_no = 'A101';", 'instalment 2 (wrong amount!)')
    balances('Inside transaction, before partial rollback')
    step('ROLLBACK TO after_first;', 'undo ONLY the work after the savepoint')
    step('COMMIT;')
    balances('Committed: first debit kept, second undone')
    drop_accounts()


def states_diagram():
    print(ui.c.cyan(r"""
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
                       └──────────────────────┘"""))
    ui.note('Option 1 of this lab shows every state live on the lab_account table.')


def isolation_demo():
    setup_accounts()
    B = db.connect(db.DB_PATH, timeout=0)
    A = db.get_db()

    def bal(conn):
        return conn.execute("SELECT balance FROM lab_account WHERE acc_no = 'A101'").fetchone()['balance']
    try:
        ui.info('Two independent connections to the same database file: A (this app) and B (a second user).')
        print('    A: BEGIN IMMEDIATE  %s' % ui.c.gray('-- takes a RESERVED (write-intent) lock'))
        A.execute('BEGIN IMMEDIATE')
        A.execute("UPDATE lab_account SET balance = 0 WHERE acc_no = 'A101'")
        print('    A: UPDATE balance = 0  (not committed)    A sees %s' % ui.c.bold(bal(A)))
        print('    B: SELECT balance                          B sees %s  %s' % (ui.c.bold(bal(B)), ui.c.green('← no dirty read (old committed value)')))
        try:
            B.execute('BEGIN IMMEDIATE')
            print('    B: got a write lock?!')
            B.execute('ROLLBACK')
        except Exception as e:  # noqa: BLE001
            print('    B: BEGIN IMMEDIATE → %s  %s' % (ui.c.red(str(e)), ui.c.gray('← writers are serialised (lock conflict)')))
        A.execute('COMMIT')
        print('    A: COMMIT')
        print('    B: SELECT balance                          B sees %s  %s' % (ui.c.bold(bal(B)), ui.c.green('← committed change now visible')))
        C = db.connect(db.DB_PATH)
        print('    C: brand-new connection (like after a restart) sees %s  %s' % (ui.c.bold(bal(C)), ui.c.green('← durability')))
        C.close()
        ui.box('What SQLite guarantees', [
            'SQLite runs transactions as SERIALIZABLE: one writer at a time, many readers.',
            'Locks: SHARED (read) → RESERVED (intent to write) → EXCLUSIVE (during commit).',
            'This is lock-based concurrency control at DATABASE granularity.',
        ])
    finally:
        if A.in_transaction:
            A.execute('ROLLBACK')
        B.close()
        drop_accounts()


# ----------------------------------------------------- schedule presets ---
SCHEDULES = [
    ('Serializable interleaving', 'R1(A) W1(A) R2(A) W2(A) R1(B) W1(B) C1 R2(B) W2(B) C2'),
    ('Lost update (not serializable)', 'R1(A) R2(A) W1(A) W2(A) C1 C2'),
    ('Blind writes: view- but NOT conflict-serializable', 'R1(A) W2(A) C2 W1(A) C1 W3(A) C3'),
    ('Non-recoverable (dirty read then early commit)', 'W1(A) R2(A) C2 C1'),
    ('Cascading rollback', 'W1(A) R2(A) W2(B) R3(B) A1'),
    ('Deadlock under 2PL', 'R1(A) R2(B) W1(B) W2(A) C1 C2'),
    ('Timestamp ordering conflict', 'R1(A) R2(A) W2(A) W1(A) C1 C2'),
    ("Thomas' write rule case", 'R1(A) W2(A) W1(A) C1 C2'),
]


def _tx_names(txs):
    return ', '.join('T%d' % t for t in txs)


def get_schedule(def_idx=0):
    p = ui.pick('Schedule', SCHEDULES + [('Type my own schedule', None)],
                lambda s: '%s %s' % (ui.pad_end(s[0], 50), ui.c.gray(s[1])) if s[1] else s[0])
    if not p:
        return None
    text = p[1] or ui.ask_text('Schedule (e.g. R1(A) W2(A) C1 C2)', default=SCHEDULES[def_idx][1])
    ops = cc.parse_schedule(text)
    draw_schedule(ops)
    return ops


def draw_schedule(ops):
    txs = sorted(cc.tx_list(ops))
    ui.section('Schedule (time flows downward)')
    print('    ' + ui.c.gray('t   ') + ''.join(ui.c.bold(ui.pad_end('T%d' % t, 10)) for t in txs))
    for i, o in enumerate(ops):
        print('    ' + ui.c.gray(str(i + 1).ljust(4)) + ''.join(
            ui.pad_end(ui.c.cyan(cc.op_str(o)) if t == o['tx'] else ui.c.gray('·'), 10) for t in txs))


def analyze_schedule():
    ops = get_schedule()
    if not ops:
        return
    cs = cc.conflict_serializable(ops)
    ui.section('Conflicting pairs → precedence graph edges')
    if cs['reasons']:
        for r in cs['reasons']:
            ui.note(r)
    else:
        ui.note('no conflicts')
    print('    Edges: %s' % (', '.join('T%d→T%d' % (a, b) for a, b in cs['edges']) or 'none'))
    if cs['serializable']:
        ui.success('CONFLICT SERIALIZABLE - no cycle. Equivalent serial order: %s' % ' → '.join('T%d' % t for t in cs['order']))
    else:
        ui.error('NOT conflict serializable - cycle %s' % ' → '.join('T%d' % t for t in cs['cycle']))
    vs = cc.view_serializable(ops)
    if vs['checked']:
        if vs['serializable']:
            ui.success('VIEW SERIALIZABLE - view-equivalent to %s' % ' → '.join('T%d' % t for t in vs['order']))
        else:
            ui.error('NOT view serializable')
        if vs['serializable'] and not cs['serializable']:
            ui.note('View- but not conflict-serializable ⇒ the schedule must contain BLIND WRITES.')
    rc = cc.recoverability(ops)
    ui.section('Recoverability')
    for k, label in (('recoverable', 'Recoverable'), ('cascadeless', 'Cascadeless (avoids cascading rollback)'), ('strict', 'Strict')):
        print('    %s %s' % (ui.c.green('✓') if rc[k] else ui.c.red('✗'), label))
        for p in rc['problems'][k]:
            ui.note('    ' + p)
    ui.note('Every strict schedule is cascadeless, every cascadeless schedule is recoverable.')


def _ts_str(ts):
    return ' '.join('T%d=%d' % (t, ts[t]) for t in sorted(ts))


def two_pl():
    ops = get_schedule(5)
    if not ops:
        return
    scheme = ui.pick('Deadlock handling', [
        ('detect', 'Detection: wait-for graph, abort youngest victim'),
        ('wait-die', 'Prevention: WAIT-DIE (non-preemptive)'),
        ('wound-wait', 'Prevention: WOUND-WAIT (preemptive)'),
    ], lambda s: s[1])
    if not scheme:
        return
    r = cc.simulate_2pl(ops, scheme[0])
    ui.info('Strict 2PL: S-lock to read, X-lock to write, ALL locks released only at commit/abort.   Timestamps: %s' % _ts_str(r['ts']))
    ui.table(r['log'], columns=['step', 'action'], max_width=110)
    print('    Executed order : %s' % ' '.join(r['executed']))
    if r['aborted']:
        ui.warn('Aborted: %s' % _tx_names(r['aborted']))
    ui.note('Growing phase = acquiring locks; shrinking phase = releasing them. Never acquire after releasing.')


def timestamp_ordering():
    ops = get_schedule(6)
    if not ops:
        return
    thomas = ui.confirm("Apply Thomas' write rule?", False)
    r = cc.simulate_timestamp(ops, thomas)
    ui.info('TS(Ti) = order of arrival: %s.  R-TS / W-TS = largest TS that read / wrote the item' % _ts_str(r['ts']))
    ui.table(r['log'], columns=['op', 'ts', 'r_ts', 'w_ts', 'decision'], max_width=90)
    if r['aborted']:
        ui.warn('Rolled back: %s (restarted later with a NEW timestamp)' % _tx_names(r['aborted']))
    else:
        ui.success('All operations accepted.')


def validation():
    ops = get_schedule(0)
    if not ops:
        return
    ui.info('Optimistic: READ phase (local copies) → VALIDATION at commit → WRITE phase.')
    ui.note('Ti passes if for every earlier-validated Tj: finish(Tj) < start(Ti)  OR  WS(Tj) ∩ RS(Ti) = ∅')
    ui.table(cc.simulate_validation(ops), max_width=70)


def granularity():
    modes = ['IS', 'IX', 'S', 'SIX', 'X']
    ok = {'IS': ['IS', 'IX', 'S', 'SIX'], 'IX': ['IS', 'IX'], 'S': ['IS', 'S'], 'SIX': ['IS'], 'X': []}
    ui.section('Compatibility matrix (✓ = can be granted together)')
    print('          ' + ''.join(ui.pad_end(m, 6) for m in modes))
    for a in modes:
        print('    ' + ui.pad_end(a, 6) + ''.join(ui.pad_end(ui.c.green('✓') if b in ok[a] else ui.c.red('✗'), 6) for b in modes))
    print(ui.c.cyan(r"""
    Hierarchy:      college_db (database)
                        ├── student (table / file)
                        │      ├── 23CS001 (row / record)
                        │      └── 23CS002
                        └── attendance ..."""))
    held = []

    def request(tx, path):
        print('\n  ' + ui.c.bold('T%d: %s' % (tx, ' → '.join('%s(%s)' % (mode, node) for node, mode in path))))
        for node, mode in path:
            clash = next((h for h in held if h['node'] == node and h['tx'] != tx and h['mode'] not in ok[mode]), None)
            if clash:
                print("    %s %s on %s conflicts with T%d's %s" % (ui.c.red('WAIT'), mode, node, clash['tx'], clash['mode']))
                return
            held.append({'tx': tx, 'node': node, 'mode': mode})
            print('    %s %s on %s' % (ui.c.green('GRANT'), mode, node))
    request(1, [('college_db', 'IX'), ('student', 'IX'), ('23CS001', 'X')])
    request(2, [('college_db', 'IS'), ('student', 'IS'), ('23CS002', 'S')])
    request(3, [('college_db', 'IS'), ('student', 'S')])
    ui.note('Rules: lock root first, top-down; to get S/IS on a node hold IS/IX on its parent; to get X/IX/SIX hold IX/SIX on parent.')
    ui.note('T3 wants to read the WHOLE table, but T1 is writing one row inside it → intention lock IX blocks S.')


LOGS = [
    ('Checkpoint + one committed, one incomplete tx',
     '<T0 start> <T0, A, 1000, 950> <T1 start> <T0, B, 2000, 2050> <T0 commit> <T1, C, 700, 600> <checkpoint T1> <T2 start> <T2, A, 950, 500> <T1 commit> <T2, D, 100, 200>',
     {'A': 1000, 'B': 2000, 'C': 700, 'D': 100}),
    ('No checkpoint, two losers',
     '<T1 start> <T1, X, 50, 80> <T2 start> <T2, Y, 10, 20> <T1 commit> <T3 start> <T3, X, 80, 90> <T2, Z, 5, 6>',
     {'X': 50, 'Y': 10, 'Z': 5}),
]


def recovery():
    p = ui.pick('Log before the crash', LOGS, lambda l: l[0])
    if not p:
        return
    recs = cc.parse_log(p[1])
    ui.section('Write-ahead log (stable storage)')
    for i, r in enumerate(recs):
        print('    %s  %s' % (ui.c.gray(str(i + 1).rjust(2)), ui.c.yellow(r['raw']) if r['kind'] == 'checkpoint' else r['raw']))
    print('    ' + ui.c.bRed('CRASH'))
    res = cc.recover(recs, p[2])

    def row(title, s):
        return dict({'state': title}, **s)
    ui.section('Recovery = ANALYSIS → REDO (repeat history) → UNDO (losers)   (ARIES idea)')
    ui.info('Committed (winners): %s     Incomplete (losers → undo-list): %s' % (
        _tx_names(res['committed']) or 'none', _tx_names(res['losers']) or 'none'))
    ui.table(res['steps'], columns=['phase', 'record', 'effect'])
    ui.table([row('disk at crash', res['at_crash']), row('after REDO', res['after_redo']), row('after UNDO = final', res['final'])],
             title='Data item values')
    ui.info('Compensation log records written during undo: %s' % ' '.join(res['clr']))
    ui.note('Redo from the last checkpoint only - that is why checkpoints make recovery fast.')


def menu():
    run_menu('TRANSACTIONS & CONCURRENCY LAB', 'ACID · serializability · locking · timestamps · recovery', [
        {'label': 'ACID demo: atomic money transfer', 'hint': 'real COMMIT / ROLLBACK', 'action': acid_demo},
        {'label': 'Savepoints (partial rollback)', 'hint': 'SAVEPOINT / ROLLBACK TO', 'action': savepoint_demo},
        {'label': 'Transaction state diagram', 'hint': 'active → committed', 'action': states_diagram},
        {'label': 'Isolation & locking: 2 real connections', 'hint': 'no dirty read, lock conflict', 'action': isolation_demo},
        {'label': 'Schedule analyser (serializability)', 'hint': 'precedence graph, recoverable', 'action': analyze_schedule},
        {'label': 'Two-phase locking simulator + deadlocks', 'hint': 'detect / wait-die / wound-wait', 'action': two_pl},
        {'label': 'Timestamp-ordering protocol', 'hint': "+ Thomas' write rule", 'action': timestamp_ordering},
        {'label': 'Validation-based (optimistic) protocol', 'hint': 'read / validate / write', 'action': validation},
        {'label': 'Multiple-granularity locking', 'hint': 'IS IX S SIX X (self-study)', 'action': granularity},
        {'label': 'Crash recovery from the log', 'hint': 'redo / undo, ARIES (self-study)', 'action': recovery},
    ])
