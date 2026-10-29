'use strict';
// ============================================================================
//  FUNCTIONAL-DEPENDENCY ALGORITHMS  (pure functions, no UI)
//  closure · candidate keys · canonical cover · 2NF/3NF/BCNF tests
//  3NF synthesis · BCNF decomposition · lossless-join (chase) · dependency
//  preservation.   Attribute sets are plain sorted arrays of strings.
// ============================================================================

const uniq = (a) => [...new Set(a)];
const norm = (a) => uniq(a).sort();
const subset = (a, b) => a.every((x) => b.includes(x));
const minus = (a, b) => a.filter((x) => !b.includes(x));
const eq = (a, b) => a.length === b.length && subset(a, b);
const show = (a) => a.join(',');
const fdStr = (fd) => `${show(fd.lhs)} → ${show(fd.rhs)}`;

// ---------------------------------------------------------------- parsing --
function splitAttrs(text, singleChar) {
  const s = text.trim();
  if (!s) return [];
  if (/[,\s]/.test(s)) return s.split(/[\s,]+/).filter(Boolean);
  return singleChar ? [...s] : [s];
}

function parseRelation(text) {
  const attrs = text.split(/[\s,]+/).filter(Boolean);
  const singleChar = attrs.length === 1 && attrs[0].length > 1 ? true : attrs.every((a) => a.length === 1);
  const list = attrs.length === 1 && attrs[0].length > 1 ? [...attrs[0]] : attrs;
  return { attrs: norm(list), singleChar };
}

function parseFDs(text, rel) {
  const fds = [];
  for (const part of text.split(/[;\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.split(/\s*(?:->|→)\s*/);
    if (m.length !== 2) throw new Error(`Bad FD "${part}" - use the form  A,B -> C`);
    const lhs = norm(splitAttrs(m[0], rel.singleChar));
    const rhs = norm(splitAttrs(m[1], rel.singleChar));
    for (const a of [...lhs, ...rhs]) if (!rel.attrs.includes(a)) throw new Error(`Attribute "${a}" is not in the relation`);
    fds.push({ lhs, rhs });
  }
  return fds;
}

// ------------------------------------------------------------- core algos --
function closure(attrs, fds, trace) {
  let result = norm(attrs);
  let changed = true;
  while (changed) {
    changed = false;
    for (const fd of fds) {
      if (subset(fd.lhs, result) && !subset(fd.rhs, result)) {
        result = norm([...result, ...fd.rhs]);
        if (trace) trace.push(`using ${fdStr(fd)}  ⇒  {${show(result)}}`);
        changed = true;
      }
    }
  }
  return result;
}

const isSuperkey = (x, attrs, fds) => subset(attrs, closure(x, fds));

function* subsetsOf(arr, minSize = 1, maxSize = arr.length) {
  for (let k = minSize; k <= maxSize; k++) {
    const idx = Array.from({ length: k }, (_, i) => i);
    while (true) {
      yield idx.map((i) => arr[i]);
      let i = k - 1;
      while (i >= 0 && idx[i] === arr.length - k + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }
}

function candidateKeys(attrs, fds) {
  const onRhs = new Set(fds.flatMap((f) => minus(f.rhs, f.lhs)));
  const core = attrs.filter((a) => !onRhs.has(a)); // never determined -> in every key
  if (isSuperkey(core, attrs, fds)) return [norm(core)];
  const rest = minus(attrs, core);
  const keys = [];
  for (const extra of subsetsOf(rest, 1)) {
    const cand = norm([...core, ...extra]);
    if (keys.some((k) => subset(k, cand))) continue;
    if (isSuperkey(cand, attrs, fds)) keys.push(cand);
  }
  return keys;
}

// canonical / minimal cover
function minimalCover(fds) {
  let F = [];
  for (const fd of fds) for (const a of fd.rhs) if (!fd.lhs.includes(a)) F.push({ lhs: [...fd.lhs], rhs: [a] });
  // remove extraneous LHS attributes
  for (const fd of F) {
    for (const a of [...fd.lhs]) {
      if (fd.lhs.length < 2) break;
      const reduced = minus(fd.lhs, [a]);
      if (subset(fd.rhs, closure(reduced, F))) fd.lhs = reduced;
    }
  }
  // dedupe
  F = F.filter((fd, i) => F.findIndex((g) => eq(g.lhs, fd.lhs) && eq(g.rhs, fd.rhs)) === i);
  // remove redundant FDs
  for (let i = F.length - 1; i >= 0; i--) {
    const others = F.filter((_, j) => j !== i);
    if (subset(F[i].rhs, closure(F[i].lhs, others))) F = others;
  }
  return F;
}

function combineByLhs(F) {
  const out = [];
  for (const fd of F) {
    const g = out.find((x) => eq(x.lhs, fd.lhs));
    if (g) g.rhs = norm([...g.rhs, ...fd.rhs]);
    else out.push({ lhs: [...fd.lhs], rhs: [...fd.rhs] });
  }
  return out;
}

// ------------------------------------------------------- normal-form test --
function analyze(attrs, fds) {
  const keys = candidateKeys(attrs, fds);
  const prime = norm(keys.flat());
  const nonPrime = minus(attrs, prime);
  const cover = minimalCover(fds);

  const partial = [];
  for (const k of keys) {
    if (k.length < 2) continue;
    for (const s of subsetsOf(k, 1, k.length - 1)) {
      const dep = minus(closure(s, fds), s).filter((a) => nonPrime.includes(a));
      if (dep.length && !partial.some((p) => eq(p.lhs, s))) partial.push({ lhs: s, rhs: norm(dep), key: k });
    }
  }
  const v3 = cover.filter((fd) => !isSuperkey(fd.lhs, attrs, fds) && !prime.includes(fd.rhs[0]));
  const vBcnf = cover.filter((fd) => !isSuperkey(fd.lhs, attrs, fds));
  // 3NF violations whose LHS is NOT part of a key = transitive dependencies
  const transitive = v3.filter((fd) => !keys.some((k) => subset(fd.lhs, k) && fd.lhs.length < k.length));

  let nf = 'BCNF';
  if (vBcnf.length) nf = '3NF';
  if (v3.length) nf = '2NF';
  if (partial.length) nf = '1NF';
  return { keys, prime, nonPrime, cover, partial, transitive, v3, vBcnf, nf };
}

// -------------------------------------------------------- decompositions --
function projectFDs(ri, fds) {
  const out = [];
  for (const x of subsetsOf(ri, 1, ri.length - 1)) {
    const rhs = minus(closure(x, fds).filter((a) => ri.includes(a)), x);
    if (rhs.length) out.push({ lhs: x, rhs });
  }
  return combineByLhs(minimalCover(out));
}

function synthesis3NF(attrs, fds) {
  const cover = combineByLhs(minimalCover(fds));
  let schemas = cover.map((fd) => ({ attrs: norm([...fd.lhs, ...fd.rhs]), from: fdStr(fd) }));
  const keys = candidateKeys(attrs, fds);
  if (!schemas.some((s) => keys.some((k) => subset(k, s.attrs)))) schemas.push({ attrs: keys[0], from: 'candidate key (ensures lossless join)' });
  schemas = schemas.filter((s, i) => !schemas.some((t, j) => j !== i && subset(s.attrs, t.attrs) && (!eq(s.attrs, t.attrs) || j < i)));
  // attributes not in any FD
  const covered = norm(schemas.flatMap((s) => s.attrs));
  const missing = minus(attrs, covered);
  if (missing.length) schemas.push({ attrs: missing, from: 'attributes not in any FD' });
  return schemas;
}

function bcnfDecompose(attrs, fds) {
  const steps = [];
  let result = [norm(attrs)];
  let guard = 0;
  for (;;) {
    let changed = false;
    for (let i = 0; i < result.length && !changed; i++) {
      const ri = result[i];
      for (const x of subsetsOf(ri, 1, ri.length - 1)) {
        const cl = closure(x, fds).filter((a) => ri.includes(a));
        if (eq(cl, x) || subset(ri, cl)) continue; // trivial, or X is a superkey of Ri
        const r1 = norm(cl);
        const r2 = norm(minus(ri, minus(cl, x)));
        steps.push({ relation: ri, violating: { lhs: x, rhs: minus(cl, x) }, r1, r2 });
        result.splice(i, 1, r1, r2);
        changed = true;
        break;
      }
    }
    if (!changed || ++guard > 50) break;
  }
  return { relations: result, steps };
}

// lossless-join test with the chase (tableau) algorithm
function losslessChase(attrs, decomposition, fds) {
  const rows = decomposition.map((ri, i) => attrs.map((a) => (ri.includes(a) ? 'a' : `b${i + 1}`)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const fd of fds) {
      const li = fd.lhs.map((a) => attrs.indexOf(a));
      const groups = new Map();
      rows.forEach((r, ri) => {
        const k = li.map((i) => r[i]).join('|');
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(ri);
      });
      for (const g of groups.values()) {
        if (g.length < 2) continue;
        for (const a of fd.rhs) {
          const ci = attrs.indexOf(a);
          const vals = g.map((ri) => rows[ri][ci]);
          const target = vals.includes('a') ? 'a' : vals.sort()[0];
          for (const ri of g) if (rows[ri][ci] !== target) { rows[ri][ci] = target; changed = true; }
        }
      }
    }
  }
  return { lossless: rows.some((r) => r.every((v) => v === 'a')), tableau: rows };
}

function dependencyPreserved(decomposition, fds) {
  const lost = [];
  for (const fd of fds) {
    let res = [...fd.lhs];
    let changed = true;
    while (changed) {
      changed = false;
      for (const ri of decomposition) {
        const t = closure(res.filter((a) => ri.includes(a)), fds).filter((a) => ri.includes(a));
        const next = norm([...res, ...t]);
        if (next.length > res.length) { res = next; changed = true; }
      }
    }
    if (!subset(fd.rhs, res)) lost.push(fd);
  }
  return { preserved: lost.length === 0, lost };
}

module.exports = {
  parseRelation, parseFDs, closure, candidateKeys, minimalCover, combineByLhs, analyze,
  projectFDs, synthesis3NF, bcnfDecompose, losslessChase, dependencyPreserved, isSuperkey, fdStr, show,
};
