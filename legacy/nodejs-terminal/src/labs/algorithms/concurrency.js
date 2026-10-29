'use strict';
// ============================================================================
//  TRANSACTION / CONCURRENCY ALGORITHMS  (pure, no UI)
//  Schedule notation:  R1(A)  W2(B)  C1  A2      (A = abort)
//    - conflict serializability (precedence graph)
//    - view serializability (brute force over serial orders)
//    - recoverable / cascadeless / strict
//    - strict two-phase locking with deadlock detection / wait-die / wound-wait
//    - timestamp-ordering protocol (+ Thomas' write rule)
//    - validation-based (optimistic) protocol
//    - log-based recovery (redo + undo, ARIES-style "repeat history")
// ============================================================================

function parseSchedule(text) {
  const ops = [];
  const re = /([RWCA])\s*(\d+)\s*(?:\(\s*([A-Za-z0-9_]+)\s*\))?/gi;
  let m;
  while ((m = re.exec(text))) {
    const type = m[1].toUpperCase();
    if ((type === 'R' || type === 'W') && !m[3]) throw new Error(`${m[0]} needs a data item, e.g. R1(A)`);
    ops.push({ type, tx: Number(m[2]), item: m[3] ? m[3].toUpperCase() : null });
  }
  if (!ops.length) throw new Error('No operations found. Example: R1(A) W1(A) R2(A) C1 C2');
  return ops;
}

const opStr = (o) => (o.item ? `${o.type}${o.tx}(${o.item})` : `${o.type}${o.tx}`);
const txList = (ops) => [...new Set(ops.map((o) => o.tx))];

// ------------------------------------------------- conflict serializability
function precedenceGraph(ops) {
  const edges = [];
  const reasons = [];
  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      const a = ops[i], b = ops[j];
      if (a.tx === b.tx || !a.item || a.item !== b.item) continue;
      if (a.type === 'W' || b.type === 'W') {
        if (!edges.some((e) => e[0] === a.tx && e[1] === b.tx)) edges.push([a.tx, b.tx]);
        reasons.push(`${opStr(a)} before ${opStr(b)}  ⇒  T${a.tx} → T${b.tx}`);
      }
    }
  }
  return { edges, reasons };
}

function findCycle(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const [u, v] of edges) adj.get(u).push(v);
  const state = new Map();
  const stack = [];
  let cycle = null;
  const dfs = (u) => {
    state.set(u, 1); stack.push(u);
    for (const v of adj.get(u)) {
      if (cycle) return;
      if (state.get(v) === 1) { cycle = stack.slice(stack.indexOf(v)).concat(v); return; }
      if (!state.get(v)) dfs(v);
    }
    stack.pop(); state.set(u, 2);
  };
  for (const n of nodes) if (!state.get(n) && !cycle) dfs(n);
  return cycle;
}

function topoOrder(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  for (const [, v] of edges) indeg.set(v, indeg.get(v) + 1);
  const order = [];
  const ready = nodes.filter((n) => indeg.get(n) === 0).sort((a, b) => a - b);
  while (ready.length) {
    const u = ready.shift();
    order.push(u);
    for (const [x, v] of edges) if (x === u) { indeg.set(v, indeg.get(v) - 1); if (indeg.get(v) === 0) { ready.push(v); ready.sort((a, b) => a - b); } }
  }
  return order;
}

function conflictSerializable(ops) {
  const nodes = txList(ops);
  const g = precedenceGraph(ops);
  const cycle = findCycle(nodes, g.edges);
  return { ...g, nodes, cycle, serializable: !cycle, order: cycle ? null : topoOrder(nodes, g.edges) };
}

// ----------------------------------------------------- view serializability
function viewInfo(ops) {
  const readsFrom = [];
  const lastWriter = {};
  const finalWrite = {};
  for (const o of ops) {
    if (o.type === 'R') readsFrom.push(`${o.tx}:${o.item}:${lastWriter[o.item] ?? 'init'}`);
    if (o.type === 'W') { lastWriter[o.item] = o.tx; finalWrite[o.item] = o.tx; }
  }
  return { readsFrom: readsFrom.sort().join(';'), finalWrite: JSON.stringify(Object.entries(finalWrite).sort()) };
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

function viewSerializable(ops) {
  const rw = ops.filter((o) => o.type === 'R' || o.type === 'W');
  const txs = txList(rw);
  if (txs.length > 7) return { checked: false };
  const target = viewInfo(rw);
  for (const perm of permutations(txs)) {
    const serial = perm.flatMap((t) => rw.filter((o) => o.tx === t));
    const v = viewInfo(serial);
    if (v.readsFrom === target.readsFrom && v.finalWrite === target.finalWrite) return { checked: true, serializable: true, order: perm };
  }
  return { checked: true, serializable: false };
}

// ------------------------------------------------------------ recoverability
function recoverability(ops) {
  const commitAt = {}, abortAt = {};
  ops.forEach((o, i) => { if (o.type === 'C') commitAt[o.tx] = i; if (o.type === 'A') abortAt[o.tx] = i; });
  const finished = (tx, i) => (commitAt[tx] !== undefined && commitAt[tx] < i) || (abortAt[tx] !== undefined && abortAt[tx] < i);
  const problems = { recoverable: [], cascadeless: [], strict: [] };
  const lastWriter = {};
  ops.forEach((o, i) => {
    if (!o.item) return;
    const w = lastWriter[o.item];
    if (w !== undefined && w.tx !== o.tx) {
      if (!finished(w.tx, i)) {
        problems.strict.push(`${opStr(o)} touches ${o.item} written by uncommitted T${w.tx}`);
        if (o.type === 'R') {
          problems.cascadeless.push(`${opStr(o)} reads ${o.item} written by uncommitted T${w.tx} (dirty read)`);
          const cj = commitAt[o.tx], ci = commitAt[w.tx];
          if (cj !== undefined && (ci === undefined || ci > cj)) problems.recoverable.push(`T${o.tx} reads from T${w.tx} but commits before T${w.tx}`);
        }
      }
    }
    if (o.type === 'W') lastWriter[o.item] = { tx: o.tx, at: i };
  });
  return {
    recoverable: problems.recoverable.length === 0,
    cascadeless: problems.cascadeless.length === 0,
    strict: problems.strict.length === 0,
    problems,
  };
}

// --------------------------------------------- strict 2PL lock simulation --
// scheme: 'detect' (wait-for graph) | 'wait-die' | 'wound-wait'
function simulate2PL(ops, scheme = 'detect') {
  const ts = new Map();
  ops.forEach((o) => { if (!ts.has(o.tx)) ts.set(o.tx, ts.size + 1); });
  const locks = new Map();               // item -> { mode, holders:Set }
  const held = new Map();                // tx -> Set(items)
  const waitsFor = new Map();            // tx -> Set(tx)
  const aborted = new Set();
  const log = [];
  const executed = [];
  let pending = ops.map((o, i) => ({ ...o, i }));
  const waitingLogged = new Map();

  const release = (tx) => {
    const items = [...(held.get(tx) || [])];
    for (const it of items) {
      const l = locks.get(it);
      l.holders.delete(tx);
      if (!l.holders.size) locks.delete(it);
    }
    held.delete(tx);
    waitsFor.delete(tx);
    for (const s of waitsFor.values()) s.delete(tx);
    return items;
  };
  const abort = (tx, why) => {
    aborted.add(tx);
    const items = release(tx);
    pending = pending.filter((p) => p.tx !== tx);
    log.push({ step: opStr({ type: 'A', tx }), action: `ABORT T${tx}: ${why}; released ${items.join(',') || 'nothing'} (restart later with same timestamp)` });
  };
  const grant = (op, mode) => {
    const l = locks.get(op.item);
    if (!l) locks.set(op.item, { mode, holders: new Set([op.tx]) });
    else { l.mode = mode === 'X' ? 'X' : l.mode; l.holders.add(op.tx); }
    if (!held.has(op.tx)) held.set(op.tx, new Set());
    held.get(op.tx).add(op.item);
  };

  const tryRun = (op) => {
    if (op.type === 'C' || op.type === 'A') {
      const items = release(op.tx);
      if (op.type === 'A') aborted.add(op.tx);
      executed.push(opStr(op));
      log.push({ step: opStr(op), action: `${op.type === 'C' ? 'COMMIT' : 'ABORT'} - shrinking phase: release ${items.map((x) => x).join(',') || 'nothing'}` });
      return 'done';
    }
    const need = op.type === 'R' ? 'S' : 'X';
    const l = locks.get(op.item);
    const others = l ? [...l.holders].filter((t) => t !== op.tx) : [];
    const mine = l && l.holders.has(op.tx);
    const compatible = !l || others.length === 0 || (need === 'S' && l.mode === 'S');
    if (compatible) {
      const note = mine && need === 'X' && l.mode === 'S' ? 'upgrade S→X' : mine && (l.mode === 'X' || need === 'S') ? 'already held' : `grant ${need}-lock`;
      grant(op, need);
      waitsFor.delete(op.tx);
      waitingLogged.delete(op.tx);
      executed.push(opStr(op));
      log.push({ step: opStr(op), action: `${note} on ${op.item} → execute` });
      return 'done';
    }
    // conflict
    if (scheme === 'wait-die') {
      const older = others.every((h) => ts.get(op.tx) < ts.get(h));
      if (!older) { abort(op.tx, `wait-die: younger T${op.tx} requests ${op.item} held by older ${others.map((h) => 'T' + h).join(',')} → DIES`); return 'aborted'; }
    } else if (scheme === 'wound-wait') {
      const younger = others.filter((h) => ts.get(op.tx) < ts.get(h));
      if (younger.length) { for (const h of younger) abort(h, `wound-wait: older T${op.tx} WOUNDS younger T${h}`); return 'aborted'; }
    }
    waitsFor.set(op.tx, new Set(others));
    const key = `${op.i}`;
    if (waitingLogged.get(op.tx) !== key) {
      log.push({ step: opStr(op), action: `WAIT - ${op.item} is ${l.mode}-locked by ${others.map((h) => 'T' + h).join(',')}` });
      waitingLogged.set(op.tx, key);
    }
    if (scheme === 'detect') {
      const nodes = [...ts.keys()].filter((t) => !aborted.has(t));
      const edges = [];
      for (const [t, s] of waitsFor) for (const u of s) edges.push([t, u]);
      const cycle = findCycle(nodes, edges);
      if (cycle) {
        const victim = cycle.slice(0, -1).reduce((a, b) => (ts.get(a) > ts.get(b) ? a : b));
        log.push({ step: 'DEADLOCK!', action: `wait-for cycle ${cycle.map((t) => 'T' + t).join(' → ')}; victim = youngest T${victim}` });
        abort(victim, 'deadlock victim');
        return 'aborted';
      }
    }
    return 'wait';
  };

  let guard = 0;
  while (pending.length && guard++ < 1000) {
    let progressed = false;
    for (let k = 0; k < pending.length; k++) {
      const op = pending[k];
      if (pending.slice(0, k).some((p) => p.tx === op.tx)) continue; // keep each tx's order
      const r = tryRun(op);
      if (r === 'done') pending.splice(k, 1);
      if (r !== 'wait') { progressed = true; break; }
    }
    if (!progressed) { log.push({ step: 'STUCK', action: 'all remaining transactions are waiting (deadlock not resolved by this scheme)' }); break; }
  }
  return { log, executed, aborted: [...aborted], ts: Object.fromEntries(ts) };
}

// ------------------------------------------------- timestamp ordering -----
function simulateTimestamp(ops, thomas = false) {
  const ts = new Map();
  ops.forEach((o) => { if (!ts.has(o.tx)) ts.set(o.tx, ts.size + 1); });
  const rts = {}, wts = {};
  const aborted = new Set();
  const log = [];
  for (const o of ops) {
    if (aborted.has(o.tx)) { log.push({ op: opStr(o), decision: 'skipped (transaction already rolled back)' }); continue; }
    const t = ts.get(o.tx);
    if (o.type === 'C' || o.type === 'A') { log.push({ op: opStr(o), decision: o.type === 'C' ? 'commit' : 'abort' }); continue; }
    const R = rts[o.item] || 0, W = wts[o.item] || 0;
    let decision;
    if (o.type === 'R') {
      if (t < W) { decision = `REJECT: TS(T${o.tx})=${t} < W-TS(${o.item})=${W} → rollback T${o.tx}`; aborted.add(o.tx); }
      else { rts[o.item] = Math.max(R, t); decision = `OK, R-TS(${o.item}) = ${rts[o.item]}`; }
    } else if (t < R) { decision = `REJECT: TS=${t} < R-TS(${o.item})=${R} (a younger tx already read it) → rollback T${o.tx}`; aborted.add(o.tx); }
    else if (t < W) {
      if (thomas) decision = `IGNORE obsolete write (Thomas' write rule): TS=${t} < W-TS=${W}`;
      else { decision = `REJECT: TS=${t} < W-TS(${o.item})=${W} → rollback T${o.tx}`; aborted.add(o.tx); }
    } else { wts[o.item] = t; decision = `OK, W-TS(${o.item}) = ${t}`; }
    log.push({ op: opStr(o), ts: t, r_ts: R, w_ts: W, decision });
  }
  return { log, aborted: [...aborted], ts: Object.fromEntries(ts) };
}

// --------------------------------------------- validation-based protocol --
function simulateValidation(ops) {
  const info = new Map();
  ops.forEach((o, i) => {
    if (!info.has(o.tx)) info.set(o.tx, { start: i, rs: new Set(), ws: new Set(), validate: null });
    const t = info.get(o.tx);
    if (o.type === 'R') t.rs.add(o.item);
    if (o.type === 'W') t.ws.add(o.item);
    if (o.type === 'C') t.validate = i;
  });
  const validated = [];
  const log = [];
  for (const [tx, t] of [...info].filter(([, v]) => v.validate !== null).sort((a, b) => a[1].validate - b[1].validate)) {
    let ok = true;
    const reasons = [];
    for (const v of validated) {
      const tj = info.get(v);
      if (tj.validate < t.start) { reasons.push(`T${v} finished before T${tx} started ✓`); continue; }
      const clash = [...tj.ws].filter((x) => t.rs.has(x));
      if (clash.length) { ok = false; reasons.push(`T${v} wrote {${clash}} which T${tx} read while T${v} overlapped ✗`); }
      else reasons.push(`WS(T${v}) ∩ RS(T${tx}) = ∅ ✓`);
    }
    log.push({ tx: `T${tx}`, read_set: [...t.rs].join(',') || '-', write_set: [...t.ws].join(',') || '-', result: ok ? 'VALID → write phase' : 'FAIL → rollback & restart', why: reasons.join('; ') || 'first to validate' });
    if (ok) validated.push(tx);
  }
  return log;
}

// ------------------------------------------------------- log recovery -----
// lines like:  <T1 start> | <T1, A, 1000, 950> | <T1 commit> | <T1 abort> | <checkpoint T2,T3> | <crash>
function parseLog(text) {
  return text.split(/\n|(?<=>)\s*/).map((l) => l.trim()).filter(Boolean).map((l) => {
    let m;
    if ((m = l.match(/^<\s*T(\d+)\s+start\s*>$/i))) return { kind: 'start', tx: +m[1], raw: l };
    if ((m = l.match(/^<\s*T(\d+)\s+commit\s*>$/i))) return { kind: 'commit', tx: +m[1], raw: l };
    if ((m = l.match(/^<\s*T(\d+)\s+abort\s*>$/i))) return { kind: 'abort', tx: +m[1], raw: l };
    if ((m = l.match(/^<\s*T(\d+)\s*,\s*(\w+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*>$/i))) return { kind: 'update', tx: +m[1], item: m[2].toUpperCase(), old: +m[3], new: +m[4], raw: l };
    if ((m = l.match(/^<\s*checkpoint\s*([T\d,\s]*)>$/i))) return { kind: 'checkpoint', active: (m[1].match(/\d+/g) || []).map(Number), raw: l };
    throw new Error(`Cannot parse log record: ${l}`);
  });
}

function recover(records, initial) {
  const cpIndex = records.map((r) => r.kind).lastIndexOf('checkpoint');
  // state on disk at crash: everything up to the checkpoint was flushed
  const disk = { ...initial };
  for (let i = 0; i < Math.max(cpIndex, 0); i++) if (records[i].kind === 'update') disk[records[i].item] = records[i].new;
  const atCrash = { ...disk };
  const steps = [];
  // REDO pass: repeat history from checkpoint, build undo-list
  const undo = new Set(cpIndex >= 0 ? records[cpIndex].active : []);
  for (let i = Math.max(cpIndex, 0); i < records.length; i++) {
    const r = records[i];
    if (r.kind === 'start') undo.add(r.tx);
    if (r.kind === 'commit' || r.kind === 'abort') undo.delete(r.tx);
    if (r.kind === 'update') { disk[r.item] = r.new; steps.push({ phase: 'REDO', record: r.raw, effect: `${r.item} = ${r.new}` }); }
  }
  const afterRedo = { ...disk };
  // UNDO pass: scan backwards, roll back losers, write compensation records
  const clr = [];
  const remaining = new Set(undo);
  for (let i = records.length - 1; i >= 0 && remaining.size; i--) {
    const r = records[i];
    if (r.kind === 'update' && undo.has(r.tx)) {
      disk[r.item] = r.old;
      clr.push(`<T${r.tx}, ${r.item}, ${r.old}>`);
      steps.push({ phase: 'UNDO', record: r.raw, effect: `${r.item} restored to ${r.old}` });
    }
    if (r.kind === 'start' && remaining.has(r.tx)) { clr.push(`<T${r.tx} abort>`); remaining.delete(r.tx); }
  }
  const committed = [...new Set(records.filter((r) => r.kind === 'commit').map((r) => r.tx))];
  return { cpIndex, atCrash, afterRedo, final: disk, steps, losers: [...undo], committed, clr };
}

module.exports = {
  parseSchedule, opStr, txList, conflictSerializable, viewSerializable, recoverability,
  simulate2PL, simulateTimestamp, simulateValidation, parseLog, recover, findCycle,
};
