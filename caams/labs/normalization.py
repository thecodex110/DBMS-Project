# ============================================================================
#  LAB 9 : NORMALIZATION (Unit 4)  - 1NF → 2NF → 3NF → BCNF
#  Enter ANY relation + functional dependencies and the lab computes
#  closures, candidate keys, canonical cover, normal form, and both
#  decompositions (3NF synthesis, BCNF) with lossless/dependency checks.
# ============================================================================
import re

from ..ui import term as ui
from ..ui.menu import run_menu
from .algorithms import fd

PRESETS = [
    {
        'name': 'OUR PROJECT: un-normalised attendance sheet (how our schema was derived)',
        'rel': 'roll_no, student_name, dept_id, dept_name, subject_id, subject_name, faculty_id, faculty_name, session_id, session_date, status',
        'fds': 'roll_no -> student_name, dept_id; dept_id -> dept_name; subject_id -> subject_name; faculty_id -> faculty_name; session_id -> subject_id, faculty_id, session_date; session_id, roll_no -> status',
    },
    {
        'name': 'OUR PROJECT: exam marks sheet with grade',
        'rel': 'roll_no, subject_id, exam_type, marks, max_marks, student_name, credits',
        'fds': 'roll_no, subject_id, exam_type -> marks; exam_type -> max_marks; roll_no -> student_name; subject_id -> credits',
    },
    {'name': 'Silberschatz: R(A,B,C,D,E)', 'rel': 'ABCDE', 'fds': 'A -> BC; CD -> E; B -> D; E -> A'},
    {'name': 'Classic BCNF-but-not-dependency-preserving: R(A,B,C)', 'rel': 'ABC', 'fds': 'AB -> C; C -> B'},
    {'name': 'Classic 2NF violation: EMP_PROJ', 'rel': 'ssn, pnumber, hours, ename, pname, plocation', 'fds': 'ssn, pnumber -> hours; ssn -> ename; pnumber -> pname, plocation'},
    {'name': 'Transitive dependency: R(A,B,C,D)', 'rel': 'ABCD', 'fds': 'A -> B; B -> C; C -> D'},
]


def set_(a):
    return '{%s}' % ', '.join(a)


def get_input():
    choice = ui.pick('Choose a relation', PRESETS + [{'name': 'Enter my own relation + FDs'}], lambda p: p['name'])
    if not choice:
        return None
    if 'rel' in choice:
        return {'rel_text': choice['rel'], 'fd_text': choice['fds']}
    ui.note('Attributes: "ABCDE" (single letters) or "roll_no, name, dept" (comma separated)')
    rel_text = ui.ask_text('Relation attributes', required=True)
    ui.note('FDs separated by ";"   e.g.   A -> B; B,C -> D     or   roll_no -> name; dept -> hod')
    fd_text = ui.ask_text('Functional dependencies', required=True)
    return {'rel_text': rel_text, 'fd_text': fd_text}


def parse(inp):
    rel = fd.parse_relation(inp['rel_text'])
    fds = fd.parse_fds(inp['fd_text'], rel)
    return rel['attrs'], fds, rel


def full_analysis():
    inp = get_input()
    if not inp:
        return
    attrs, fds, _ = parse(inp)
    ui.box('Relation', ['R(%s)' % ', '.join(attrs)] + ['  %s' % fd.fd_str(f) for f in fds])

    a = fd.analyze(attrs, fds)
    ui.section('Step 1 - Attribute closures of the LHS of each FD')
    for f in fds:
        cl = fd.closure(f['lhs'], fds)
        sk = len(cl) == len(attrs)
        print('    %s = %s %s' % (ui.pad_end(set_(f['lhs']) + '⁺', 28), set_(cl), ui.c.green('← superkey') if sk else ''))
    ui.section('Step 2 - Candidate keys')
    for k in a['keys']:
        print('    %s' % ui.c.bold(set_(k)))
    print('    Prime attributes     : %s' % set_(a['prime']))
    print('    Non-prime attributes : %s' % set_(a['non_prime']))

    ui.section('Step 3 - Canonical (minimal) cover')
    for f in fd.combine_by_lhs(a['cover']):
        print('    %s' % fd.fd_str(f))

    ui.section('Step 4 - Normal form tests')
    ok, bad = ui.c.green('✓'), ui.c.red('✗')
    print('    1NF : %s assumed (all attributes atomic - multivalued attrs moved to own table)' % ok)
    if a['partial']:
        for p in a['partial']:
            print('    2NF : %s partial dependency %s → %s  (%s is part of key %s)' % (bad, set_(p['lhs']), set_(p['rhs']), set_(p['lhs']), set_(p['key'])))
    else:
        print('    2NF : %s no non-prime attribute depends on part of a candidate key' % ok)
    if a['v3']:
        for v in a['v3']:
            print('    3NF : %s %s  - LHS not a superkey and %s is non-prime%s' % (
                bad, fd.fd_str(v), v['rhs'][0], ' (transitive)' if any(v is t for t in a['transitive']) else ''))
    else:
        print('    3NF : %s for every X → A: X is a superkey or A is prime' % ok)
    if a['v_bcnf']:
        for v in a['v_bcnf']:
            print('    BCNF: %s %s  - LHS is not a superkey' % (bad, fd.fd_str(v)))
    else:
        print('    BCNF: %s every determinant is a superkey' % ok)
    colour = ui.c.bgGreen if a['nf'] == 'BCNF' else ui.c.bgYellow if a['nf'] == '3NF' else ui.c.bgRed
    print('\n    Highest normal form satisfied:  %s' % colour(' %s ' % a['nf']))

    if a['nf'] != 'BCNF':
        ui.section('Step 5a - 3NF decomposition (synthesis algorithm)')
        s3 = fd.synthesis_3nf(attrs, fds)
        for i, s in enumerate(s3):
            print('    R%d(%s)  %s' % (i + 1, ', '.join(s['attrs']), ui.c.gray('from ' + s['from'])))
        report(attrs, [s['attrs'] for s in s3], fds)

        ui.section('Step 5b - BCNF decomposition')
        b = fd.bcnf_decompose(attrs, fds)
        for s in b['steps']:
            print('    split (%s) on %s → %s  ⇒  (%s) + (%s)' % (','.join(s['relation']), set_(s['violating']['lhs']),
                                                            set_(s['violating']['rhs']), ','.join(s['r1']), ','.join(s['r2'])))
        for i, r in enumerate(b['relations']):
            proj = fd.project_fds(r, fds)
            print('    R%d(%s)  %s' % (i + 1, ', '.join(r), ui.c.gray('; '.join(fd.fd_str(p) for p in proj) or 'no non-trivial FDs')))
        report(attrs, b['relations'], fds)


def report(attrs, decomposition, fds):
    ll = fd.lossless_chase(attrs, decomposition, fds)
    dp = fd.dependency_preserved(decomposition, fds)
    print('      Lossless join (chase test)  : %s' % (ui.c.green('✓ yes') if ll['lossless'] else ui.c.red('✗ NO')))
    print('      Dependency preserving       : %s' % (ui.c.green('✓ yes') if dp['preserved']
                                                     else ui.c.yellow('✗ no - lost ' + ', '.join(fd.fd_str(f) for f in dp['lost']))))


def closure_calc():
    inp = get_input()
    if not inp:
        return
    attrs, fds, rel = parse(inp)
    ui.note('R(%s)' % ', '.join(attrs))
    x = ui.ask_text('Attribute set X to compute X⁺', default=attrs[0])
    xs = []
    for t in [t for t in re.split(r'[\s,]+', x) if t]:
        xs.extend(list(t) if rel['single_char'] and len(t) > 1 else [t])
    trace = []
    cl = fd.closure(xs, fds, trace)
    ui.section('Computing {%s}⁺' % ','.join(xs))
    print('    start: {%s}' % ','.join(xs))
    for t in trace:
        print('    ' + t)
    print('\n    %s  %s' % (ui.c.bold('{%s}⁺ = %s' % (','.join(xs), set_(cl))),
                           ui.c.green('→ X is a SUPERKEY') if len(cl) == len(attrs) else ui.c.yellow('→ not a superkey')))


def decomposition_check():
    inp = get_input()
    if not inp:
        return
    attrs, fds, rel = parse(inp)
    ui.note('R(%s)' % ', '.join(attrs))
    ui.note('Enter the decomposition as relations separated by "|",  e.g.  AB | BC   or   roll_no,name | roll_no,dept')
    text = ui.ask_text('Decomposition', required=True)
    parts = []
    for p in text.split('|'):
        toks = [t for t in re.split(r'[\s,]+', p) if t]
        lst = [ch for t in toks for ch in t] if rel['single_char'] else toks
        for a in lst:
            if a not in attrs:
                raise ValueError('Attribute "%s" is not in R' % a)
        parts.append(sorted(set(lst)))
    ll = fd.lossless_chase(attrs, parts, fds)
    ui.section('Chase tableau after applying all FDs (a = known, bᵢ = unknown)')
    rows = []
    for i, row in enumerate(ll['tableau']):
        d = {'relation': 'R%d' % (i + 1)}
        d.update({a: row[j] for j, a in enumerate(attrs)})
        rows.append(d)
    ui.table(rows)
    report(attrs, parts, fds)


def mvd_note():
    ui.box('Multivalued dependency (self-study) - how our schema handles it', [
        'A student can have MANY phone numbers and is enrolled in MANY subjects,',
        'and these two facts are independent of each other:',
        '',
        '     roll_no ↠ phone          roll_no ↠ subject_id',
        '',
        'If we stored  STUDENT_INFO(roll_no, phone, subject_id)  every phone would be',
        'repeated for every subject (2 phones × 4 subjects = 8 rows) → redundancy',
        'even though the table is in BCNF (key = all three attributes).',
        '',
        '4NF fix (what we did):  student_phone(roll_no, phone)',
        '                        enrollment(roll_no, subject_id)',
    ])


def menu():
    run_menu('NORMALIZATION LAB', 'FDs · keys · 1NF → BCNF · decomposition', [
        {'label': 'Full analysis + decomposition', 'hint': 'keys, NF, 3NF & BCNF', 'action': full_analysis},
        {'label': 'Attribute closure X⁺ (step by step)', 'hint': 'closure algorithm', 'action': closure_calc},
        {'label': 'Test MY decomposition', 'hint': 'lossless + dep. preserving', 'action': decomposition_check},
        {'label': '↠  Multivalued dependencies & 4NF', 'hint': 'self-study', 'action': mvd_note},
    ])
