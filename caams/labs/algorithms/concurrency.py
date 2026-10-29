# ============================================================================
#  TRANSACTION / CONCURRENCY ALGORITHMS  (pure, no UI)
#  Schedule notation:  R1(A)  W2(B)  C1  A2      (A = abort)
#    - conflict serializability (precedence graph)
#    - view serializability (brute force over serial orders)
#    - recoverable / cascadeless / strict
#    - strict two-phase locking with deadlock detection / wait-die / wound-wait
#    - timestamp-ordering protocol (+ Thomas' write rule)
#    - validation-based (optimistic) protocol
#    - log-based recovery (redo + undo, ARIES-style "repeat history")
#  An operation is a dict {'type': 'R'|'W'|'C'|'A', 'tx': int, 'item': str|None}
# ============================================================================
import json
import re
from itertools import permutations


def parse_schedule(text):
    ops = []
    for m in re.finditer(r'([RWCA])\s*(\d+)\s*(?:\(\s*([A-Za-z0-9_]+)\s*\))?', text, re.I):
        type_ = m.group(1).upper()
        if type_ in ('R', 'W') and not m.group(3):
            raise ValueError('%s needs a data item, e.g. R1(A)' % m.group(0))
        ops.append({'type': type_, 'tx': int(m.group(2)), 'item': m.group(3).upper() if m.group(3) else None})
    if not ops:
        raise ValueError('No operations found. Example: R1(A) W1(A) R2(A) C1 C2')
    return ops


def op_str(o):
    return '%s%d(%s)' % (o['type'], o['tx'], o['item']) if o.get('item') else '%s%d' % (o['type'], o['tx'])


def tx_list(ops):
    return list(dict.fromkeys(o['tx'] for o in ops))


# ------------------------------------------------- conflict serializability
def precedence_graph(ops):
    edges, reasons = [], []
    for i in range(len(ops)):
        for j in range(i + 1, len(ops)):
            a, b = ops[i], ops[j]
            if a['tx'] == b['tx'] or not a['item'] or a['item'] != b['item']:
                continue
            if a['type'] == 'W' or b['type'] == 'W':
                if [a['tx'], b['tx']] not in edges:
                    edges.append([a['tx'], b['tx']])
                reasons.append('%s before %s  ⇒  T%d → T%d' % (op_str(a), op_str(b), a['tx'], b['tx']))
    return {'edges': edges, 'reasons': reasons}


def find_cycle(nodes, edges):
    adj = {n: [] for n in nodes}
    for u, v in edges:
        adj[u].append(v)
    state, stack = {}, []
    cycle = []

    def dfs(u):
        state[u] = 1
        stack.append(u)
        for v in adj[u]:
            if cycle:
                return
            if state.get(v) == 1:
                cycle.extend(stack[stack.index(v):] + [v])
                return
            if not state.get(v):
                dfs(v)
        stack.pop()
        state[u] = 2

    for n in nodes:
        if not state.get(n) and not cycle:
            dfs(n)
    return cycle or None


def topo_order(nodes, edges):
    indeg = {n: 0 for n in nodes}
    for _, v in edges:
        indeg[v] += 1
    order = []
    ready = sorted(n for n in nodes if indeg[n] == 0)
    while ready:
        u = ready.pop(0)
        order.append(u)
        for x, v in edges:
            if x == u:
                indeg[v] -= 1
                if indeg[v] == 0:
                    ready.append(v)
                    ready.sort()
    return order


def conflict_serializable(ops):
    nodes = tx_list(ops)
    g = precedence_graph(ops)
    cycle = find_cycle(nodes, g['edges'])
    return dict(g, nodes=nodes, cycle=cycle, serializable=not cycle,
                order=None if cycle else topo_order(nodes, g['edges']))


# ----------------------------------------------------- view serializability
def view_info(ops):
    reads_from, last_writer, final_write = [], {}, {}
    for o in ops:
        if o['type'] == 'R':
            reads_from.append('%s:%s:%s' % (o['tx'], o['item'], last_writer.get(o['item'], 'init')))
        if o['type'] == 'W':
            last_writer[o['item']] = o['tx']
            final_write[o['item']] = o['tx']
    return {'reads_from': ';'.join(sorted(reads_from)), 'final_write': json.dumps(sorted(final_write.items()))}


def view_serializable(ops):
    rw = [o for o in ops if o['type'] in ('R', 'W')]
    txs = tx_list(rw)
    if len(txs) > 7:
        return {'checked': False}
    target = view_info(rw)
    for perm in permutations(txs):
        serial = [o for t in perm for o in rw if o['tx'] == t]
        if view_info(serial) == target:
            return {'checked': True, 'serializable': True, 'order': list(perm)}
    return {'checked': True, 'serializable': False}


# ------------------------------------------------------------ recoverability
def recoverability(ops):
    commit_at, abort_at = {}, {}
    for i, o in enumerate(ops):
        if o['type'] == 'C':
            commit_at[o['tx']] = i
        if o['type'] == 'A':
            abort_at[o['tx']] = i

    def finished(tx, i):
        return (tx in commit_at and commit_at[tx] < i) or (tx in abort_at and abort_at[tx] < i)

    problems = {'recoverable': [], 'cascadeless': [], 'strict': []}
    last_writer = {}
    for i, o in enumerate(ops):
        if not o['item']:
            continue
        w = last_writer.get(o['item'])
        if w is not None and w['tx'] != o['tx'] and not finished(w['tx'], i):
            problems['strict'].append('%s touches %s written by uncommitted T%d' % (op_str(o), o['item'], w['tx']))
            if o['type'] == 'R':
                problems['cascadeless'].append('%s reads %s written by uncommitted T%d (dirty read)' % (op_str(o), o['item'], w['tx']))
                cj, ci = commit_at.get(o['tx']), commit_at.get(w['tx'])
                if cj is not None and (ci is None or ci > cj):
                    problems['recoverable'].append('T%d reads from T%d but commits before T%d' % (o['tx'], w['tx'], w['tx']))
        if o['type'] == 'W':
            last_writer[o['item']] = {'tx': o['tx'], 'at': i}
    return {
        'recoverable': not problems['recoverable'],
        'cascadeless': not problems['cascadeless'],
        'strict': not problems['strict'],
        'problems': problems,
    }


def _first_seen_timestamps(ops):
    ts = {}
    for o in ops:
        if o['tx'] not in ts:
            ts[o['tx']] = len(ts) + 1
    return ts


# --------------------------------------------- strict 2PL lock simulation --
def simulate_2pl(ops, scheme='detect'):
    """scheme: 'detect' (wait-for graph) | 'wait-die' | 'wound-wait'"""
    ts = _first_seen_timestamps(ops)
    # dicts are used as insertion-ordered sets (same iteration order as JS Set / Map)
    locks = {}         # item -> {'mode', 'holders': {tx: True}}
    held = {}          # tx -> {item: True}
    waits_for = {}     # tx -> {tx: True}
    aborted = {}
    log, executed = [], []
    pending = [dict(o, i=i) for i, o in enumerate(ops)]
    waiting_logged = {}

    def release(tx):
        items = list(held.get(tx, {}))
        for it in items:
            lk = locks[it]
            lk['holders'].pop(tx, None)
            if not lk['holders']:
                del locks[it]
        held.pop(tx, None)
        waits_for.pop(tx, None)
        for s in waits_for.values():
            s.pop(tx, None)
        return items

    def abort(tx, why):
        nonlocal pending
        aborted[tx] = True
        items = release(tx)
        pending = [p for p in pending if p['tx'] != tx]
        log.append({'step': op_str({'type': 'A', 'tx': tx}),
                    'action': 'ABORT T%d: %s; released %s (restart later with same timestamp)' % (tx, why, ','.join(items) or 'nothing')})

    def grant(op, mode):
        lk = locks.get(op['item'])
        if not lk:
            locks[op['item']] = {'mode': mode, 'holders': {op['tx']: True}}
        else:
            lk['mode'] = 'X' if mode == 'X' else lk['mode']
            lk['holders'][op['tx']] = True
        held.setdefault(op['tx'], {})[op['item']] = True

    def try_run(op):
        if op['type'] in ('C', 'A'):
            items = release(op['tx'])
            if op['type'] == 'A':
                aborted[op['tx']] = True
            executed.append(op_str(op))
            log.append({'step': op_str(op), 'action': '%s - shrinking phase: release %s' % (
                'COMMIT' if op['type'] == 'C' else 'ABORT', ','.join(items) or 'nothing')})
            return 'done'
        need = 'S' if op['type'] == 'R' else 'X'
        lk = locks.get(op['item'])
        others = [t for t in lk['holders'] if t != op['tx']] if lk else []
        mine = bool(lk) and op['tx'] in lk['holders']
        compatible = not lk or not others or (need == 'S' and lk['mode'] == 'S')
        if compatible:
            if mine and need == 'X' and lk['mode'] == 'S':
                note = 'upgrade S→X'
            elif mine and (lk['mode'] == 'X' or need == 'S'):
                note = 'already held'
            else:
                note = 'grant %s-lock' % need
            grant(op, need)
            waits_for.pop(op['tx'], None)
            waiting_logged.pop(op['tx'], None)
            executed.append(op_str(op))
            log.append({'step': op_str(op), 'action': '%s on %s → execute' % (note, op['item'])})
            return 'done'
        # conflict
        holders = ','.join('T%d' % h for h in others)
        if scheme == 'wait-die':
            older = all(ts[op['tx']] < ts[h] for h in others)
            if not older:
                abort(op['tx'], 'wait-die: younger T%d requests %s held by older %s → DIES' % (op['tx'], op['item'], holders))
                return 'aborted'
        elif scheme == 'wound-wait':
            younger = [h for h in others if ts[op['tx']] < ts[h]]
            if younger:
                for h in younger:
                    abort(h, 'wound-wait: older T%d WOUNDS younger T%d' % (op['tx'], h))
                return 'aborted'
        waits_for[op['tx']] = dict.fromkeys(others, True)
        key = str(op['i'])
        if waiting_logged.get(op['tx']) != key:
            log.append({'step': op_str(op), 'action': 'WAIT - %s is %s-locked by %s' % (op['item'], lk['mode'], holders)})
            waiting_logged[op['tx']] = key
        if scheme == 'detect':
            nodes = [t for t in ts if t not in aborted]
            edges = [[t, u] for t, s in waits_for.items() for u in s]
            cycle = find_cycle(nodes, edges)
            if cycle:
                victim = max(cycle[:-1], key=lambda t: ts[t])
                log.append({'step': 'DEADLOCK!', 'action': 'wait-for cycle %s; victim = youngest T%d' % (
                    ' → '.join('T%d' % t for t in cycle), victim)})
                abort(victim, 'deadlock victim')
                return 'aborted'
        return 'wait'

    guard = 0
    while pending and guard < 1000:
        guard += 1
        progressed = False
        for k in range(len(pending)):
            op = pending[k]
            if any(p['tx'] == op['tx'] for p in pending[:k]):
                continue  # keep each tx's order
            r = try_run(op)
            if r == 'done':
                pending.pop(k)
            if r != 'wait':
                progressed = True
                break
        if not progressed:
            log.append({'step': 'STUCK', 'action': 'all remaining transactions are waiting (deadlock not resolved by this scheme)'})
            break
    return {'log': log, 'executed': executed, 'aborted': list(aborted), 'ts': ts}


# ------------------------------------------------- timestamp ordering -----
def simulate_timestamp(ops, thomas=False):
    ts = _first_seen_timestamps(ops)
    rts, wts = {}, {}
    aborted = {}
    log = []
    for o in ops:
        if o['tx'] in aborted:
            log.append({'op': op_str(o), 'decision': 'skipped (transaction already rolled back)'})
            continue
        t = ts[o['tx']]
        if o['type'] in ('C', 'A'):
            log.append({'op': op_str(o), 'decision': 'commit' if o['type'] == 'C' else 'abort'})
            continue
        item = o['item']
        R, W = rts.get(item, 0), wts.get(item, 0)
        if o['type'] == 'R':
            if t < W:
                decision = 'REJECT: TS(T%d)=%d < W-TS(%s)=%d → rollback T%d' % (o['tx'], t, item, W, o['tx'])
                aborted[o['tx']] = True
            else:
                rts[item] = max(R, t)
                decision = 'OK, R-TS(%s) = %d' % (item, rts[item])
        elif t < R:
            decision = 'REJECT: TS=%d < R-TS(%s)=%d (a younger tx already read it) → rollback T%d' % (t, item, R, o['tx'])
            aborted[o['tx']] = True
        elif t < W:
            if thomas:
                decision = "IGNORE obsolete write (Thomas' write rule): TS=%d < W-TS=%d" % (t, W)
            else:
                decision = 'REJECT: TS=%d < W-TS(%s)=%d → rollback T%d' % (t, item, W, o['tx'])
                aborted[o['tx']] = True
        else:
            wts[item] = t
            decision = 'OK, W-TS(%s) = %d' % (item, t)
        log.append({'op': op_str(o), 'ts': t, 'r_ts': R, 'w_ts': W, 'decision': decision})
    return {'log': log, 'aborted': list(aborted), 'ts': ts}


# --------------------------------------------- validation-based protocol --
def simulate_validation(ops):
    info = {}
    for i, o in enumerate(ops):
        t = info.setdefault(o['tx'], {'start': i, 'rs': [], 'ws': [], 'validate': None})
        if o['type'] == 'R' and o['item'] not in t['rs']:
            t['rs'].append(o['item'])
        if o['type'] == 'W' and o['item'] not in t['ws']:
            t['ws'].append(o['item'])
        if o['type'] == 'C':
            t['validate'] = i
    validated, log = [], []
    for tx, t in sorted(((tx, t) for tx, t in info.items() if t['validate'] is not None), key=lambda p: p[1]['validate']):
        ok = True
        reasons = []
        for v in validated:
            tj = info[v]
            if tj['validate'] < t['start']:
                reasons.append('T%d finished before T%d started ✓' % (v, tx))
                continue
            clash = [x for x in tj['ws'] if x in t['rs']]
            if clash:
                ok = False
                reasons.append('T%d wrote {%s} which T%d read while T%d overlapped ✗' % (v, ','.join(clash), tx, v))
            else:
                reasons.append('WS(T%d) ∩ RS(T%d) = ∅ ✓' % (v, tx))
        log.append({'tx': 'T%d' % tx, 'read_set': ','.join(t['rs']) or '-', 'write_set': ','.join(t['ws']) or '-',
                    'result': 'VALID → write phase' if ok else 'FAIL → rollback & restart',
                    'why': '; '.join(reasons) or 'first to validate'})
        if ok:
            validated.append(tx)
    return log


# ------------------------------------------------------- log recovery -----
# lines like:  <T1 start> | <T1, A, 1000, 950> | <T1 commit> | <T1 abort> | <checkpoint T2,T3>
def parse_log(text):
    out = []
    for l in (x.strip() for x in re.split(r'\n|(?<=>)\s*', text)):
        if not l:
            continue
        m = re.match(r'^<\s*T(\d+)\s+start\s*>$', l, re.I)
        if m:
            out.append({'kind': 'start', 'tx': int(m.group(1)), 'raw': l})
            continue
        m = re.match(r'^<\s*T(\d+)\s+commit\s*>$', l, re.I)
        if m:
            out.append({'kind': 'commit', 'tx': int(m.group(1)), 'raw': l})
            continue
        m = re.match(r'^<\s*T(\d+)\s+abort\s*>$', l, re.I)
        if m:
            out.append({'kind': 'abort', 'tx': int(m.group(1)), 'raw': l})
            continue
        m = re.match(r'^<\s*T(\d+)\s*,\s*(\w+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*>$', l, re.I)
        if m:
            out.append({'kind': 'update', 'tx': int(m.group(1)), 'item': m.group(2).upper(),
                        'old': int(m.group(3)), 'new': int(m.group(4)), 'raw': l})
            continue
        m = re.match(r'^<\s*checkpoint\s*([T\d,\s]*)>$', l, re.I)
        if m:
            out.append({'kind': 'checkpoint', 'active': [int(x) for x in re.findall(r'\d+', m.group(1))], 'raw': l})
            continue
        raise ValueError('Cannot parse log record: %s' % l)
    return out


def recover(records, initial):
    kinds = [r['kind'] for r in records]
    cp_index = len(kinds) - 1 - kinds[::-1].index('checkpoint') if 'checkpoint' in kinds else -1
    # state on disk at crash: everything up to the checkpoint was flushed
    disk = dict(initial)
    for i in range(max(cp_index, 0)):
        if records[i]['kind'] == 'update':
            disk[records[i]['item']] = records[i]['new']
    at_crash = dict(disk)
    steps = []
    # REDO pass: repeat history from checkpoint, build undo-list
    undo = list(records[cp_index]['active']) if cp_index >= 0 else []
    for r in records[max(cp_index, 0):]:
        if r['kind'] == 'start' and r['tx'] not in undo:
            undo.append(r['tx'])
        if r['kind'] in ('commit', 'abort') and r['tx'] in undo:
            undo.remove(r['tx'])
        if r['kind'] == 'update':
            disk[r['item']] = r['new']
            steps.append({'phase': 'REDO', 'record': r['raw'], 'effect': '%s = %d' % (r['item'], r['new'])})
    after_redo = dict(disk)
    # UNDO pass: scan backwards, roll back losers, write compensation records
    clr = []
    remaining = set(undo)
    for r in reversed(records):
        if not remaining:
            break
        if r['kind'] == 'update' and r['tx'] in undo:
            disk[r['item']] = r['old']
            clr.append('<T%d, %s, %d>' % (r['tx'], r['item'], r['old']))
            steps.append({'phase': 'UNDO', 'record': r['raw'], 'effect': '%s restored to %d' % (r['item'], r['old'])})
        if r['kind'] == 'start' and r['tx'] in remaining:
            clr.append('<T%d abort>' % r['tx'])
            remaining.discard(r['tx'])
    committed = list(dict.fromkeys(r['tx'] for r in records if r['kind'] == 'commit'))
    return {'cp_index': cp_index, 'at_crash': at_crash, 'after_redo': after_redo, 'final': disk, 'steps': steps,
            'losers': undo, 'committed': committed, 'clr': clr}
