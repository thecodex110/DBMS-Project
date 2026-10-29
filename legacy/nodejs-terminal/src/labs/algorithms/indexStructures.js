'use strict';
// ============================================================================
//  INDEX STRUCTURES (pure, in-memory, for visualisation)
//    BPlusTree       - insertion with leaf/internal splits, search, range scan
//    StaticHash      - fixed buckets + overflow chains
//    ExtendibleHash  - dynamic hashing with directory doubling
//    bitmapIndex     - bitmap per distinct value
// ============================================================================

const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));

// ------------------------------------------------------------- B+ tree ----
// order n = max number of pointers in a node  (Silberschatz notation)
// leaf     : at most n-1 keys
// internal : at most n children (n-1 keys)
class BPlusTree {
  constructor(n = 4) {
    if (n < 3) throw new Error('order must be >= 3');
    this.n = n;
    this.root = { leaf: true, keys: [], next: null };
    this.events = [];
  }

  findPath(key) {
    const path = [this.root];
    let node = this.root;
    while (!node.leaf) {
      let i = 0;
      while (i < node.keys.length && cmp(key, node.keys[i]) >= 0) i++;
      node = node.children[i];
      path.push(node);
    }
    return path;
  }

  search(key) {
    const path = this.findPath(key);
    const leaf = path[path.length - 1];
    return { found: leaf.keys.some((k) => cmp(k, key) === 0), path: path.map((p) => `[${p.keys.join('|')}]`) };
  }

  range(lo, hi) {
    let leaf = this.findPath(lo).pop();
    const out = [];
    let hops = 0;
    while (leaf) {
      hops++;
      for (const k of leaf.keys) {
        if (cmp(k, hi) > 0) return { keys: out, leavesVisited: hops };
        if (cmp(k, lo) >= 0) out.push(k);
      }
      leaf = leaf.next;
    }
    return { keys: out, leavesVisited: hops };
  }

  insert(key) {
    const path = this.findPath(key);
    const leaf = path[path.length - 1];
    if (leaf.keys.some((k) => cmp(k, key) === 0)) { this.events.push(`${key}: duplicate, ignored`); return; }
    let i = 0;
    while (i < leaf.keys.length && cmp(leaf.keys[i], key) < 0) i++;
    leaf.keys.splice(i, 0, key);
    if (leaf.keys.length <= this.n - 1) { this.events.push(`${key}: inserted into leaf [${leaf.keys.join('|')}]`); return; }
    // split leaf: first ceil(n/2) keys stay
    const keep = Math.ceil(this.n / 2);
    const right = { leaf: true, keys: leaf.keys.splice(keep), next: leaf.next };
    leaf.next = right;
    this.events.push(`${key}: leaf overflow → split into [${leaf.keys.join('|')}] and [${right.keys.join('|')}], copy up ${right.keys[0]}`);
    this.insertInParent(path, path.length - 1, leaf, right.keys[0], right);
  }

  insertInParent(path, level, left, key, right) {
    if (level === 0) {
      this.root = { leaf: false, keys: [key], children: [left, right] };
      this.events.push(`   new root [${key}] → tree height grows`);
      return;
    }
    const parent = path[level - 1];
    const idx = parent.children.indexOf(left);
    parent.keys.splice(idx, 0, key);
    parent.children.splice(idx + 1, 0, right);
    if (parent.children.length <= this.n) return;
    // split internal node: middle key moves UP (not copied)
    const leftCount = Math.ceil((this.n + 1) / 2);
    const up = parent.keys[leftCount - 1];
    const sibling = { leaf: false, keys: parent.keys.slice(leftCount), children: parent.children.slice(leftCount) };
    parent.keys = parent.keys.slice(0, leftCount - 1);
    parent.children = parent.children.slice(0, leftCount);
    this.events.push(`   internal overflow → split, push up ${up}`);
    this.insertInParent(path, level - 1, parent, up, sibling);
  }

  levels() {
    const out = [];
    let level = [this.root];
    while (level.length) {
      out.push(level.map((n) => n.keys));
      level = level.flatMap((n) => (n.leaf ? [] : n.children));
    }
    return out;
  }

  height() { return this.levels().length; }
}

// ---------------------------------------------------------- hashing -------
function hashKey(k) {
  if (typeof k === 'number') return Math.abs(Math.trunc(k));
  let h = 0;
  for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

class StaticHash {
  constructor(buckets = 5, capacity = 2) {
    this.N = buckets;
    this.cap = capacity;
    this.table = Array.from({ length: buckets }, () => [[]]); // bucket -> list of pages
    this.events = [];
  }
  insert(k) {
    const b = hashKey(k) % this.N;
    const pages = this.table[b];
    let page = pages[pages.length - 1];
    if (page.length >= this.cap) {
      page = [];
      pages.push(page);
      this.events.push(`${k}: h=${hashKey(k)} mod ${this.N} = ${b} → bucket full, OVERFLOW page #${pages.length - 1} chained`);
    } else this.events.push(`${k}: h=${hashKey(k)} mod ${this.N} = ${b}`);
    page.push(k);
  }
  search(k) {
    const b = hashKey(k) % this.N;
    let pagesRead = 0;
    for (const p of this.table[b]) { pagesRead++; if (p.includes(k)) return { bucket: b, pagesRead, found: true }; }
    return { bucket: b, pagesRead, found: false };
  }
}

class ExtendibleHash {
  constructor(capacity = 2) {
    this.cap = capacity;
    this.global = 0;
    const b = { id: 'B0', local: 0, keys: [] };
    this.dir = [b];
    this.nextId = 1;
    this.events = [];
  }
  bits(k, d) { return d === 0 ? 0 : hashKey(k) & ((1 << d) - 1); }
  insert(k) {
    for (let guard = 0; guard < 24; guard++) {
      const idx = this.bits(k, this.global);
      const b = this.dir[idx];
      if (b.keys.length < this.cap) {
        b.keys.push(k);
        this.events.push(`${k}: h=${hashKey(k).toString(2).padStart(Math.max(this.global, 1), '0').slice(-8)}  last ${this.global} bit(s) → dir[${idx}] → ${b.id}`);
        return;
      }
      if (b.local === this.global) {
        this.dir = this.dir.concat(this.dir);
        this.global++;
        this.events.push(`${k}: ${b.id} full and local depth = global depth → DIRECTORY DOUBLES to ${this.dir.length} entries (global depth ${this.global})`);
      }
      // split bucket b
      const nb = { id: `B${this.nextId++}`, local: b.local + 1, keys: [] };
      b.local++;
      const bit = 1 << (b.local - 1);
      for (let i = 0; i < this.dir.length; i++) if (this.dir[i] === b && (i & bit)) this.dir[i] = nb;
      const old = b.keys;
      b.keys = [];
      for (const x of old) (hashKey(x) & bit ? nb : b).keys.push(x);
      this.events.push(`${k}: split ${b.id} → ${b.id}[${b.keys.join(',')}] and ${nb.id}[${nb.keys.join(',')}] (local depth ${b.local})`);
    }
    this.events.push(`${k}: too many identical hash values - would need an overflow chain`);
  }
}

// ------------------------------------------------------------- bitmap -----
function bitmapIndex(rows, column) {
  const values = [...new Set(rows.map((r) => r[column]))].sort();
  const maps = {};
  for (const v of values) maps[v] = rows.map((r) => (r[column] === v ? 1 : 0));
  return maps;
}

module.exports = { BPlusTree, StaticHash, ExtendibleHash, bitmapIndex, hashKey, cmp };
