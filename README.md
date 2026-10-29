# 🎓 CAAMS: College Academic & Attendance Management System

A DBMS mini-project in **Python + SQLite**. It keeps a college's students, faculty, subjects, attendance, leave, marks and results in one SQLite database. You can use it from two front ends:

* a **terminal app** with menus, tables and charts drawn in the console
* a **web app**: teachers and admins log in to a dashboard, and students log in to see their own attendance and results

The database uses the full DBMS syllabus: E-R design, constraints (PK, FK with CASCADE / RESTRICT / SET NULL, CHECK, UNIQUE), **views**, **triggers**, **indexes**, transactions (`BEGIN … COMMIT / ROLLBACK`), aggregates, joins, nested queries and window functions.

> 📘 **Hinglish guide:** [GUIDE.md](GUIDE.md) and [PROJECT_EXPLAINED.md](PROJECT_EXPLAINED.md) explain every file and query, and which file calls which.

---

## Requirements

| | |
|---|---|
| **Python** | 3.9 or newer |
| **Packages** | none. Only the standard library is used (`sqlite3`, `hashlib`, `http.server` …). **No `pip install`, no MySQL server.** |
| **Browser** | any modern browser, for the web app |

`data/college.db` is **not** in the repository. The app builds it automatically the first time it runs, from `sql/*.sql` plus generated sample data.

---

## How to run

### 1. Get the code

```bash
git clone https://github.com/thecodex110/DBMS-Project-Sam-5.git
cd DBMS-Project-Sam-5
```

Or download the ZIP from GitHub (**Code → Download ZIP**), extract it, and open a terminal inside the extracted folder.

### 2. Check Python

| OS | Command | If it is missing |
|---|---|---|
| **Windows** | `py --version` or `python --version` | Install from <https://www.python.org/downloads/> and tick **"Add python.exe to PATH"** during setup |
| **macOS** | `python3 --version` | Run `xcode-select --install`, or `brew install python`, or use the installer from python.org |
| **Linux** | `python3 --version` | Debian/Ubuntu: `sudo apt install python3`; Fedora: `sudo dnf install python3`; Arch: `sudo pacman -S python` |

### 3. Start the app

The commands are the same on every OS. Only the name of the Python command changes:

| What | Windows (PowerShell / CMD) | macOS / Linux |
|---|---|---|
| Terminal app | `py main.py` | `python3 main.py` |
| Web app | `py main.py --web` | `python3 main.py --web` |
| Web app on another port | `py main.py --web --port 9000` | `python3 main.py --web --port 9000` |
| Rebuild the database with fresh sample data | `py main.py --reset` | `python3 main.py --reset` |
| Write all lab queries to `sql/lab_assignments.sql` | `py main.py --export-sql` | `python3 main.py --export-sql` |
| Run the tests | `py -m unittest discover tests` | `python3 -m unittest discover tests` |

On Windows, `python` works instead of `py` if that is what your install provides.

For the **web app**, keep the terminal open and visit **<http://127.0.0.1:8000>** in a browser. Press `Ctrl + C` in the terminal to stop the server.

#### Windows notes

* Use **Windows Terminal** or PowerShell for the best colours and box drawing. The app switches the console to UTF-8 and ANSI colours by itself.
* If `py` / `python` opens the Microsoft Store, Python is not installed (or not on PATH). Install it from python.org with **"Add python.exe to PATH"** ticked, then open a new terminal.
* If Windows Firewall asks about Python when you start the web app, you can choose **Cancel**. The server only listens on `127.0.0.1` (this computer).

#### macOS / Linux notes

* If you see `Address already in use`, another program is on port 8000. Use `--port 9000`.
* To turn colours off: `NO_COLOR=1 python3 main.py`.

### 4. Log in

| Who | Where | Login |
|---|---|---|
| Admin | terminal + web | `admin` / `admin@123` |
| Teacher | terminal + web | `fac101` / `fac101@123` … `fac110` / `fac110@123` |
| Student | web only | roll number + date of birth, e.g. `23CS001` / `2005-03-14` (or `23CS003` / `2004-11-02`, a defaulter) |

The web login page also has demo buttons that fill these in.

---

## Environment variables (optional)

| Variable | Use | Windows PowerShell | macOS / Linux |
|---|---|---|---|
| `CAAMS_DB` | use a different database file | `$env:CAAMS_DB="C:\temp\test.db"; py main.py` | `CAAMS_DB=/tmp/test.db python3 main.py` |
| `NO_COLOR` | plain terminal output | `$env:NO_COLOR="1"; py main.py` | `NO_COLOR=1 python3 main.py` |

---

## What's inside

### Terminal app main menu

| # | Menu | What it does |
|---|---|---|
| 1 | Student management | add, search, update and delete students; phone numbers; enrollment |
| 2 | Faculty, subjects & departments | master data |
| 3 | Attendance | take attendance (one transaction per lecture), view it, correct it |
| 4 | Exams & results | marks, grades, SGPA |
| 5 | Defaulters & leaves | the 75% rule, "classes needed" (3T − 4P), leave approval |
| 6 | Reports & analytics | dashboard, charts |
| 7 | SQL console | run any SQL on the live database |
| 8 | Database administration | ER diagram, data dictionary, backup, CSV export, integrity check |

### Web app

| Login | Pages |
|---|---|
| Admin | overview dashboard, take attendance, register, leave & defaulters, students, results, SQL console (full access), audit log |
| Teacher | the same pages, but attendance and register only for their own subjects; the SQL console is read-only |
| Student | their own attendance per subject (with "attend the next N classes" advice), marks and SGPA, leave requests |

Every panel has an **SQL** button that shows the exact query behind it.

### Database objects ([`sql/`](sql))

| File | Contents |
|---|---|
| [`01_schema.sql`](sql/01_schema.sql) | tables with PK / FK / CHECK / UNIQUE constraints |
| [`02_views.sql`](sql/02_views.sql) | `v_student_profile`, `v_attendance_summary`, `v_defaulters`, `v_result_sheet`, `v_subject_report`, `v_dept_stats` |
| [`03_triggers.sql`](sql/03_triggers.sql) | validation triggers and audit-log triggers |
| [`04_indexes.sql`](sql/04_indexes.sql) | indexes used by the common queries |
| [`05_seed_base.sql`](sql/05_seed_base.sql) | departments, faculty, subjects, students, phones, enrollment |
| [`lab_assignments.sql`](sql/lab_assignments.sql) | every lab query in one file (`--export-sql` regenerates it) |

## Code layout

```
main.py                 entry point
caams/app.py            login, main menu, command-line options
caams/db/               connection helpers, database builder, password hashing
caams/ui/               terminal toolkit (tables, colours, prompts) and the menu loop
caams/modules/          the application menus
caams/labs/             DBMS concept labs: relational algebra, normalization, indexing, transactions
caams/web/server.py     web server and JSON API (standard library http.server)
caams/web/static/       web front end: HTML, CSS, JS (no build step)
sql/                    schema, views, triggers, indexes, seed data
tests/                  unittest suite
legacy/                 older versions (Express/MySQL web app, Node.js terminal app)
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `python3: command not found` (Windows) | use `py` or `python` |
| `ModuleNotFoundError: No module named 'caams'` | run the command from inside the project folder, where `main.py` is |
| Strange data, or you want a clean start | `py main.py --reset` / `python3 main.py --reset` |
| `database is locked` | close the other running copy of the app (terminal or web) and try again |
| Web page does not update after changing the code | refresh the page (`Ctrl + R` / `Cmd + R`) |
