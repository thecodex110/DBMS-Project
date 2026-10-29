-- ==========================================================================
--  LAB ASSIGNMENTS 1-4  (auto-generated from caams/modules/lab_assignments.py)
--  Run on the CAAMS database:  sqlite3 data/college.db < sql/lab_assignments.sql
-- ==========================================================================

-- ##########  Assignment 1 : Basic SQL statements  ##########

-- Q1.1  List every student with roll no, full name, department and year.
SELECT roll_no, first_name || ' ' || last_name AS full_name, dept_id, year
FROM student;

-- Q1.2  Show third-year students of Computer Engineering (dept CS).
SELECT roll_no, first_name, last_name
FROM student
WHERE dept_id = 'CS' AND year = 3;

-- Q1.3  Faculty earning more than 1,00,000 per month, highest first.
SELECT name, designation, salary
FROM faculty
WHERE salary > 100000
ORDER BY salary DESC;

-- Q1.4  Students whose first name starts with 'A'.
SELECT roll_no, first_name, last_name
FROM student
WHERE first_name LIKE 'A%';

-- Q1.5  Students born in the first half of 2005.
SELECT roll_no, first_name, dob
FROM student
WHERE dob BETWEEN '2005-01-01' AND '2005-06-30'
ORDER BY dob;

-- Q1.6  Distinct cities our students come from.
SELECT DISTINCT city
FROM student
ORDER BY city;

-- Q1.7  Students from Pune, Mumbai or Delhi.
SELECT roll_no, first_name, city
FROM student
WHERE city IN ('Pune', 'Mumbai', 'Delhi');

-- Q1.8  Semester-5 subjects that carry 4 credits.
SELECT subject_id, subject_name, dept_id
FROM subject
WHERE semester = 5 AND credits = 4;

-- Q1.9  Faculty name along with department name (join).
SELECT f.name, d.dept_name, d.building
FROM faculty f
JOIN department d ON d.dept_id = f.dept_id;

-- Q1.10  Annual salary and joining year of every faculty (arithmetic + alias).
SELECT name, salary * 12 AS annual_salary,
       strftime('%Y', joining_date) AS joined_in
FROM faculty;

-- Q1.11  Student names in UPPER case with length of their e-mail.
SELECT upper(first_name || ' ' || last_name) AS name_caps,
       length(email) AS email_len
FROM student
LIMIT 8;

-- Q1.12  Exam records where the student was ABSENT (NULL marks).
SELECT roll_no, subject_id, exam_type
FROM exam_result
WHERE marks_obtained IS NULL;

-- Q1.13  Five youngest students.
SELECT roll_no, first_name, dob
FROM student
ORDER BY dob DESC
LIMIT 5;

-- ##########  Assignment 2(a) : Aggregates, grouping & ordering  ##########

-- Q2A.1  Number of students in each department.
SELECT dept_id, COUNT(*) AS students
FROM student
GROUP BY dept_id
ORDER BY students DESC;

-- Q2A.2  Average, minimum and maximum salary per department.
SELECT dept_id, ROUND(AVG(salary)) AS avg_sal, MIN(salary) AS min_sal, MAX(salary) AS max_sal
FROM faculty
GROUP BY dept_id
ORDER BY avg_sal DESC;

-- Q2A.3  Departments having more than 4 students (HAVING).
SELECT dept_id, COUNT(*) AS students
FROM student
GROUP BY dept_id
HAVING COUNT(*) > 4;

-- Q2A.4  Sessions conducted per subject.
SELECT subject_id, COUNT(*) AS sessions, MIN(session_date) AS first, MAX(session_date) AS last
FROM class_session
GROUP BY subject_id
ORDER BY sessions DESC, subject_id;

-- Q2A.5  Gender-wise count in each department (group by two columns).
SELECT dept_id, gender, COUNT(*) AS cnt
FROM student
GROUP BY dept_id, gender
ORDER BY dept_id, gender;

-- Q2A.6  Total credits offered per department per semester.
SELECT dept_id, semester, SUM(credits) AS total_credits, COUNT(*) AS subjects
FROM subject
GROUP BY dept_id, semester;

-- Q2A.7  Average marks per subject and exam type.
SELECT subject_id, exam_type, ROUND(AVG(marks_obtained), 2) AS avg_marks, MAX(max_marks) AS out_of
FROM exam_result
GROUP BY subject_id, exam_type
ORDER BY subject_id, out_of;

-- Q2A.8  NULL handling: COUNT(*) vs COUNT(column) vs AVG.
SELECT COUNT(*)              AS all_rows,
       COUNT(marks_obtained) AS non_null_marks,
       COUNT(*) - COUNT(marks_obtained) AS absents,
       ROUND(AVG(marks_obtained), 2) AS avg_ignores_null
FROM exam_result;

-- Q2A.9  Number of lectures held in each month.
SELECT strftime('%Y-%m', session_date) AS month, COUNT(*) AS sessions
FROM class_session
GROUP BY month
ORDER BY month;

-- Q2A.10  DBMS (CS501) attendance % of every student, highest first.
SELECT a.roll_no,
       COUNT(*) AS held,
       SUM(a.status = 'P') AS attended,
       ROUND(100.0 * SUM(a.status = 'P') / COUNT(*), 2) AS pct
FROM attendance a
JOIN class_session cs ON cs.session_id = a.session_id
WHERE cs.subject_id = 'CS501'
GROUP BY a.roll_no
ORDER BY pct DESC;

-- Q2A.11  Designations whose average salary exceeds 80,000.
SELECT designation, COUNT(*) AS cnt, ROUND(AVG(salary)) AS avg_salary
FROM faculty
GROUP BY designation
HAVING AVG(salary) > 80000
ORDER BY avg_salary DESC;

-- ##########  Assignment 2(b) : Nested subqueries & SQL updates  ##########

-- Q2B.1  Faculty earning more than the average salary (scalar subquery).
SELECT name, salary
FROM faculty
WHERE salary > (SELECT AVG(salary) FROM faculty);

-- Q2B.2  Students enrolled in any subject taught by Dr. Ramesh Sharma (IN).
SELECT DISTINCT roll_no
FROM enrollment
WHERE subject_id IN (SELECT t.subject_id FROM teaches t
                     WHERE t.faculty_id = (SELECT faculty_id FROM faculty
                                           WHERE name = 'Dr. Ramesh Sharma'));

-- Q2B.3  Faculty who are not teaching any subject (NOT IN).
SELECT faculty_id, name
FROM faculty
WHERE faculty_id NOT IN (SELECT faculty_id FROM teaches);

-- Q2B.4  Students who never missed a DBMS lecture (NOT EXISTS).
SELECT e.roll_no
FROM enrollment e
WHERE e.subject_id = 'CS501'
  AND NOT EXISTS (SELECT 1 FROM attendance a
                  JOIN class_session cs ON cs.session_id = a.session_id
                  WHERE cs.subject_id = 'CS501'
                    AND a.roll_no = e.roll_no AND a.status = 'A');

-- Q2B.5  Department(s) with the maximum number of students.
SELECT dept_id, COUNT(*) AS students
FROM student
GROUP BY dept_id
HAVING COUNT(*) = (SELECT MAX(cnt) FROM (SELECT COUNT(*) AS cnt
                                         FROM student GROUP BY dept_id));

-- Q2B.6  Highest MidSem scorer of each subject (correlated subquery).
SELECT r.subject_id, r.roll_no, r.marks_obtained
FROM exam_result r
WHERE r.exam_type = 'MidSem'
  AND r.marks_obtained = (SELECT MAX(r2.marks_obtained) FROM exam_result r2
                          WHERE r2.subject_id = r.subject_id AND r2.exam_type = 'MidSem')
ORDER BY r.subject_id;

-- Q2B.7  Faculty paid more than ALL IT faculty  (> ALL  ==  > MAX).
-- SQLite has no ALL/SOME keyword; "> ALL (S)" is equivalent to "> (SELECT MAX ...)"
SELECT name, dept_id, salary
FROM faculty
WHERE salary > (SELECT MAX(salary) FROM faculty WHERE dept_id = 'IT');

-- Q2B.8  Students whose average attendance is above the college average (derived table).
SELECT t.roll_no, t.avg_pct
FROM (SELECT roll_no, ROUND(AVG(adjusted_pct), 2) AS avg_pct
      FROM v_attendance_summary GROUP BY roll_no) AS t
WHERE t.avg_pct > (SELECT AVG(adjusted_pct) FROM v_attendance_summary)
ORDER BY t.avg_pct DESC;

-- Q2B.9  Set operations: defaulters in BOTH CS501 and CS502 (INTERSECT).
SELECT roll_no FROM v_defaulters WHERE subject_id = 'CS501'
INTERSECT
SELECT roll_no FROM v_defaulters WHERE subject_id = 'CS502';

-- Q2B.10  Set operations: CS students who are NOT defaulters anywhere (EXCEPT).
SELECT roll_no FROM student WHERE dept_id = 'CS'
EXCEPT
SELECT roll_no FROM v_defaulters;

-- Q2B.11  Complex query (CTE + window): top 2 students per department by SGPA.
WITH sgpa AS (
  SELECT r.roll_no, s.dept_id,
         ROUND(SUM(r.credits * r.grade_point) * 1.0 / SUM(r.credits), 2) AS sgpa
  FROM v_result_sheet r JOIN student s ON s.roll_no = r.roll_no
  GROUP BY r.roll_no),
ranked AS (
  SELECT *, RANK() OVER (PARTITION BY dept_id ORDER BY sgpa DESC) AS rnk FROM sgpa)
SELECT dept_id, rnk, roll_no, sgpa FROM ranked WHERE rnk <= 2;

-- Q2B.12  UPDATE: 10% raise for faculty of departments whose avg attendance < 75%.
SAVEPOINT q;
SELECT faculty_id, dept_id, salary FROM faculty
WHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);
UPDATE faculty
SET salary = salary * 1.10
WHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);
SELECT faculty_id, dept_id, salary FROM faculty
WHERE dept_id IN (SELECT dept_id FROM v_dept_stats WHERE avg_attendance < 75);
ROLLBACK TO q; RELEASE q;

-- Q2B.13  UPDATE: +2 bonus Internal marks (capped at max) for students with >= 90% attendance in that subject.
SAVEPOINT q;
UPDATE exam_result
SET marks_obtained = MIN(marks_obtained + 2, max_marks)
WHERE exam_type = 'Internal'
  AND (roll_no, subject_id) IN (SELECT roll_no, subject_id FROM v_attendance_summary
                                WHERE adjusted_pct >= 90);
SELECT COUNT(*) AS audit_rows_written_by_trigger FROM audit_log WHERE table_name = 'exam_result';
ROLLBACK TO q; RELEASE q;

-- Q2B.14  UPDATE with CASE: promote Assistant Professors with 5+ years of service.
SAVEPOINT q;
UPDATE faculty
SET designation = CASE
      WHEN designation = 'Assistant Professor'
       AND julianday('now') - julianday(joining_date) > 5 * 365 THEN 'Associate Professor'
      ELSE designation END;
SELECT name, designation, joining_date FROM faculty ORDER BY joining_date;
ROLLBACK TO q; RELEASE q;

-- Q2B.15  DELETE with subquery: remove rejected leave requests of CS students.
SAVEPOINT q;
DELETE FROM leave_request
WHERE status = 'Rejected'
  AND roll_no IN (SELECT roll_no FROM student WHERE dept_id = 'CS');
SELECT leave_id, roll_no, status FROM leave_request;
ROLLBACK TO q; RELEASE q;

-- ##########  Assignment 3 : SQL DDL & DML (hostel management)  ##########
BEGIN;  -- sandbox: rolled back at the end

-- Q3.1  Create table HOSTEL.
CREATE TABLE hostel (
  hostel_id   VARCHAR(5) PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  gender_type CHAR(1) CHECK (gender_type IN ('M', 'F')),
  capacity    INTEGER
);

-- Q3.2  Create table ROOM referencing HOSTEL.
CREATE TABLE room (
  room_no   VARCHAR(6),
  hostel_id VARCHAR(5) REFERENCES hostel(hostel_id),
  beds      INTEGER DEFAULT 2,
  PRIMARY KEY (hostel_id, room_no)
);

-- Q3.3  Insert hostels and rooms (multi-row INSERT).
INSERT INTO hostel VALUES ('H1', 'Shivneri Boys Hostel', 'M', 120),
                          ('H2', 'Sahyadri Girls Hostel', 'F', 90);
INSERT INTO room (room_no, hostel_id, beds) VALUES
  ('101', 'H1', 2), ('102', 'H1', 3), ('103', 'H1', 2),
  ('201', 'H2', 2), ('202', 'H2', 2);
SELECT * FROM room;

-- Q3.4  ALTER TABLE: add a warden column, then fill it with UPDATE.
ALTER TABLE hostel ADD COLUMN warden VARCHAR(50);
UPDATE hostel SET warden = CASE hostel_id WHEN 'H1' THEN 'Mr. Patil' ELSE 'Mrs. Kulkarni' END;
SELECT * FROM hostel;

-- Q3.5  Create ALLOTMENT and fill it with INSERT ... SELECT (out-of-Pune students).
CREATE TABLE allotment (
  roll_no   VARCHAR(10) PRIMARY KEY REFERENCES student(roll_no),
  hostel_id VARCHAR(5) NOT NULL,
  room_no   VARCHAR(6) NOT NULL,
  FOREIGN KEY (hostel_id, room_no) REFERENCES room(hostel_id, room_no)
);
INSERT INTO allotment (roll_no, hostel_id, room_no)
SELECT roll_no,
       CASE gender WHEN 'F' THEN 'H2' ELSE 'H1' END,
       CASE gender WHEN 'F' THEN '201' ELSE '101' END
FROM student
WHERE city <> 'Pune' AND year = 3 AND dept_id = 'CS';
SELECT a.roll_no, s.first_name, s.city, a.hostel_id, a.room_no
FROM allotment a JOIN student s USING (roll_no);

-- Q3.6  ALTER TABLE ... RENAME COLUMN and RENAME TO.
ALTER TABLE room RENAME COLUMN beds TO bed_count;
ALTER TABLE allotment RENAME TO hostel_allotment;
SELECT name FROM sqlite_master WHERE name IN ('room', 'hostel_allotment', 'allotment');

-- Q3.7  UPDATE and DELETE rows.
UPDATE room SET bed_count = bed_count + 1 WHERE hostel_id = 'H1';
DELETE FROM hostel_allotment WHERE roll_no IN (SELECT roll_no FROM student WHERE city = 'Delhi');
SELECT * FROM room;

-- Q3.8  CREATE VIEW for occupancy and query it.
CREATE VIEW v_hostel_occupancy AS
SELECT h.name, COUNT(a.roll_no) AS occupied,
       (SELECT SUM(bed_count) FROM room r WHERE r.hostel_id = h.hostel_id) AS beds
FROM hostel h LEFT JOIN hostel_allotment a ON a.hostel_id = h.hostel_id
GROUP BY h.hostel_id;
SELECT * FROM v_hostel_occupancy;

-- Q3.9  DROP the view and the tables (reverse dependency order).
DROP VIEW v_hostel_occupancy;
DROP TABLE hostel_allotment;
DROP TABLE room;
DROP TABLE hostel;
ROLLBACK;

-- ##########  Assignment 4 : Schema creation & constraints (library)  ##########
BEGIN;  -- sandbox: rolled back at the end

-- Q4.1  Create LIB_BOOK with PRIMARY KEY, NOT NULL, CHECK and DEFAULT.
CREATE TABLE lib_book (
  isbn     CHAR(13)     PRIMARY KEY CHECK (length(isbn) = 13),
  title    VARCHAR(150) NOT NULL,
  author   VARCHAR(100) NOT NULL,
  category VARCHAR(20)  DEFAULT 'General'
           CHECK (category IN ('General', 'Database', 'OS', 'Networks', 'Maths')),
  copies   INTEGER      NOT NULL DEFAULT 1 CHECK (copies >= 0)
);

-- Q4.2  Create LIB_MEMBER: FK to student with ON DELETE CASCADE + UNIQUE.
CREATE TABLE lib_member (
  member_id INTEGER PRIMARY KEY,
  roll_no   VARCHAR(10) NOT NULL UNIQUE
            REFERENCES student(roll_no) ON DELETE CASCADE,
  max_books INTEGER NOT NULL DEFAULT 3 CHECK (max_books BETWEEN 1 AND 5),
  joined_on DATE DEFAULT (date('now'))
);

-- Q4.3  Create LIB_ISSUE with table-level CHECKs and two FKs (CASCADE vs RESTRICT).
CREATE TABLE lib_issue (
  issue_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES lib_member(member_id) ON DELETE CASCADE,
  isbn        CHAR(13) NOT NULL REFERENCES lib_book(isbn) ON DELETE RESTRICT,
  issue_date  DATE NOT NULL DEFAULT (date('now')),
  due_date    DATE NOT NULL,
  return_date DATE,
  CHECK (due_date > issue_date),
  CHECK (return_date IS NULL OR return_date >= issue_date)
);

-- Q4.4  Insert valid data (DEFAULT values get applied).
INSERT INTO lib_book (isbn, title, author, category, copies) VALUES
  ('9780073523323', 'Database System Concepts', 'Silberschatz', 'Database', 4),
  ('9780072465631', 'Database Management Systems', 'Ramakrishnan', 'Database', 2),
  ('9781118063330', 'Operating System Concepts', 'Galvin', 'OS', 3);
INSERT INTO lib_member (member_id, roll_no) VALUES (1, '23CS001'), (2, '23CS002'), (3, '23IT001');
INSERT INTO lib_issue (member_id, isbn, issue_date, due_date) VALUES
  (1, '9780073523323', '2026-09-01', '2026-09-15'),
  (1, '9781118063330', '2026-09-03', '2026-09-17'),
  (2, '9780072465631', '2026-09-05', '2026-09-19');
SELECT * FROM lib_member;

-- Q4.5  Constraint tests - each statement below MUST be rejected by the DBMS.
-- EXPECTED TO FAIL (PRIMARY KEY):
-- INSERT INTO lib_book (isbn, title, author) VALUES ('9780073523323', 'Duplicate', 'X');
-- EXPECTED TO FAIL (CHECK length):
-- INSERT INTO lib_book (isbn, title, author) VALUES ('12345', 'Short ISBN', 'X');
-- EXPECTED TO FAIL (NOT NULL):
-- INSERT INTO lib_book (isbn, title, author) VALUES ('9999999999999', NULL, 'X');
-- EXPECTED TO FAIL (CHECK copies):
-- INSERT INTO lib_book (isbn, title, author, copies) VALUES ('9999999999999', 'T', 'X', -2);
-- EXPECTED TO FAIL (CHECK IN list):
-- INSERT INTO lib_book (isbn, title, author, category) VALUES ('9999999999999', 'T', 'X', 'Novels');
-- EXPECTED TO FAIL (FOREIGN KEY):
-- INSERT INTO lib_member (member_id, roll_no) VALUES (9, '99XX999');
-- EXPECTED TO FAIL (UNIQUE):
-- INSERT INTO lib_member (member_id, roll_no) VALUES (9, '23CS001');
-- EXPECTED TO FAIL (CHECK range):
-- INSERT INTO lib_member (member_id, roll_no, max_books) VALUES (9, '23CS003', 10);
-- EXPECTED TO FAIL (table CHECK):
-- INSERT INTO lib_issue (member_id, isbn, issue_date, due_date) VALUES (1, '9780073523323', '2026-09-10', '2026-09-01');
-- EXPECTED TO FAIL (ON DELETE RESTRICT):
-- DELETE FROM lib_book WHERE isbn = '9780073523323';

-- Q4.6  Referential action ON DELETE CASCADE: delete member 1 -> issues vanish.
SELECT COUNT(*) AS issues_of_member_1 FROM lib_issue WHERE member_id = 1;
DELETE FROM lib_member WHERE member_id = 1;
SELECT COUNT(*) AS issues_of_member_1 FROM lib_issue WHERE member_id = 1;

-- Q4.7  Inspect the constraints stored in the catalog (data dictionary).
SELECT "table", "from" AS column, "to" AS ref_column, on_update, on_delete
FROM pragma_foreign_key_list('lib_issue');
SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('lib_book');
ROLLBACK;
