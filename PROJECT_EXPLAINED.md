# 🧭 CAAMS: Har Menu Ka Poora Explanation (Hinglish)

Ye file **step by step** batati hai ki main menu ka har option (**1 se 14**) kya karta hai:

- **kaunsi code file** chalti hai, aur usme **kaunsa function**,
- aap **kya input** dete ho aur screen pe **kya output** aata hai,
- **andar kaunsa SQL** chalta hai, kaunsi **table / view / trigger** use hoti hai,
- ye **syllabus ke kis topic** ko dikhata hai.

> Links clickable hain. Jaise [students.py:42](caams/modules/students.py:42) pe click karoge to seedha us function pe pahunch jaoge.
>
> Database design ki poori theory (ER, normalization, viva) ke liye [GUIDE.md](GUIDE.md) dekho. Ye file **menus aur code** pe focus karti hai.

---

## 📑 Index

- [Part A: Project ka dhancha (sab menus ke peeche common cheezein)](#part-a-project-ka-dhancha)
- [Menu 1: Student management](#menu-1--student-management)
- [Menu 2: Faculty, subjects & departments](#menu-2--faculty-subjects--departments)
- [Menu 3: Attendance](#menu-3--attendance)
- [Menu 4: Exams & results](#menu-4--exams--results)
- [Menu 5: Defaulters & leaves](#menu-5--defaulters--leaves)
- [Menu 6: Reports & analytics](#menu-6--reports--analytics)
- [Menu 7: DBMS concepts tour](#menu-7--dbms-concepts-tour)
- [Menu 8: Relational algebra lab](#menu-8--relational-algebra-lab)
- [Menu 9: Lab assignments 1-4](#menu-9--lab-assignments-1-4)
- [Menu 10: Normalization lab](#menu-10--normalization-lab)
- [Menu 11: Indexing & hashing lab](#menu-11--indexing--hashing-lab)
- [Menu 12: Transactions & concurrency lab](#menu-12--transactions--concurrency-lab)
- [Menu 13: SQL console](#menu-13--sql-console)
- [Menu 14: Database administration](#menu-14--database-administration)
- [Part C: Kaunsi table kis menu mein use hoti hai](#part-c-kaunsi-table-kis-menu-mein-use-hoti-hai)

---

## Part A: Project ka dhancha

Kisi bhi menu ko samajhne se pehle ye 6 files samajh lo. **Har menu inhi ke upar chalta hai.**

### A1. [caams/app.py](caams/app.py): program ka darwaza (entry point)
`python3 main.py` likhte hi [main.py](main.py) isi file ka `main()` chalata hai.

| Function | Kya karta hai |
|---|---|
| [main()](caams/app.py:87) | 1) `init.ensure_database()`: DB nahi hai to bana deta hai. 2) `login()`. 3) Main menu (`run_menu`) dikhata hai jisme 14 options hain. Har option ka `action` kisi module ka `menu()` function hai. |
| [login()](caams/app.py:21) | CAAMS logo + username/password poochta hai. 3 galat try ke baad band. Sahi hua to `session.set(user)`. |
| [status_bar()](caams/app.py:38) | Main menu ke upar wali line: user, students, sessions, defaulters, pending leaves. Ek SQL mein 4 scalar subqueries. |

Main menu ka mapping (app.py ke andar):
```
1 → modules/students.py     8  → labs/relational_algebra.py
2 → modules/faculty.py      9  → modules/lab_assignments.py
3 → modules/attendance.py   10 → labs/normalization.py
4 → modules/results.py      11 → labs/indexing.py
5 → modules/defaulters.py   12 → labs/transactions.py
6 → modules/reports.py      13 → modules/sql_console.py
7 → labs/concepts.py        14 → modules/admin.py
```

### A2. [caams/db/connection.py](caams/db/connection.py): database se baat karne wala ekmatra raasta
**Koi bhi module seedha SQLite ko touch nahi karta.** Sab is file ke functions use karte hain:

| Function | Kab use hota hai | Return |
|---|---|---|
| [all_(sql, *params)](caams/db/connection.py:47) | SELECT jisme bahut rows aayein | rows ka array |
| [get(sql, *params)](caams/db/connection.py:51) | SELECT jisme ek row chahiye | ek object |
| [run(sql, *params)](caams/db/connection.py:55) | INSERT / UPDATE / DELETE | `Result(changes, last_insert_rowid)` |
| [exec_(sql)](caams/db/connection.py:71) | Poori SQL script (multiple statements) | — |
| [transaction(fn)](caams/db/connection.py:83) | `BEGIN` → fn() → `COMMIT`, error aaya to `ROLLBACK` | fn ka result |
| [run_sql_file(name)](caams/db/connection.py:95) | `sql/` folder ki file chalana | — |
| [open_()](caams/db/connection.py:34) | Connection kholta hai + `PRAGMA foreign_keys = ON` (warna SQLite FK check nahi karta!) | — |

`?` wale parameters = **prepared statements** = SQL injection se safe.

### A3. [caams/db/init.py](caams/db/init.py): database banane wala
| Function | Kya karta hai |
|---|---|
| [ensure_database()](caams/db/init.py:154) | `student` table hai? Nahi to `initialize()` |
| [initialize()](caams/db/init.py:145) | **Ek transaction** mein `sql/01_schema.sql` → `02_views.sql` → `03_triggers.sql` → `04_indexes.sql` → `05_seed_base.sql` chalata hai, phir `generate_live_data()`, phir `ANALYZE` |
| [generate_live_data()](caams/db/init.py:58) | **Aaj ki date se piche 15 hafte** ke lectures banata hai (har subject hafte mein 2 baar, lab 1 baar), har student ki attendance (kuch students "weak" hain taaki defaulters banein), leaves, exam marks (2.5% absent = NULL), aur login users. Random generator fixed seed (`mulberry32(2026)`) se hai, isliye har reset pe same data aata hai. |
| [reset_database()](caams/db/init.py:161) | DB file delete + `initialize()` |

### A4. [caams/db/auth.py](caams/db/auth.py): login security
- [hash_password()](caams/db/auth.py:15): random 16-byte salt + `PBKDF2-SHA256` hash (120000 rounds). Password kabhi plain text mein store nahi hota.
- [login()](caams/db/auth.py:32): `app_user` table se user nikalta hai, hash compare karta hai, `last_login` update karta hai.

### A5. [caams/ui/menu.py](caams/ui/menu.py): har menu ka engine
[run_menu()](caams/ui/menu.py:13) ek loop hai:
```
repeat:
   screen clear → title → options print (admin-only options faculty ko nahi dikhte)
   choice lo → 0 = wapas
   option ka action() chalao  ─┐
   error aaya? → friendly_error()  ← SQLite error ko readable banata hai, program crash nahi hota
   "Press Enter to continue"
```

### A6. [caams/ui/term.py](caams/ui/term.py): front end (dikhane aur input lene wala)
| Function | Kaam |
|---|---|
| [ask()](caams/ui/term.py:80), [ask_text()](caams/ui/term.py:100), [ask_int()](caams/ui/term.py:126), [confirm()](caams/ui/term.py:146), [pick()](caams/ui/term.py:153) | Input lena (default value, validation, list se choose) |
| [table()](caams/ui/term.py:252) | Rows ko box wali table mein print (NULL gray mein, numbers right-aligned) |
| [bar()](caams/ui/term.py:289) | `█████░░░ 82.5%` progress bar (≥75 green, ≥60 yellow, warna red) |
| [bar_chart()](caams/ui/term.py:301) | Horizontal bar chart |
| [print_sql()](caams/ui/term.py:327) | SQL ko color ke saath dikhana (keywords blue, strings green) |
| [box()](caams/ui/term.py:199), [header()](caams/ui/term.py:212) | Box aur screen title |

### A7. Logged-in user: [caams/session.py](caams/session.py)
`is_admin()` aur `faculty_id()` deta hai. Faculty ko sirf apne subjects dikhte hain, aur admin-only options (delete, reset…) chhup jaate hain.

---

# Part B: Har menu detail mein

> Numbering **admin login** ke hisaab se hai. Faculty login mein admin-only options nahi dikhte, isliye numbers thode khisak jaate hain.

---

## MENU 1 🎓 Student management
**File:** [caams/modules/students.py](caams/modules/students.py) · **Tables:** `student`, `student_phone`, `enrollment` · **View:** `v_student_profile`
**Syllabus:** SQL CRUD, composite/derived/multivalued attributes, transactions, ON DELETE CASCADE, triggers

Helper functions (dusre options inko use karte hain):
- [find_student()](caams/modules/students.py:29): roll no ya naam ka hissa lo. `WHERE roll_no = upper(?) OR full_name LIKE '%…%'`. Ek match mile to seedha wahi, zyada mile to list se choose karao. **Menu 4 aur 5 bhi ise use karte hain.**
- [pick_department()](caams/modules/students.py:24): department list se choose.

### 1.1 📋 List students → [list_students()](caams/modules/students.py:42)
- **Input:** dept (CS/IT/ENTC/MECH ya blank), year (blank = sab)
- **SQL:**
  ```sql
  SELECT roll_no, full_name, gender AS g, age, city, year, dept_id, phones
  FROM v_student_profile
  WHERE (? = '' OR dept_id = upper(?)) AND (? = '' OR year = CAST(? AS INTEGER))
  ORDER BY dept_id, year DESC, roll_no
  ```
- **Trick:** `? = '' OR …` ka matlab: filter blank hai to condition hamesha true ho jaati hai.
- **Output:** Table. `age` **derived attribute** hai (dob se calculate), `phones` **multivalued** hai (`group_concat`).

### 1.2 🔍 Search students → [search_students()](caams/modules/students.py:54)
- **Input:** koi bhi text, jaise `pune`
- **SQL:** `WHERE full_name LIKE ? OR city LIKE ? OR email LIKE ?` with `%pune%`
- **Concept:** pattern matching (`LIKE`, `%` wildcard)

### 1.3 👤 Student full profile → [student_profile()](caams/modules/students.py:65)
- **Input:** roll no / naam (jaise `aarav`)
- **Andar 4 queries:**
  1. `v_student_profile` → details box (dept, DOB, **age**, email, phones)
  2. `v_attendance_summary` → har subject ki attendance bar + "needs N more classes"
  3. `v_result_sheet` → marks + grade
  4. `leave_request` → leave history
- **Output example:**
  ```
  CS501  Database Management Systems  █████████████████░░░  86.7%  26+0/30
  ```
  `26+0/30` = 26 present + 0 approved leave, 30 lectures mein se.

### 1.4 ➕ Add new student → [add_student()](caams/modules/students.py:92)
- **Input:** department → year → roll no (auto-suggest, jaise `23CS011`) → first/last name → gender (M/F/O) → DOB → city → email (auto-suggest) → phones (comma se)
- **Andar (ek hi TRANSACTION):**
  ```sql
  INSERT INTO student (...) VALUES (...);                -- 1 row
  INSERT INTO student_phone (roll_no, phone) VALUES ...; -- har phone ki 1 row
  INSERT INTO enrollment (roll_no, subject_id)           -- INSERT ... SELECT
     SELECT ?, subject_id FROM subject WHERE dept_id = ? AND semester = ? * 2 - 1;
  ```
  Year 3 → semester 5 ke saare subjects mein auto-enroll ho jaata hai.
- **Constraints jo bachate hain:** gender `CHECK IN ('M','F','O')`, year `CHECK 1-4`, phone `CHECK 10 digits`, roll no duplicate → `PRIMARY KEY`, email duplicate → `UNIQUE`. Koi bhi fail hua to **poora transaction rollback** ho jaata hai, aadha student kabhi nahi banta.
- **Trigger:** `trg_audit_student_insert` → `audit_log` mein entry.

### 1.5 ✏️ Update student → [update_student()](caams/modules/students.py:127)
- **Input:** student, phir har field (Enter dabaya to purana value hi rehta hai)
- **SQL:** `UPDATE student SET first_name=?, last_name=?, city=?, email=?, year=? WHERE roll_no=?`
- **Trigger:** `trg_audit_student_update` purana aur naya value JSON mein `audit_log` mein likhta hai.
- Optional: naya phone number add (`INSERT INTO student_phone`).

### 1.6 📚 Enrol student in a subject → [manage_enrollment()](caams/modules/students.py:168)
- Current enrollments dikhata hai, phir sirf wo subjects jo abhi tak nahi liye:
  `WHERE subject_id NOT IN (SELECT subject_id FROM enrollment WHERE roll_no = ?)`
- **Concept:** M:N relationship (student ↔ subject) ka bridge table `enrollment`.

### 1.7 🗑️ Delete student *(sirf admin)* → [delete_student()](caams/modules/students.py:148)
- Pehle **impact** dikhata hai: kitni enrollments, attendance rows, marks, phones, leaves delete hongi (5 scalar subqueries).
- Confirm (`y`) → `DELETE FROM student WHERE roll_no = ?`
- **ON DELETE CASCADE** baaki sab child rows apne aap delete kar deta hai. Trigger `trg_audit_student_delete` log karta hai.

---

## MENU 2 🏫 Faculty, subjects & departments
**File:** [caams/modules/faculty.py](caams/modules/faculty.py) · **Tables:** `department`, `faculty`, `subject`, `teaches`, `app_user` · **Views:** `v_dept_stats`, `v_subject_report`
**Syllabus:** joins (inner/outer), aggregates, UPSERT, M:N relationship

### 2.1 🏢 Departments overview → [list_departments()](caams/modules/faculty.py:11)
- `SELECT * FROM v_dept_stats`: har dept ke students, faculty, avg salary, avg attendance (colored), defaulter students.
- View ke andar har column ek **scalar subquery** hai.

### 2.2 👨‍🏫 Faculty list with subjects → [list_faculty()](caams/modules/faculty.py:16)
```sql
SELECT f.faculty_id, f.name, f.designation, f.dept_id, f.salary,
       group_concat(t.subject_id, ', ') AS teaches
FROM faculty f LEFT JOIN teaches t ON t.faculty_id = f.faculty_id
GROUP BY f.faculty_id ORDER BY f.dept_id, f.salary DESC
```
- **LEFT JOIN kyun?** `FAC110 (Prof. Anjali Mehta)` koi subject nahi padhati. INNER JOIN use karte to wo list se gayab ho jaati. LEFT JOIN se wo dikhti hai, aur uske `teaches` column mein **NULL** aata hai.

### 2.3 📘 Subjects report → [list_subjects()](caams/modules/faculty.py:27)
- `v_subject_report`: subject, faculty, enrolled count, sessions, avg attendance, defaulters, avg marks %.

### 2.4 📊 Faculty workload → [workload()](caams/modules/faculty.py:89)
- 4 tables ka LEFT JOIN (faculty → teaches → subject → class_session) + `COUNT(DISTINCT)`, `SUM(credits)`.
- Output: table + **bar chart** (kisne kitne lectures liye).

### 2.5 ➕ Add faculty *(admin)* → [add_faculty()](caams/modules/faculty.py:34)
- **Input:** dept, ID (auto `FAC111`), naam, email, designation (list se), salary
- **Transaction:** `INSERT INTO faculty` + `INSERT INTO app_user` (login `fac111` / `fac111@123`, hashed)
- CHECK constraints: email format, designation list, salary > 0.

### 2.6 ➕ Add subject *(admin)* → [add_subject()](caams/modules/faculty.py:54)
- **Input:** dept, code (jaise `CS505`), naam, credits (1-6), semester (1-8), lab hai ya nahi
- `INSERT INTO subject`, phir optional auto-enroll:
  `INSERT INTO enrollment SELECT roll_no, ? FROM student WHERE dept_id = ? AND year*2-1 = ?`

### 2.7 🔗 Allocate subject to faculty *(admin)* → [allocate_subject()](caams/modules/faculty.py:72)
```sql
INSERT INTO teaches (subject_id, academic_year, faculty_id) VALUES (?, '2026-27', ?)
ON CONFLICT (subject_id, academic_year) DO UPDATE SET faculty_id = excluded.faculty_id
```
- **UPSERT** = row nahi hai to INSERT, hai to UPDATE. `PRIMARY KEY (subject_id, academic_year)` ki wajah se ek saal mein ek subject ka ek hi teacher ho sakta hai.

---

## MENU 3 📝 Attendance
**File:** [caams/modules/attendance.py](caams/modules/attendance.py) · **Tables:** `class_session`, `attendance`, `enrollment` · **View:** `v_attendance_summary`
**Triggers:** `trg_session_not_in_future`, `trg_attendance_must_be_enrolled`, `trg_audit_attendance_update`, `trg_audit_attendance_delete`
**Syllabus:** transactions (atomicity), triggers, joins, GROUP BY, CASCADE

Helpers:
- [my_subjects()](caams/modules/attendance.py:16): `WHERE ? IS NULL OR t.faculty_id = ?`. Admin (`faculty_id = None`) ko sab subjects, faculty ko sirf apne.
- [choose_session()](caams/modules/attendance.py:82): subject ke last 15 lectures (present/total ke saath) list karke ek choose karata hai.

### 3.1 ✅ Take attendance → [take_attendance()](caams/modules/attendance.py:31)
**Ye project ka sabse important feature hai.**

1. Subject choose karo, jaise `1` = CS501.
2. Date (Enter = aaj), time (`10:00`), topic.
3. **Roster** dikhta hai: har student ka serial no, roll, naam, aur ab tak ka attendance bar.
4. **Absent students** likho: serial number (`2, 5`), roll (`23CS009`), ya roll ka last part (`009`). Blank chhoda = sab present. `each` likha = ek-ek student ka P/A poochega.
5. Save:
   ```sql
   BEGIN;
   INSERT INTO class_session (subject_id, faculty_id, session_date, start_time, topic) VALUES (...);
   INSERT INTO attendance (session_id, roll_no, status) VALUES (?, ?, 'P' / 'A');   -- har student
   COMMIT;
   ```
6. Output: `✔ Session #346 saved: 7 present, 3 absent (1 transaction, 11 INSERTs).`

**Andar kya protection hai:**
- Future date diya → trigger `trg_session_not_in_future` → `RAISE(ABORT)` → poora rollback.
- Same subject + date + time dobara → `UNIQUE (subject_id, session_date, start_time)` error.
- Non-enrolled student → trigger `trg_attendance_must_be_enrolled`.
- **Atomicity:** beech mein kuch bhi fail ho to na session bachega na attendance. Aadha data kabhi nahi.

### 3.2 📄 View a session → [view_session()](caams/modules/attendance.py:93)
- Subject → session → `attendance JOIN student WHERE session_id = ?`
- `CASE status WHEN 'P' THEN 'Present' ELSE 'Absent' END`, aur Present green, Absent red dikhta hai.

### 3.3 🗓️ Attendance register (grid) → [register()](caams/modules/attendance.py:108)
- Last 12 lectures ki dates columns mein, students rows mein:
  ```
  Roll no  09/18 09/23 09/25 …   overall
  23CS001    P     P     A   …   █████████░  87.1%
  ```
- 3 queries (sessions, `v_attendance_summary`, saari attendance), phir Python mein **pivot** (rows → grid).

### 3.4 ✏️ Correct an attendance entry → [edit_record()](caams/modules/attendance.py:127)
- Subject → session → roll no → confirm → P↔A toggle
- `UPDATE attendance SET status = ?, marked_at = datetime('now') WHERE session_id = ? AND roll_no = ?`
- Turant dikhata hai ki trigger ne `audit_log` mein kya likha (`346/23CS001  P → A`). Isse **tamper-proof trail** banta hai, koi chupke se attendance nahi badal sakta.

### 3.5 📆 Day-wise report → [daily_report()](caams/modules/attendance.py:146)
- Date (default = last lecture date) → us din ke saare lectures, present, absent, %.
- `GROUP BY cs.session_id` + `SUM(a.status = 'P')`. SQLite mein `TRUE = 1`, isliye ye count deta hai.

### 3.6 🗑️ Delete a session *(admin)* → [delete_session()](caams/modules/attendance.py:159)
- `DELETE FROM class_session WHERE session_id = ?` → attendance rows **CASCADE** se delete, har delete trigger se log.

---

## MENU 4 🏆 Exams & results
**File:** [caams/modules/results.py](caams/modules/results.py) · **Table:** `exam_result` · **View:** `v_result_sheet`
**Syllabus:** NULL values, UPSERT, CASE, window functions, weighted aggregates

Exams: **Internal /20, MidSem /30, EndSem /50 = total 100.** `marks_obtained = NULL` matlab student exam mein **absent** tha.

### 4.1 ✍️ Enter / update marks → [enter_marks()](caams/modules/results.py:35)
- **Input:** subject → exam → har student ke marks. Enter = current value same. `ab` = absent (NULL).
- Validation: `0` se `max` ke beech ya `ab`.
- Sirf **badle hue** marks save hote hain, ek transaction mein:
  ```sql
  INSERT INTO exam_result (...) VALUES (...)
  ON CONFLICT (roll_no, subject_id, exam_type) DO UPDATE SET marks_obtained = excluded.marks_obtained
  ```
- **Composite FK** `(roll_no, subject_id) → enrollment`: non-enrolled student ke marks daal hi nahi sakte.
- Marks badle to trigger `trg_audit_marks_update`.

### 4.2 📑 Subject result sheet → [result_sheet()](caams/modules/results.py:66)
- `v_result_sheet` ke andar **pivot** hota hai:
  `MAX(CASE WHEN exam_type='Internal' THEN marks_obtained END) AS internal` (same midsem, endsem ke liye)
- Grade CASE se: ≥90 O, ≥80 A+, ≥70 A, ≥60 B+, ≥50 B, ≥40 C, warna F.
- Output: sheet + **grade distribution bar chart**.

### 4.3 🎓 Student marksheet + SGPA → [marksheet()](caams/modules/results.py:80)
- `SGPA = SUM(credits × grade_point) / SUM(credits)` (weighted average).

### 4.4 🥇 Subject toppers → [toppers()](caams/modules/results.py:93)
```sql
DENSE_RANK() OVER (PARTITION BY subject_id ORDER BY percentage DESC)
```
- Har subject ke top 3. **Window function** = group ke andar rank, bina rows ko merge kiye.

### 4.5 📈 Class SGPA ranking → [sgpa_ranking()](caams/modules/results.py:104)
- `GROUP BY roll_no`, `SUM(grade = 'F') AS backlogs` (red mein dikhta hai).

### 4.6 🔬 Attendance vs marks → [attendance_vs_marks()](caams/modules/results.py:115)
- Do views ka JOIN (`v_attendance_summary` + `v_result_sheet`), phir CASE se do group: Regular (≥75%) vs Defaulter.
- Result: regular students ke average marks zyada aate hain.

---

## MENU 5 ⚠️ Defaulters & leaves
**File:** [caams/modules/defaulters.py](caams/modules/defaulters.py) · **Tables:** `leave_request`, `defaulter_notice` · **Views:** `v_defaulters`, `v_attendance_summary`
**Syllabus:** views, INSERT…SELECT, CHECK, DEFAULT, triggers

**75% rule ka math** (view `v_attendance_summary` mein):
- `raw_pct = present / total × 100`
- `adjusted_pct = (present + approved leave wale absent din) / total × 100`
- `classes_needed = max(0, 3T − 4P)`. Ye (P + x)/(T + x) ≥ 0.75 solve karke aata hai.
- Risk: < 50 **Critical**, < 65 **High**, < 75 **Moderate**.

### 5.1 🚨 View defaulter list → [view_defaulters()](caams/modules/defaulters.py:16)
- Dept filter → `SELECT … FROM v_defaulters ORDER BY adjusted_pct`
- Columns: `attended` (jaise `16+0/30`), raw %, adjusted %, classes needed, risk (colored) + risk bar chart.

### 5.2 📨 Generate defaulter notices → [generate_notices()](caams/modules/defaulters.py:31)
```sql
INSERT INTO defaulter_notice (roll_no, subject_id, attendance_pct)
SELECT roll_no, subject_id, adjusted_pct FROM v_defaulters WHERE true
ON CONFLICT (roll_no, subject_id, issued_on) DO NOTHING
```
- Ek command se saare notices ban jaate hain. `UNIQUE(roll_no, subject_id, issued_on)` + `DO NOTHING` ki wajah se ek hi din dobara chalane pe duplicate notice nahi banta.

### 5.3 📬 View / update notices → [manage_notices()](caams/modules/defaulters.py:47)
- Notices list, phir id do aur status `Acknowledged` / `Cleared` choose karo (CHECK constraint sirf ye 3 values allow karta hai).

### 5.4 📝 Apply leave → [apply_leave()](caams/modules/defaulters.py:65)
- Student, from date, to date, type (Medical/Sports/Event/Personal), reason
- `INSERT INTO leave_request`, `status` **DEFAULT 'Pending'**. `CHECK (from_date <= to_date)` ulti dates rokta hai.

### 5.5 ✅ Approve / reject leaves → [review_leaves()](caams/modules/defaulters.py:79)
- Pending leaves list → choose → Approved/Rejected
- `UPDATE leave_request SET status = ?, reviewed_by = ?`
- **Before / after table**: approve karte hi view `adjusted_pct` badha deta hai (jaise 80 → 83.33), kyunki view har baar fresh calculate hota hai.
- Trigger `trg_leave_review_once`: ek baar decide hone ke baad status dobara badal nahi sakte. `trg_audit_leave_review` log karta hai.

### 5.6 📜 Leave history → [leave_history()](caams/modules/defaulters.py:102)
- `LEFT JOIN faculty` (pending leave ka reviewer NULL hai, isliye LEFT JOIN), status colored.

---

## MENU 6 📈 Reports & analytics
**File:** [caams/modules/reports.py](caams/modules/reports.py) · **Syllabus:** aggregate functions, complex queries, nested/correlated subqueries, window functions

| Option | Function | Kya dikhata hai | SQL concept |
|---|---|---|---|
| 6.1 📊 Dashboard | [dashboard()](caams/modules/reports.py:11) | Students, faculty, subjects, sessions, overall attendance bar, defaulters, pending leaves; dept-wise aur subject-wise bars | Ek SELECT mein **8 scalar subqueries** |
| 6.2 📉 Weekly trend | [weekly_trend()](caams/modules/reports.py:37) | Har week ka attendance % bar | `strftime('%Y-W%W', date)` + GROUP BY |
| 6.3 📅 Weekday analysis | [weekday_analysis()](caams/modules/reports.py:50) | Monday–Friday mein kis din attendance kam hai | `CASE strftime('%w')` + GROUP BY |
| 6.4 💯 Perfect attendance | [perfect_attendance()](caams/modules/reports.py:65) | Jo subject mein ek bhi din absent nahi | `NOT EXISTS (… status = 'A')` |
| 6.5 ⬇️ Below dept average | [below_dept_average()](caams/modules/reports.py:79) | Jinka % apne department ke average se kam | **Correlated subquery** in `HAVING` (inner query outer row ka `dept_id` use karti hai) |
| 6.6 🔁 Absence streaks | [streaks()](caams/modules/reports.py:92) | Lagatar 3+ lectures absent | 2 `ROW_NUMBER()` ka difference = same group ("gaps & islands") |
| 6.7 🏙️ City / gender | [city_gender()](caams/modules/reports.py:108) | City-wise male/female (2+ students wali cities) | `GROUP BY city HAVING COUNT(*) >= 2` |

Har report pe pehle SQL print hota hai, phir result. Viva mein dikhane ke liye best hai.

---

## MENU 7 📚 DBMS concepts tour
**File:** [caams/labs/concepts.py](caams/labs/concepts.py) · **Syllabus Unit 1:** Introduction (+ self-study network model)

| Option | Function | Kya samjhata hai |
|---|---|---|
| 7.1 🎯 Purpose of DB systems | [purpose()](caams/labs/concepts.py:10) | File system ki 7 problems (redundancy, access, integrity, atomicity, concurrency, security, isolation) aur CAAMS mein har ek ka solution |
| 7.2 🧅 Views of data | [levels()](caams/labs/concepts.py:24) | **3 levels live:** view (`v_student_profile`), logical (`student` table), physical (`sqlite_master` ka B-tree root page, page size). Physical aur logical data independence. |
| 7.3 🗣️ Database languages | [languages()](caams/labs/concepts.py:46) | DDL / DML / TCL / DCL: example + project mein kis file mein use hua |
| 7.4 🏗️ DBMS architecture | [architecture()](caams/labs/concepts.py:57) | Diagram: Users → Application (`app.py`, modules) → Query processor → Storage manager → Disk. Saath mein `sqlite_stat1` (optimizer statistics, `ANALYZE` se bane). |
| 7.5 🗂️ Types of databases | [db_types()](caams/labs/concepts.py:85) | Relational, hierarchical, network, OO, document, key-value, column, graph, distributed, embedded: examples ke saath |
| 7.6 🕸️ Network model | [network_model()](caams/labs/concepts.py:100) | Humara department→student data CODASYL owner-member sets mein, aur M:N ke liye link record. Pointers vs foreign keys. |

Ye menu sirf **padhne / dikhane** ke liye hai. Koi data change nahi hota.

---

## MENU 8 🔣 Relational algebra lab
**File:** [caams/labs/relational_algebra.py](caams/labs/relational_algebra.py) · **Syllabus Unit 3:** relational algebra (fundamental, additional, extended), null values, modification

### Kaise kaam karta hai (sabse important baat)
1. [load()](caams/labs/relational_algebra.py:16): DB se table ke tuples Python mein laata hai → `{'name', 'cols', 'rows'}` dict (ek "relation").
2. Object **`RA`** (line 23–77) mein **har operator khud likha gaya hai**: `select`, `project`, `rename`, `union`, `intersect`, `minus`, `product`, `natural_join`, `theta_join`, `left_outer_join`, `divide`, `aggregate`.
3. [show()](caams/labs/relational_algebra.py:125): RA expression (magenta), result table, **equivalent SQL**. Phir SQL bhi chalata hai aur check karta hai: `✔ SQL returned the same N tuple(s)`.

Iska fayda: dikhta hai ki **SQL andar se relational algebra hi hai**.

| Option | Function | Input | Kya hota hai |
|---|---|---|---|
| 8.1 σ Selection | [selection()](caams/labs/relational_algebra.py:194) | table + condition jaise `year = 3 AND dept_id = 'CS'` | [parse_predicate()](caams/labs/relational_algebra.py:167) condition ko JS function + SQL `WHERE` + RA notation (`year=3 ∧ dept_id='CS'`) mein badalta hai. Ops: `= != <> < > <= >=`, `AND` |
| 8.2 π Projection | [projection()](caams/labs/relational_algebra.py:209) | table + columns (jaise `city`) | Duplicate hata deta hai. Dikhata hai "28 tuples in → 13 out", kyunki projection ek SET operation hai. SQL = `SELECT DISTINCT`. |
| 8.3 ∪ ∩ − | [set_ops()](caams/labs/relational_algebra.py:224) | — | A = CS 3rd year roll nos, B = defaulter roll nos. A∪B, A∩B, A−B (union-compatible schemas). SQL: `UNION / INTERSECT / EXCEPT` |
| 8.4 × Product | [product()](caams/labs/relational_algebra.py:69) | — | department (4) × subject (10) = **40 tuples**. Phir σ(dept_id equal) lagao to wahi **join** ban jaata hai. |
| 8.5 ⋈ ⟕ Joins | [joins()](caams/labs/relational_algebra.py:249) | — | faculty ⋈ department (common column `dept_id` auto-match). faculty ⟕ teaches: FAC110 ke saath **NULL** subject. |
| 8.6 ρ + θ-join | [theta_rename()](caams/labs/relational_algebra.py:263) | — | Self join ke liye rename zaroori hai: ρF1(faculty), ρF2(faculty), condition `F1.dept = F2.dept ∧ F1.salary < F2.salary` |
| 8.7 ÷ Division | [division()](caams/labs/relational_algebra.py:274) | — | "**Har** DBMS lecture mein present" aur "**saare** exams diye". SQL mein ÷ nahi hai, isliye `NOT EXISTS … NOT EXISTS` (for all = not exists not). |
| 8.8 𝒢 Aggregation | [aggregation()](caams/labs/relational_algebra.py:298) | — | `dept_id 𝒢 count, avg, max (faculty)`; generalized projection `salary*12`; NULL ignore hote dikhte hain |
| 8.9 ← Modification | [modification()](caams/labs/relational_algebra.py:312) | — | Insert = `r ← r ∪ E`, delete = `r ← r − σ(…)`, update = generalized projection. **Sirf memory copy pe**, asli DB safe rehta hai. |
| 8.10 ∅ NULLs | [nulls()](caams/labs/relational_algebra.py:325) | — | `NULL = NULL` → NULL (unknown). `marks > 10` + `NOT(marks > 10)` ≠ total, kyunki NULL rows dono mein nahi aati. Ye **3-valued logic** hai. |

---

## MENU 9 🧪 Lab assignments 1-4
**File:** [caams/modules/lab_assignments.py](caams/modules/lab_assignments.py) · **Syllabus:** Laboratory assignments 1, 2a, 2b, 3, 4

### Kaise bana hai
- Array **`ASSIGNMENTS`** ([lab_assignments.py:14](caams/modules/lab_assignments.py:14)) mein saare questions **data** ki tarah likhe hain: `{'q': 'question', 'sql': '…'}` ya `{'q': …, 'steps': [...]}`.
- [run_statement()](caams/modules/lab_assignments.py:408): SQL print karta hai. SELECT ho to table dikhata hai, warna "N rows affected". `expect_error` wale steps mein error aana **sahi** maana jaata hai (`✔ Rejected as expected`).
- [run_question()](caams/modules/lab_assignments.py:429): ek question chalata hai. UPDATE/DELETE wale questions **SAVEPOINT** mein chalte hain, phir **ROLLBACK TO**. Data kabhi kharab nahi hota.
- [open_assignment()](caams/modules/lab_assignments.py:447): question list dikhata hai. Assignment 1/2a/2b mein number ya `a` (all). Assignment 3/4 poore sandbox mein step by step.
- [export_sql()](caams/modules/lab_assignments.py:474): sab kuch `sql/lab_assignments.sql` mein likhta hai.

| Option | Assignment | Qs | Kya-kya cover hai |
|---|---|---|---|
| 9.1 | **Assignment 1: Basic SQL** | 13 | Saare students; CS 3rd year (`WHERE AND`); salary > 1 lakh (`ORDER BY DESC`); naam 'A' se (`LIKE 'A%'`); 2005 ki pehli chhamahi (`BETWEEN`); cities (`DISTINCT`); Pune/Mumbai/Delhi (`IN`); sem-5 4-credit subjects; faculty + dept (`JOIN`); annual salary (`salary*12 AS`); `upper()`, `length()`; absent exams (`IS NULL`); 5 youngest (`LIMIT`) |
| 9.2 | **Assignment 2(a): Aggregates** | 11 | Dept-wise count; avg/min/max salary; `HAVING COUNT(*) > 4`; subject-wise sessions; gender × dept (2-column GROUP BY); credits per sem; avg marks per exam; **COUNT(*) vs COUNT(col)** (NULL); month-wise lectures; DBMS attendance %; `HAVING AVG(salary) > 80000` |
| 9.3 | **Assignment 2(b): Nested & updates** | 15 | `> (SELECT AVG)`; `IN` (Dr. Ramesh ke students); `NOT IN` (FAC110); `NOT EXISTS` (kabhi absent nahi); max students wala dept; correlated (har subject ka topper); `> ALL` = `> MAX`; derived table; `INTERSECT`; `EXCEPT`; CTE + `RANK()`; **UPDATE** 10% raise (subquery); **UPDATE** bonus marks `MIN(marks+2, max)`; **UPDATE** with CASE (promotion); **DELETE** with subquery |
| 9.4 | **Assignment 3: DDL & DML** (hostel) | 9 | `CREATE TABLE hostel`, `room` (composite PK, FK); multi-row `INSERT`; `ALTER TABLE ADD COLUMN` + UPDATE; `allotment` + `INSERT…SELECT`; `RENAME COLUMN`, `RENAME TO`; UPDATE/DELETE; `CREATE VIEW`; `DROP VIEW/TABLE`. **End mein sab rollback.** |
| 9.5 | **Assignment 4: Schema & constraints** (library) | 7 | `lib_book` (PK, CHECK length=13, NOT NULL, DEFAULT, CHECK IN); `lib_member` (FK CASCADE, UNIQUE, CHECK range); `lib_issue` (table-level CHECK, FK RESTRICT); valid inserts; **10 galat inserts jo DB reject karta hai** (duplicate PK, short ISBN, NULL title, negative copies, wrong category, missing FK, duplicate UNIQUE, out-of-range, due < issue, RESTRICT delete); CASCADE delete demo; `pragma_foreign_key_list` |
| 9.6 | Export | — | `sql/lab_assignments.sql` banata hai (printout / submission ke liye) |

---

## MENU 10 🧩 Normalization lab
**Files:** UI = [caams/labs/normalization.py](caams/labs/normalization.py), algorithms = [caams/labs/algorithms/fd.py](caams/labs/algorithms/fd.py)
**Syllabus Unit 4:** functional dependencies, closure, keys, 1NF → 2NF → 3NF → BCNF, decomposition (+ self-study MVD)

### Input kaise dena hai
- Har option pehle [get_input()](caams/labs/normalization.py:35) chalata hai: **6 presets** ya apna relation.
  1. **Humare project ki attendance sheet** (11 columns, un-normalized). Isi se humari tables bani hain.
  2. Humari exam marks sheet
  3. Silberschatz `R(A,B,C,D,E)`: `A→BC; CD→E; B→D; E→A`
  4. `R(A,B,C)`: `AB→C; C→B` (BCNF hai par dependency preserve nahi hoti)
  5. EMP_PROJ (2NF violation ka classic example)
  6. `A→B; B→C; C→D` (transitive)
  7. ✍️ Apna khud ka
- **Format:** attributes `ABCDE` ya `roll_no, name, dept`. FDs `A -> BC; CD -> E` (`;` se alag).
- [parse_relation()](caams/labs/algorithms/fd.py:58) aur [parse_fds()](caams/labs/algorithms/fd.py:66) text ko arrays mein badalte hain. Galat attribute diya to error.

### 10.1 🔬 Full analysis + decomposition → [full_analysis()](caams/labs/normalization.py:54)
Screen pe **5 steps** aate hain:

| Step | Kya dikhta hai | Algorithm (fd.py) |
|---|---|---|
| 1 | Har FD ke LHS ka closure, jaise `{A}⁺ = {A,B,C,D,E} ← superkey` | [closure()](caams/labs/algorithms/fd.py:82): jab tak koi FD apply ho sake, RHS add karte raho |
| 2 | 🔑 **Candidate keys**, prime / non-prime attributes | [candidate_keys()](caams/labs/algorithms/fd.py:100): jo attribute kisi RHS mein nahi aata wo har key mein hoga (core). Phir core + chhote subsets try karo, aur sirf minimal superkeys rakho. |
| 3 | **Canonical (minimal) cover** | [minimal_cover()](caams/labs/algorithms/fd.py:116): RHS single karo → extraneous LHS attributes hatao → redundant FDs hatao |
| 4 | 1NF ✔ / 2NF / 3NF / BCNF har ek ✔ ya ✖ **with reason** (partial dependency, transitive, LHS not superkey) + **highest NF badge** | [analyze()](caams/labs/algorithms/fd.py:154) |
| 5a | **3NF synthesis** decomposition + lossless? + dependency preserving? | [synthesis_3nf()](caams/labs/algorithms/fd.py:194) |
| 5b | **BCNF decomposition** (kis FD pe split hua, har nayi table ki FDs) + checks | [bcnf_decompose()](caams/labs/algorithms/fd.py:211), [project_fds()](caams/labs/algorithms/fd.py:185) |

Checks: [lossless_chase()](caams/labs/algorithms/fd.py:237) (chase / tableau test) aur [dependency_preserved()](caams/labs/algorithms/fd.py:262).

**Preset 1 ka result** (viva ke liye sabse useful): key `{roll_no, session_id}`, highest NF = **1NF**. Partial dependencies (`roll_no → student_name`) aur transitive dependencies (`dept_id → dept_name`) dikhti hain. Decomposition ke baad wahi tables bante hain jo humare `sql/01_schema.sql` mein hain.

### 10.2 ➕ Attribute closure X⁺ → [closure_calc()](caams/labs/normalization.py:125)
- X do (jaise `A`). Har step dikhta hai: `using A → BC ⇒ {A,B,C}`, `using B → D ⇒ {A,B,C,D}` … aur end mein superkey hai ya nahi.

### 10.3 🧪 Test MY decomposition → [decomposition_check()](caams/labs/normalization.py:145)
- Apna decomposition do, `|` se alag: `AB | BC` ya `roll_no,name | roll_no,dept`.
- **Chase tableau** table dikhti hai (`a` = known, `b1/b2` = unknown). Agar koi row poori `a` ban jaaye to **lossless**. Saath mein dependency preserving check.

### 10.4 ↠ Multivalued dependencies & 4NF → [mvd_note()](caams/labs/normalization.py:172)
- `roll_no ↠ phone` aur `roll_no ↠ subject_id` independent hain. Ek table mein rakhte to 2 phones × 4 subjects = 8 rows (redundancy). Isliye humne `student_phone` aur `enrollment` alag rakhi hain = **4NF**.

---

## MENU 11 🌳 Indexing & hashing lab
**Files:** UI = [caams/labs/indexing.py](caams/labs/indexing.py), structures = [caams/labs/algorithms/index_structures.py](caams/labs/algorithms/index_structures.py)
**Syllabus Unit 5:** ordered indices, B+ tree, static & dynamic hashing (+ self-study bitmap, B-tree)

| Option | Function | Input | Output / andar kya ho raha hai |
|---|---|---|---|
| 11.1 🌳 B+ tree | [bplus()](caams/labs/indexing.py:36) → class [BPlusTree](caams/labs/algorithms/index_structures.py:38) | Order n (3-6), keys (apne / textbook names / roll numbers / 1-20) | Har insert ke baad tree print (root, levels, leaves `→` se linked). Split messages: "leaf overflow → split, **copy up** 12", "internal overflow → **push up**". End mein search (`12` → node path) aur range (`5..20` → leaf chain pe walk). [insert()](caams/labs/algorithms/index_structures.py:76), [insert_in_parent()](caams/labs/algorithms/index_structures.py:98), [range()](caams/labs/algorithms/index_structures.py:62) |
| 11.2 🪣 Static hashing | [static_hash()](caams/labs/indexing.py:76) → [StaticHash](caams/labs/algorithms/index_structures.py:140) | Buckets N, capacity, keys | `h(K) = K mod N`. Bucket full hua to **overflow page chain**. Search mein kitne pages padhne pade. |
| 11.3 📂 Extendible hashing | [extendible()](caams/labs/indexing.py:98) → [ExtendibleHash](caams/labs/algorithms/index_structures.py:176) | Capacity, keys | Har key ka binary, bucket split, **directory doubling** (global depth badhta hai), final directory (`0101 → B5 (local depth 4)`) |
| 11.4 🧮 Bitmap index | [bitmap()](caams/labs/indexing.py:119) → [bitmap_index()](caams/labs/algorithms/index_structures.py:219) | — | Real `student` table pe `gender=F`, `year=3`, `dept_id=CS` ke 0/1 bitmaps. Query = **bitwise AND** → matching roll nos. |
| 11.5 🔍 EXPLAIN QUERY PLAN | [explain_plans()](caams/labs/indexing.py:140) | — | 6 asli queries: PK lookup, secondary index, `NOT INDEXED` (index band), composite index, `lower(col)` (index nahi lagta), range scan. **SEARCH** (green) = index, **SCAN** (red) = poori table. Har query 300 baar chala ke avg µs. |
| 11.6 🏎️ Benchmark | [benchmark()](caams/labs/indexing.py:166) | Rows (default 200000) | `WITH RECURSIVE` se TEMP table mein 2 lakh rows → bina index time → `CREATE INDEX` → index ke saath time → **speed-up ~150×** + B+ tree height estimate. End mein temp table drop. |
| 11.7 📑 List indexes | [list_indexes()](caams/labs/indexing.py:198) | — | DB ke saare indexes: PRIMARY KEY / UNIQUE (automatic) ya CREATE INDEX (humare 7), columns ke saath |

---

## MENU 12 🔐 Transactions & concurrency lab
**Files:** UI = [caams/labs/transactions.py](caams/labs/transactions.py), algorithms = [caams/labs/algorithms/concurrency.py](caams/labs/algorithms/concurrency.py)
**Syllabus Unit 6:** transactions, states, serializability, recoverability, isolation, locking, timestamps, validation, deadlock, recovery (+ self-study multiple granularity, ARIES)

### Part A: asli SQLite transactions
Temporary table `lab_account` ([setup_accounts()](caams/labs/transactions.py:15)): A101 = ₹5000, B202 = ₹20000. `CHECK (balance >= 0)`. Har demo ke end mein table drop ho jaati hai.

| Option | Function | Kya hota hai |
|---|---|---|
| 12.1 🏦 ACID demo | [acid_demo()](caams/labs/transactions.py:53) + [transfer()](caams/labs/transactions.py:34) | 3 transfers: **(1)** ₹1500 → COMMIT ✔ **(2)** ₹9999 → CHECK fail → ROLLBACK **(3)** ₹1000, debit ke baad "power failure" → ROLLBACK. Har step pe state print hoti hai: ACTIVE → PARTIALLY COMMITTED → COMMITTED, ya FAILED → ABORTED. `total_in_system` hamesha ₹25000 rehta hai = **consistency**. |
| 12.2 📍 Savepoints | [savepoint_demo()](caams/labs/transactions.py:73) | `BEGIN` → −500 → `SAVEPOINT` → −700 (galti) → `ROLLBACK TO` → `COMMIT`. Sirf −700 undo hota hai. |
| 12.3 🔄 State diagram | [states_diagram()](caams/labs/transactions.py:93) | Active / Partially committed / Committed / Failed / Aborted ka ASCII diagram |
| 12.4 👥 Isolation & locking | [isolation_demo()](caams/labs/transactions.py:113) | **Do asli connections** A aur B. A update karta hai (commit nahi) → B ko **purana** value dikhta hai (no dirty read). B write lock maangta hai → `database is locked`. A commit → B ko naya value. Teesra connection C → durability. |

### Part B: simulators (schedule type karo ya preset chuno)
**Schedule format:** `R1(A) W2(B) C1 A2` (R = read, W = write, C = commit, A = abort). [parse_schedule()](caams/labs/algorithms/concurrency.py:18) ise parse karta hai. [draw_schedule()](caams/labs/transactions.py:179) T1, T2… columns mein time-wise grid banata hai.

**8 presets** ready hain: serializable, lost update, blind writes, non-recoverable, cascading rollback, deadlock, timestamp conflict, Thomas rule.

| Option | Function (UI → algorithm) | Output |
|---|---|---|
| 12.5 🧮 Schedule analyser | [analyze_schedule()](caams/labs/transactions.py:188) → [conflict_serializable()](caams/labs/algorithms/concurrency.py:98), [view_serializable()](caams/labs/algorithms/concurrency.py:118), [recoverability()](caams/labs/algorithms/concurrency.py:132) | Conflicting pairs (`W1(A) before R2(A) ⇒ T1 → T2`), **precedence graph** edges, cycle → NOT serializable, ya **serial order** (topological sort). View serializability (saare serial orders try karta hai). Recoverable / cascadeless / strict, har ek ka reason. |
| 12.6 🔒 2PL + deadlock | [two_pl()](caams/labs/transactions.py:225) → [simulate_2pl()](caams/labs/algorithms/concurrency.py:175) | Strict 2PL step table: `grant S-lock`, `upgrade S→X`, `WAIT`, `DEADLOCK! cycle T1 → T2 → T1, victim T2`, `COMMIT release A,B`. 3 schemes: **detection** (wait-for graph), **wait-die**, **wound-wait**. |
| 12.7 ⏱️ Timestamp ordering | [timestamp_ordering()](caams/labs/transactions.py:245) → [simulate_timestamp()](caams/labs/algorithms/concurrency.py:295) | Har op ke liye TS, R-TS, W-TS, decision (OK / REJECT → rollback). **Thomas' write rule** on karo to obsolete write ignore hota hai. |
| 12.8 ✅ Validation | [validation()](caams/labs/transactions.py:259) → [simulate_validation()](caams/labs/algorithms/concurrency.py:334) | Har transaction ka read set, write set, VALID ya FAIL with reason (`WS(T1) ∩ RS(T2) = {A}`) |
| 12.9 🧱 Multiple granularity | [granularity()](caams/labs/transactions.py:268) | IS/IX/S/SIX/X **compatibility matrix**, DB → table → row tree, 3 transactions: T1 row pe X (IX upar), T2 doosri row read (GRANT), T3 poori table read → **WAIT** (IX se conflict) |
| 12.10 🚑 Crash recovery | [recovery()](caams/labs/transactions.py:309) → [parse_log()](caams/labs/algorithms/concurrency.py:369), [recover()](caams/labs/algorithms/concurrency.py:399) | Log (`<T1 start>`, `<T1, A, 1000, 950>`, `<checkpoint T1>` …) → 💥 CRASH → winners/losers → **REDO** (checkpoint se) → **UNDO** (losers, peeche se) → values table (crash / redo ke baad / final) → compensation log records. Ye **ARIES** ka idea hai. |

---

## MENU 13 💻 SQL console
**File:** [caams/modules/sql_console.py](caams/modules/sql_console.py)

- [console_loop()](caams/modules/sql_console.py:76): `sql>` prompt. Lines jodta rehta hai jab tak `;` na aaye (multi-line SQL). `.` se shuru hone wali line = command.
- [run_sql()](caams/modules/sql_console.py:25): SELECT/WITH/PRAGMA/EXPLAIN → table (max 100 rows). Baaki → "N rows affected". Time ms mein. **Faculty ke liye read-only.**
- [dot_command()](caams/modules/sql_console.py:45): `.tables`, `.schema X`, `.desc X`, `.indexes`, `.plan …`, `.begin/.commit/.rollback`, `.help`, `.exit`
- Exit pe transaction khula ho to auto `ROLLBACK`.

## MENU 14 🗄️ Database administration
**File:** [caams/modules/admin.py](caams/modules/admin.py)

| Option | Function | Kya karta hai |
|---|---|---|
| 14.1 ER diagram | [show_er()](caams/modules/admin.py:48) | ASCII ER diagram + 8 relationships ki cardinality table |
| 14.2 Data dictionary | [data_dictionary()](caams/modules/admin.py:72) | Table choose → CREATE SQL, columns, FKs (on delete/update), indexes, triggers (`sqlite_master` + pragmas) |
| 14.3 Browse rows | [browse()](caams/modules/admin.py:89) | 20-20 rows ke pages (`LIMIT 20 OFFSET n`) |
| 14.4 Audit log | [audit_log()](caams/modules/admin.py:105) | Triggers ki likhi last 40 entries |
| 14.5 Export CSV | [export_csv()](caams/modules/admin.py:125) | `exports/<table>_<date>.csv` (Excel mein khulti hai) |
| 14.6 Backup | [backup()](caams/modules/admin.py:138) | `VACUUM INTO 'backups/college_<time>.db'` |
| 14.7 Statistics | [stats()](caams/modules/admin.py:147) | Rows per table, pages × size, objects count |
| 14.8 Integrity | [integrity()](caams/modules/admin.py:165) | `PRAGMA integrity_check` + `foreign_key_check` |
| 14.9 Password | [change_password()](caams/modules/admin.py:174) | Purana verify → naya salt + hash |
| 14.10 Accounts *(admin)* | [users()](caams/modules/admin.py:185) | `app_user` list (sirf hash ka prefix) |
| 14.11 Reset *(admin)* | [reset()](caams/modules/admin.py:191) | `init.reset_database()`: sab delete + rebuild |

---

## Part C: Kaunsi table kis menu mein use hoti hai

| Table / View | Bani kahan | Kaun padhta hai (R) / likhta hai (W) |
|---|---|---|
| `department` | 01_schema, 05_seed | R: 1, 2, 6, 8 |
| `faculty` | 01_schema, 05_seed | R: 2, 3, 8, 9 · W: 2.5 |
| `student` | 01_schema, 05_seed | R: sab · W: 1.4, 1.5, 1.7 |
| `student_phone` | 01_schema, 05_seed | R: 1 · W: 1.4, 1.5 |
| `subject`, `teaches` | 01_schema, 05_seed | R: 2, 3, 4 · W: 2.6, 2.7 |
| `enrollment` | 05_seed (INSERT…SELECT) | R: 1, 3, 4 · W: 1.4, 1.6, 2.6 |
| `class_session` | init.py | R: 3, 6, 8, 11 · W: 3.1, 3.6 |
| `attendance` | init.py | R: 3, 5, 6, 8, 11 · W: 3.1, 3.4, 3.6 |
| `leave_request` | init.py | R: 1.3, 5 · W: 5.4, 5.5 |
| `exam_result` | init.py | R: 4, 8, 9 · W: 4.1 |
| `defaulter_notice` | — | W: 5.2, 5.3 |
| `app_user` | init.py | R: login, 14 · W: 2.5, 14.9 |
| `audit_log` | sirf triggers | R: 3.4, 14.4 |
| `v_attendance_summary` / `v_defaulters` | 02_views | 1.3, 3, 5, 6, app status bar |
| `v_result_sheet` | 02_views | 1.3, 4, 9 |
| `v_student_profile`, `v_subject_report`, `v_dept_stats` | 02_views | 1, 2, 6 |

---

### ✅ Ek line mein yaad rakhne ke liye
**`app.py` (menu) → `ui/menu.py` (loop) → `modules/*` ya `labs/*` (logic + SQL) → `db/connection.py` (all_/get/run/transaction) → SQLite (`data/college.db`).** Table, view, trigger aur index ki definitions `sql/` folder mein hain, aur pure algorithms `labs/algorithms/` mein.
