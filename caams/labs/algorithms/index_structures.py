# ============================================================================
#  INDEX STRUCTURES (pure, in-memory, for visualisation)
#    BPlusTree       - insertion with leaf/internal splits, search, range scan
#    StaticHash      - fixed buckets + overflow chains
#    ExtendibleHash  - dynamic hashing with directory doubling
#    bitmap_index    - bitmap per distinct value
# ============================================================================
import math


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def cmp(a, b):
    if _is_num(a) and _is_num(b):
        return (a > b) - (a < b)
    ka, kb = (str(a).lower(), str(a)), (str(b).lower(), str(b))  # ~ localeCompare
    return (ka > kb) - (ka < kb)


def _keys(keys):
    return '|'.join(str(k) for k in keys)


# ------------------------------------------------------------- B+ tree ----
# order n = max number of pointers in a node  (Silberschatz notation)
# leaf     : at most n-1 keys
# internal : at most n children (n-1 keys)
class Node:
    def __init__(self, leaf, keys=None, children=None, next_=None):
        self.leaf = leaf
        self.keys = keys if keys is not None else []
        self.children = children if children is not None else []
        self.next = next_


class BPlusTree:
    def __init__(self, n=4):
        if n < 3:
            raise ValueError('order must be >= 3')
        self.n = n
        self.root = Node(True)
        self.events = []

    def find_path(self, key):
        path = [self.root]
        node = self.root
        while not node.leaf:
            i = 0
            while i < len(node.keys) and cmp(key, node.keys[i]) >= 0:
                i += 1
            node = node.children[i]
            path.append(node)
        return path

    def search(self, key):
        path = self.find_path(key)
        leaf = path[-1]
        return {'found': any(cmp(k, key) == 0 for k in leaf.keys), 'path': ['[%s]' % _keys(p.keys) for p in path]}

    def range(self, lo, hi):
        leaf = self.find_path(lo)[-1]
        out = []
        hops = 0
        while leaf:
            hops += 1
            for k in leaf.keys:
                if cmp(k, hi) > 0:
                    return {'keys': out, 'leaves_visited': hops}
                if cmp(k, lo) >= 0:
                    out.append(k)
            leaf = leaf.next
        return {'keys': out, 'leaves_visited': hops}

    def insert(self, key):
        path = self.find_path(key)
        leaf = path[-1]
        if any(cmp(k, key) == 0 for k in leaf.keys):
            self.events.append('%s: duplicate, ignored' % key)
            return
        i = 0
        while i < len(leaf.keys) and cmp(leaf.keys[i], key) < 0:
            i += 1
        leaf.keys.insert(i, key)
        if len(leaf.keys) <= self.n - 1:
            self.events.append('%s: inserted into leaf [%s]' % (key, _keys(leaf.keys)))
            return
        # split leaf: first ceil(n/2) keys stay
        keep = math.ceil(self.n / 2)
        right = Node(True, leaf.keys[keep:], next_=leaf.next)
        leaf.keys = leaf.keys[:keep]
        leaf.next = right
        self.events.append('%s: leaf overflow → split into [%s] and [%s], copy up %s' % (
            key, _keys(leaf.keys), _keys(right.keys), right.keys[0]))
        self.insert_in_parent(path, len(path) - 1, leaf, right.keys[0], right)

    def insert_in_parent(self, path, level, left, key, right):
        if level == 0:
            self.root = Node(False, [key], [left, right])
            self.events.append('   new root [%s] → tree height grows' % key)
            return
        parent = path[level - 1]
        idx = next(i for i, ch in enumerate(parent.children) if ch is left)
        parent.keys.insert(idx, key)
        parent.children.insert(idx + 1, right)
        if len(parent.children) <= self.n:
            return
        # split internal node: middle key moves UP (not copied)
        left_count = math.ceil((self.n + 1) / 2)
        up = parent.keys[left_count - 1]
        sibling = Node(False, parent.keys[left_count:], parent.children[left_count:])
        parent.keys = parent.keys[:left_count - 1]
        parent.children = parent.children[:left_count]
        self.events.append('   internal overflow → split, push up %s' % up)
        self.insert_in_parent(path, level - 1, parent, up, sibling)

    def levels(self):
        out = []
        level = [self.root]
        while level:
            out.append([n.keys for n in level])
            level = [ch for n in level if not n.leaf for ch in n.children]
        return out

    def height(self):
        return len(self.levels())


# ---------------------------------------------------------- hashing -------
def hash_key(k):
    if _is_num(k):
        return abs(int(k))
    h = 0
    for ch in str(k):
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h


class StaticHash:
    def __init__(self, buckets=5, capacity=2):
        self.N = buckets
        self.cap = capacity
        self.table = [[[]] for _ in range(buckets)]  # bucket -> list of pages
        self.events = []

    def insert(self, k):
        b = hash_key(k) % self.N
        pages = self.table[b]
        page = pages[-1]
        if len(page) >= self.cap:
            page = []
            pages.append(page)
            self.events.append('%s: h=%d mod %d = %d → bucket full, OVERFLOW page #%d chained' % (k, hash_key(k), self.N, b, len(pages) - 1))
        else:
            self.events.append('%s: h=%d mod %d = %d' % (k, hash_key(k), self.N, b))
        page.append(k)

    def search(self, k):
        b = hash_key(k) % self.N
        pages_read = 0
        for p in self.table[b]:
            pages_read += 1
            if k in p:
                return {'bucket': b, 'pages_read': pages_read, 'found': True}
        return {'bucket': b, 'pages_read': pages_read, 'found': False}


class Bucket:
    def __init__(self, id_, local):
        self.id = id_
        self.local = local
        self.keys = []


class ExtendibleHash:
    def __init__(self, capacity=2):
        self.cap = capacity
        self.global_ = 0
        self.dir = [Bucket('B0', 0)]
        self.next_id = 1
        self.events = []

    def bits(self, k, d):
        return 0 if d == 0 else hash_key(k) & ((1 << d) - 1)

    def insert(self, k):
        for _ in range(24):
            idx = self.bits(k, self.global_)
            b = self.dir[idx]
            if len(b.keys) < self.cap:
                b.keys.append(k)
                bits = format(hash_key(k), 'b').rjust(max(self.global_, 1), '0')[-8:]
                self.events.append('%s: h=%s  last %d bit(s) → dir[%d] → %s' % (k, bits, self.global_, idx, b.id))
                return
            if b.local == self.global_:
                self.dir = self.dir + self.dir
                self.global_ += 1
                self.events.append('%s: %s full and local depth = global depth → DIRECTORY DOUBLES to %d entries (global depth %d)' % (
                    k, b.id, len(self.dir), self.global_))
            # split bucket b
            nb = Bucket('B%d' % self.next_id, b.local + 1)
            self.next_id += 1
            b.local += 1
            bit = 1 << (b.local - 1)
            for i in range(len(self.dir)):
                if self.dir[i] is b and (i & bit):
                    self.dir[i] = nb
            old = b.keys
            b.keys = []
            for x in old:
                (nb if hash_key(x) & bit else b).keys.append(x)
            self.events.append('%s: split %s → %s[%s] and %s[%s] (local depth %d)' % (
                k, b.id, b.id, ','.join(map(str, b.keys)), nb.id, ','.join(map(str, nb.keys)), b.local))
        self.events.append('%s: too many identical hash values - would need an overflow chain' % k)


# ------------------------------------------------------------- bitmap -----
def bitmap_index(rows, column):
    values = sorted({r[column] for r in rows}, key=lambda v: (v is None, str(v)))
    return {v: [1 if r[column] == v else 0 for r in rows] for v in values}
