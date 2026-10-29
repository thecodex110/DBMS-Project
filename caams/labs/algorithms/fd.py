# ============================================================================
#  FUNCTIONAL-DEPENDENCY ALGORITHMS  (pure functions, no UI)
#  closure · candidate keys · canonical cover · 2NF/3NF/BCNF tests
#  3NF synthesis · BCNF decomposition · lossless-join (chase) · dependency
#  preservation.   Attribute sets are plain sorted lists of strings,
#  an FD is a dict {'lhs': [...], 'rhs': [...]}.
# ============================================================================
import re
from itertools import combinations


def uniq(a):
    return list(dict.fromkeys(a))


def norm(a):
    return sorted(set(a))


def subset(a, b):
    return all(x in b for x in a)


def minus(a, b):
    return [x for x in a if x not in b]


def eq(a, b):
    return len(a) == len(b) and subset(a, b)


def show(a):
    return ','.join(a)


def fd_str(fd):
    return '%s → %s' % (show(fd['lhs']), show(fd['rhs']))


def subsets_of(arr, min_size=1, max_size=None):
    if max_size is None:
        max_size = len(arr)
    for k in range(min_size, max_size + 1):
        for combo in combinations(arr, k):
            yield list(combo)


# ---------------------------------------------------------------- parsing --
def split_attrs(text, single_char):
    s = text.strip()
    if not s:
        return []
    if re.search(r'[,\s]', s):
        return [t for t in re.split(r'[\s,]+', s) if t]
    return list(s) if single_char else [s]


def parse_relation(text):
    attrs = [t for t in re.split(r'[\s,]+', text) if t]
    whole_word = len(attrs) == 1 and len(attrs[0]) > 1
    single_char = True if whole_word else all(len(a) == 1 for a in attrs)
    lst = list(attrs[0]) if whole_word else attrs
    return {'attrs': norm(lst), 'single_char': single_char}


def parse_fds(text, rel):
    fds = []
    for part in [p.strip() for p in re.split(r'[;\n]+', text) if p.strip()]:
        m = re.split(r'\s*(?:->|→)\s*', part)
        if len(m) != 2:
            raise ValueError('Bad FD "%s" - use the form  A,B -> C' % part)
        lhs = norm(split_attrs(m[0], rel['single_char']))
        rhs = norm(split_attrs(m[1], rel['single_char']))
        for a in lhs + rhs:
            if a not in rel['attrs']:
                raise ValueError('Attribute "%s" is not in the relation' % a)
        fds.append({'lhs': lhs, 'rhs': rhs})
    return fds


# ------------------------------------------------------------- core algos --
def closure(attrs, fds, trace=None):
    result = norm(attrs)
    changed = True
    while changed:
        changed = False
        for fd in fds:
            if subset(fd['lhs'], result) and not subset(fd['rhs'], result):
                result = norm(result + fd['rhs'])
                if trace is not None:
                    trace.append('using %s  ⇒  {%s}' % (fd_str(fd), show(result)))
                changed = True
    return result


def is_superkey(x, attrs, fds):
    return subset(attrs, closure(x, fds))


def candidate_keys(attrs, fds):
    on_rhs = {a for f in fds for a in minus(f['rhs'], f['lhs'])}
    core = [a for a in attrs if a not in on_rhs]  # never determined -> in every key
    if is_superkey(core, attrs, fds):
        return [norm(core)]
    rest = minus(attrs, core)
    keys = []
    for extra in subsets_of(rest, 1):
        cand = norm(core + extra)
        if any(subset(k, cand) for k in keys):
            continue
        if is_superkey(cand, attrs, fds):
            keys.append(cand)
    return keys


def minimal_cover(fds):
    """Canonical / minimal cover."""
    F = []
    for fd in fds:
        for a in fd['rhs']:
            if a not in fd['lhs']:
                F.append({'lhs': list(fd['lhs']), 'rhs': [a]})
    # remove extraneous LHS attributes
    for fd in F:
        for a in list(fd['lhs']):
            if len(fd['lhs']) < 2:
                break
            reduced = minus(fd['lhs'], [a])
            if subset(fd['rhs'], closure(reduced, F)):
                fd['lhs'] = reduced
    # dedupe
    F = [fd for i, fd in enumerate(F)
         if next(j for j, g in enumerate(F) if eq(g['lhs'], fd['lhs']) and eq(g['rhs'], fd['rhs'])) == i]
    # remove redundant FDs
    for i in range(len(F) - 1, -1, -1):
        others = [g for j, g in enumerate(F) if j != i]
        if subset(F[i]['rhs'], closure(F[i]['lhs'], others)):
            F = others
    return F


def combine_by_lhs(F):
    out = []
    for fd in F:
        g = next((x for x in out if eq(x['lhs'], fd['lhs'])), None)
        if g:
            g['rhs'] = norm(g['rhs'] + fd['rhs'])
        else:
            out.append({'lhs': list(fd['lhs']), 'rhs': list(fd['rhs'])})
    return out


# ------------------------------------------------------- normal-form test --
def analyze(attrs, fds):
    keys = candidate_keys(attrs, fds)
    prime = norm([a for k in keys for a in k])
    non_prime = minus(attrs, prime)
    cover = minimal_cover(fds)

    partial = []
    for k in keys:
        if len(k) < 2:
            continue
        for s in subsets_of(k, 1, len(k) - 1):
            dep = [a for a in minus(closure(s, fds), s) if a in non_prime]
            if dep and not any(eq(p['lhs'], s) for p in partial):
                partial.append({'lhs': s, 'rhs': norm(dep), 'key': k})
    v3 = [fd for fd in cover if not is_superkey(fd['lhs'], attrs, fds) and fd['rhs'][0] not in prime]
    v_bcnf = [fd for fd in cover if not is_superkey(fd['lhs'], attrs, fds)]
    # 3NF violations whose LHS is NOT part of a key = transitive dependencies
    transitive = [fd for fd in v3 if not any(subset(fd['lhs'], k) and len(fd['lhs']) < len(k) for k in keys)]

    nf = 'BCNF'
    if v_bcnf:
        nf = '3NF'
    if v3:
        nf = '2NF'
    if partial:
        nf = '1NF'
    return {'keys': keys, 'prime': prime, 'non_prime': non_prime, 'cover': cover, 'partial': partial,
            'transitive': transitive, 'v3': v3, 'v_bcnf': v_bcnf, 'nf': nf}


# -------------------------------------------------------- decompositions --
def project_fds(ri, fds):
    out = []
    for x in subsets_of(ri, 1, len(ri) - 1):
        rhs = minus([a for a in closure(x, fds) if a in ri], x)
        if rhs:
            out.append({'lhs': x, 'rhs': rhs})
    return combine_by_lhs(minimal_cover(out))


def synthesis_3nf(attrs, fds):
    cover = combine_by_lhs(minimal_cover(fds))
    schemas = [{'attrs': norm(fd['lhs'] + fd['rhs']), 'from': fd_str(fd)} for fd in cover]
    keys = candidate_keys(attrs, fds)
    if not any(any(subset(k, s['attrs']) for k in keys) for s in schemas):
        schemas.append({'attrs': keys[0], 'from': 'candidate key (ensures lossless join)'})
    schemas = [s for i, s in enumerate(schemas)
               if not any(j != i and subset(s['attrs'], t['attrs']) and (not eq(s['attrs'], t['attrs']) or j < i)
                          for j, t in enumerate(schemas))]
    # attributes not in any FD
    covered = norm([a for s in schemas for a in s['attrs']])
    missing = minus(attrs, covered)
    if missing:
        schemas.append({'attrs': missing, 'from': 'attributes not in any FD'})
    return schemas


def bcnf_decompose(attrs, fds):
    steps = []
    result = [norm(attrs)]
    guard = 0
    while True:
        changed = False
        i = 0
        while i < len(result) and not changed:
            ri = result[i]
            for x in subsets_of(ri, 1, len(ri) - 1):
                cl = [a for a in closure(x, fds) if a in ri]
                if eq(cl, x) or subset(ri, cl):
                    continue  # trivial, or X is a superkey of Ri
                r1 = norm(cl)
                r2 = norm(minus(ri, minus(cl, x)))
                steps.append({'relation': ri, 'violating': {'lhs': x, 'rhs': minus(cl, x)}, 'r1': r1, 'r2': r2})
                result[i:i + 1] = [r1, r2]
                changed = True
                break
            i += 1
        guard += 1
        if not changed or guard > 50:
            break
    return {'relations': result, 'steps': steps}


def lossless_chase(attrs, decomposition, fds):
    """Lossless-join test with the chase (tableau) algorithm."""
    rows = [['a' if a in ri else 'b%d' % (i + 1) for a in attrs] for i, ri in enumerate(decomposition)]
    changed = True
    while changed:
        changed = False
        for fd in fds:
            li = [attrs.index(a) for a in fd['lhs']]
            groups = {}
            for ri, r in enumerate(rows):
                groups.setdefault('|'.join(r[i] for i in li), []).append(ri)
            for g in groups.values():
                if len(g) < 2:
                    continue
                for a in fd['rhs']:
                    ci = attrs.index(a)
                    vals = [rows[ri][ci] for ri in g]
                    target = 'a' if 'a' in vals else sorted(vals)[0]
                    for ri in g:
                        if rows[ri][ci] != target:
                            rows[ri][ci] = target
                            changed = True
    return {'lossless': any(all(v == 'a' for v in r) for r in rows), 'tableau': rows}


def dependency_preserved(decomposition, fds):
    lost = []
    for fd in fds:
        res = list(fd['lhs'])
        changed = True
        while changed:
            changed = False
            for ri in decomposition:
                t = [a for a in closure([a for a in res if a in ri], fds) if a in ri]
                nxt = norm(res + t)
                if len(nxt) > len(res):
                    res = nxt
                    changed = True
        if not subset(fd['rhs'], res):
            lost.append(fd)
    return {'preserved': not lost, 'lost': lost}
