# ============================================================================
#  TERMINAL UI TOOLKIT  (zero dependencies)
#  colours, boxes, tables, bar charts, SQL highlighting and input prompts.
#  Input also works with piped/scripted input:
#      printf "admin\nadmin@123\n0\n" | python3 main.py
# ============================================================================
import math
import os
import re
import sys

# Windows: print box-drawing characters as UTF-8 and switch on ANSI colours
# (os.system('') turns on virtual-terminal mode in the classic console).
if os.name == 'nt':
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding='utf-8')
        except (AttributeError, ValueError):
            pass
    os.system('')

TTY = sys.stdout.isatty()
COLOR = TTY and not os.environ.get('NO_COLOR')
STDIN_TTY = sys.stdin.isatty()


def _paint(code):
    return lambda s: '\x1b[%sm%s\x1b[0m' % (code, s) if COLOR else str(s)


class _Colors:
    pass


c = _Colors()
for _name, _code in {
    'bold': '1', 'dim': '2', 'italic': '3', 'under': '4',
    'red': '31', 'green': '32', 'yellow': '33', 'blue': '34',
    'magenta': '35', 'cyan': '36', 'gray': '90', 'white': '97',
    'bRed': '1;31', 'bGreen': '1;32', 'bYellow': '1;33', 'bCyan': '1;36', 'bMagenta': '1;35',
    'bgBlue': '44;97;1', 'bgRed': '41;97;1', 'bgGreen': '42;30;1', 'bgYellow': '43;30;1', 'bgMagenta': '45;97;1',
}.items():
    setattr(c, _name, _paint(_code))

_ANSI = re.compile(r'\x1b\[[0-9;]*m')
# emoji / wide symbols take 2 terminal columns
_WIDE = re.compile('[\U0001F300-\U0001FAFF☀-➿⭐✅]')
ZWJ, VS16 = '‍', '️'


def strip_ansi(s):
    return _ANSI.sub('', str(s))


def width(s):
    chars = list(strip_ansi(s))
    w, i = 0, 0
    while i < len(chars):
        ch = chars[i]
        if ch == ZWJ:  # zero-width joiner: joined emoji shares the cell
            i += 2
            continue
        if ch != VS16:
            nxt = chars[i + 1] if i + 1 < len(chars) else ''
            w += 2 if _WIDE.match(ch) or nxt == VS16 else 1
        i += 1
    return w


def pad_end(s, n):
    s = str(s)
    return s + ' ' * max(0, n - width(s))


def pad_start(s, n):
    s = str(s)
    return ' ' * max(0, n - width(s)) + s


def truncate(s, n):
    plain = strip_ansi(s)
    return plain[:n - 1] + '…' if len(plain) > n else s


# ---------------------------------------------------------------- input ----
class InputClosed(Exception):
    pass


def ask(prompt):
    if STDIN_TTY:
        try:
            line = input(prompt)
        except EOFError:
            raise InputClosed('input closed')
    else:
        sys.stdout.write(prompt)
        sys.stdout.flush()
        line = sys.stdin.readline()
        if line == '':
            raise InputClosed('input closed')
        line = line.rstrip('\r\n')
        sys.stdout.write(line + '\n')  # echo scripted input
    return line.strip()


_NO_DEFAULT = object()


def ask_text(label, default=_NO_DEFAULT, required=False, validate=None):
    while True:
        has_def = default is not _NO_DEFAULT
        hint = c.gray(' [%s]' % default) if has_def and default is not None and default != '' else ''
        v = ask('  %s %s%s: ' % (c.cyan('›'), label, hint))
        if v == '' and has_def:
            v = '' if default is None else str(default)
        if required and v == '':
            error('This field is required.')
            continue
        if validate and v != '':
            msg = validate(v)
            if msg:
                error(msg)
                continue
        return v


def _to_number(v):
    try:
        n = float(v)
    except ValueError:
        return None
    return n if math.isfinite(n) else None


def ask_int(label, min_=-math.inf, max_=math.inf, default=_NO_DEFAULT):
    while True:
        v = ask_text(label, default=default, required=default is _NO_DEFAULT)
        n = 0.0 if v == '' else _to_number(v)
        if n is not None and n == int(n) and min_ <= n <= max_:
            return int(n)
        error('Enter a whole number%s.' % (' between %s and %s' % (min_, max_) if math.isfinite(min_) else ''))


def ask_number(label, min_=-math.inf, max_=math.inf, default=_NO_DEFAULT, allow_blank=False):
    while True:
        v = ask_text(label, default=default)
        if v == '' and allow_blank:
            return None
        n = _to_number(v) if v != '' else None
        if n is not None and min_ <= n <= max_:
            return int(n) if n == int(n) else n
        error('Enter a number between %s and %s%s.' % (min_, max_, ' (or leave blank)' if allow_blank else ''))


def confirm(label, default=False):
    v = ask('  %s %s %s: ' % (c.yellow('?'), label, c.gray('[Y/n]' if default else '[y/N]'))).lower()
    if v == '':
        return default
    return v in ('y', 'yes', 'haan', 'ha')


def pick(title, items, render=str, allow_back=True):
    """Pick one item from a list -> returns the item (or None for "back")."""
    if not items:
        warn('Nothing to choose from.')
        return None
    print('\n' + c.bold(title))
    for i, it in enumerate(items):
        print('   %s. %s' % (c.cyan(pad_start(str(i + 1), 2)), render(it)))
    if allow_back:
        print('   %s' % c.gray(' 0. Back'))
    n = ask_int('Choose', min_=0 if allow_back else 1, max_=len(items))
    return None if n == 0 else items[n - 1]


def pause():
    if not STDIN_TTY:
        return
    ask(c.gray('\n  Press Enter to continue...'))


def clear():
    if TTY:
        sys.stdout.write('\x1b[2J\x1b[3J\x1b[H')


# ---------------------------------------------------------------- output ---
def success(m):
    print('  %s %s' % (c.bGreen('[OK]'), c.green(m)))


def error(m):
    print('  %s %s' % (c.bRed('[ERROR]'), c.red(m)))


def warn(m):
    print('  %s %s' % (c.bYellow('[WARNING]'), c.yellow(m)))


def info(m):
    print('  %s %s' % (c.bCyan('[INFO]'), m))


def note(m):
    print(c.gray('    %s' % m))


def box(title, lines=(), color=None):
    color = color or c.cyan
    body = list(lines) if isinstance(lines, (list, tuple)) else [lines]
    inner = max([width(title) + 2, 40] + [width(l) for l in body])
    print(color('  ╭' + '─' * (inner + 2) + '╮'))
    print(color('  │ ') + c.bold(pad_end(title, inner)) + color(' │'))
    if body:
        print(color('  ├' + '─' * (inner + 2) + '┤'))
    for l in body:
        print(color('  │ ') + pad_end(l, inner) + color(' │'))
    print(color('  ╰' + '─' * (inner + 2) + '╯'))


def header(title, subtitle=None):
    clear()
    line = '═' * max(64, width(title) + 6)
    print(c.bCyan('\n  ' + line))
    print('   ' + c.bold(title))
    if subtitle:
        print('   ' + c.gray(subtitle))
    print(c.bCyan('  ' + line))


def section(title):
    print('\n  ' + c.bMagenta('▌ ') + c.bold(title))


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def num_str(v):
    """Numbers print like JavaScript: 75.0 -> '75', 66.666 -> '66.67'."""
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        r = math.floor(v * 100 + 0.5) / 100
        return str(int(r)) if r == int(r) else repr(r)
    return str(v)


def fmt(v):
    if v is None:
        return c.gray('NULL')
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if is_num(v):
        return num_str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return c.gray('<blob %dB>' % len(v))
    return str(v)


def table(rows, columns=None, title=None, max_width=34, limit=None, color=None):
    """rows: list of dicts.  color: {col: fn(value, painted_str) -> painted_str}"""
    if title:
        section(title)
    if not rows:
        print(c.gray('    (no rows)'))
        return
    columns = columns or list(rows[0].keys())
    limit = limit or len(rows)
    shown = rows[:limit]
    cells = []
    for r in shown:
        line = []
        for col in columns:
            raw = r.get(col)
            s = truncate(fmt(raw), max_width)
            if color and col in color and raw is not None:
                s = color[col](raw, s)
            line.append(s)
        cells.append(line)
    # a column is right-aligned only if every shown row HAS it and it is NULL or a number
    numeric = [all(col in r and (r[col] is None or is_num(r[col])) for r in shown) for col in columns]
    widths = [max([width(col)] + [width(row[i]) for row in cells]) for i, col in enumerate(columns)]

    def sep(l, m, r):
        return c.gray('  ' + l + m.join('─' * (w + 2) for w in widths) + r)
    print(sep('┌', '┬', '┐'))
    print(c.gray('  │') + c.gray('│').join(' ' + c.bold(c.cyan(pad_end(col, widths[i]))) + ' ' for i, col in enumerate(columns)) + c.gray('│'))
    print(sep('├', '┼', '┤'))
    for row in cells:
        print(c.gray('  │') + c.gray('│').join(
            ' ' + (pad_start(s, widths[i]) if numeric[i] else pad_end(s, widths[i])) + ' ' for i, s in enumerate(row)) + c.gray('│'))
    print(sep('└', '┴', '┘'))
    more = ', showing first %d' % limit if len(rows) > limit else ''
    print(c.gray('    %d row%s%s' % (len(rows), '' if len(rows) == 1 else 's', more)))


def bar(pct, size=20):
    if pct is None:
        return c.gray('·' * size + '   n/a')
    filled = int(math.floor(max(0, min(100, pct)) / 100 * size + 0.5))
    color = c.green if pct >= 75 else c.yellow if pct >= 60 else c.red
    return color('█' * filled) + c.gray('░' * (size - filled)) + ' ' + color(pad_start('%.1f' % pct, 5) + '%')


def pct_color(v, s):
    return c.green(s) if v >= 75 else c.yellow(s) if v >= 60 else c.red(s)


def bar_chart(items, max_=None, unit='', size=30):
    """Horizontal bar chart: items [{'label', 'value'}]."""
    if not items:
        return
    top = max_ or max([1] + [i['value'] or 0 for i in items])
    lw = max(width(i['label']) for i in items)
    for it in items:
        n = int(math.floor((it['value'] or 0) / top * size + 0.5))
        print('    %s %s%s %s%s' % (pad_end(it['label'], lw), c.cyan('▇' * n), c.gray('▏'), fmt(it['value']), unit))


KEYWORDS = re.compile(r'^(SELECT|FROM|WHERE|AND|OR|NOT|IN|EXISTS|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL|ON|USING|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|DISTINCT|UNION|ALL|INTERSECT|EXCEPT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|INDEX|DROP|ALTER|ADD|COLUMN|RENAME|TO|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|DEFAULT|NULL|IS|LIKE|BETWEEN|CASE|WHEN|THEN|ELSE|END|WITH|RECURSIVE|COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|OVER|PARTITION|RANK|DENSE_RANK|ROW_NUMBER|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|TRANSACTION|CASCADE|RESTRICT|EXPLAIN|QUERY|PLAN|ASC|DESC|CONSTRAINT|IF|TRIGGER|INTEGER|VARCHAR|DATE|DECIMAL|TEXT|CHAR|NULLIF|IFNULL|ANALYZE|CONFLICT|DO|NOTHING|REPLACE|INDEXED)$', re.I)
_TOKENS = re.compile(r"('[^']*')|(--.*$)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]+)")


def _paint_token(m):
    s, cmt, num, word = m.groups()
    if s:
        return c.green(s)
    if cmt:
        return c.gray(cmt)
    if num:
        return c.magenta(num)
    return c.bold(c.blue(word.upper())) if KEYWORDS.match(word) else word


def print_sql(sql):
    for l in sql.strip().split('\n'):
        painted = _TOKENS.sub(_paint_token, l) if COLOR else l
        print(c.gray('    │ ') + painted)
