


CREATE VIEW v_student_profile AS
SELECT s.roll_no,
       s.first_name || ' ' || s.last_name                          AS full_name,
       s.gender,
       s.dob,
       (CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', s.dob) AS INTEGER))
         - (strftime('%m-%d', 'now') < strftime('%m-%d', s.dob))    AS age,
       s.email,
       s.city,
       s.year,
       s.dept_id,
       d.dept_name,
       (SELECT group_concat(p.phone, ', ')
          FROM student_phone p WHERE p.roll_no = s.roll_no)        AS phones
FROM student s
JOIN department d ON d.dept_id = s.dept_id;


CREATE VIEW v_attendance_summary AS
WITH counts AS (
    SELECT e.roll_no,
           e.subject_id,
           COUNT(a.session_id)                  AS total_classes,
           COALESCE(SUM(a.status = 'P'), 0)     AS present,
           COALESCE(SUM(a.status = 'A' AND EXISTS (
                    SELECT 1 FROM leave_request lr
                     WHERE lr.roll_no = a.roll_no
                       AND lr.status  = 'Approved'
                       AND cs.session_date BETWEEN lr.from_date AND lr.to_date)), 0) AS on_leave
      FROM enrollment e
      LEFT JOIN class_session cs ON cs.subject_id = e.subject_id
      LEFT JOIN attendance a     ON a.session_id = cs.session_id AND a.roll_no = e.roll_no
     GROUP BY e.roll_no, e.subject_id
)
SELECT c.roll_no,
       s.first_name || ' ' || s.last_name                                         AS student_name,
       s.dept_id,
       s.year,
       c.subject_id,
       sub.subject_name,
       c.total_classes,
       c.present,
       c.on_leave,
       ROUND(100.0 * c.present / NULLIF(c.total_classes, 0), 2)                   AS raw_pct,
       ROUND(100.0 * (c.present + c.on_leave) / NULLIF(c.total_classes, 0), 2)    AS adjusted_pct,
       MAX(0, 3 * c.total_classes - 4 * (c.present + c.on_leave))                 AS classes_needed
FROM counts c
JOIN student s   ON s.roll_no = c.roll_no
JOIN subject sub ON sub.subject_id = c.subject_id;

-- ---------------------------------------------------------------------------
-- V3. Defaulters (< 75 % adjusted attendance) with a risk category
-- ---------------------------------------------------------------------------
CREATE VIEW v_defaulters AS
SELECT v.*,
       CASE WHEN v.adjusted_pct < 50 THEN 'Critical'
            WHEN v.adjusted_pct < 65 THEN 'High'
            ELSE 'Moderate' END AS risk
FROM v_attendance_summary v
WHERE v.adjusted_pct < 75;

-- ---------------------------------------------------------------------------
-- V4. Result sheet: pivot of exam_result (Internal/MidSem/EndSem) + grade
--     NULL marks (absent) are ignored by SUM -> NULL-value semantics
-- ---------------------------------------------------------------------------
CREATE VIEW v_result_sheet AS
SELECT t.*,
       CASE WHEN t.percentage >= 90 THEN 'O'
            WHEN t.percentage >= 80 THEN 'A+'
            WHEN t.percentage >= 70 THEN 'A'
            WHEN t.percentage >= 60 THEN 'B+'
            WHEN t.percentage >= 50 THEN 'B'
            WHEN t.percentage >= 40 THEN 'C'
            ELSE 'F' END AS grade,
       CASE WHEN t.percentage >= 90 THEN 10
            WHEN t.percentage >= 80 THEN 9
            WHEN t.percentage >= 70 THEN 8
            WHEN t.percentage >= 60 THEN 7
            WHEN t.percentage >= 50 THEN 6
            WHEN t.percentage >= 40 THEN 5
            ELSE 0 END AS grade_point
FROM (
    SELECT r.roll_no,
           s.first_name || ' ' || s.last_name                                AS student_name,
           r.subject_id,
           sub.subject_name,
           sub.credits,
           MAX(CASE WHEN r.exam_type = 'Internal' THEN r.marks_obtained END) AS internal,
           MAX(CASE WHEN r.exam_type = 'MidSem'   THEN r.marks_obtained END) AS midsem,
           MAX(CASE WHEN r.exam_type = 'EndSem'   THEN r.marks_obtained END) AS endsem,
           SUM(r.marks_obtained)                                             AS total,
           SUM(r.max_marks)                                                  AS out_of,
           ROUND(100.0 * COALESCE(SUM(r.marks_obtained), 0) / SUM(r.max_marks), 2) AS percentage,
           SUM(r.marks_obtained IS NULL)                                     AS absent_in
      FROM exam_result r
      JOIN student s   ON s.roll_no = r.roll_no
      JOIN subject sub ON sub.subject_id = r.subject_id
     GROUP BY r.roll_no, r.subject_id
) t;

-- ---------------------------------------------------------------------------
-- V5. Subject-level report (LEFT JOIN keeps subjects without a teacher)
-- ---------------------------------------------------------------------------
CREATE VIEW v_subject_report AS
SELECT sub.subject_id,
       sub.subject_name,
       sub.dept_id,
       sub.semester,
       f.name                                                                    AS faculty,
       (SELECT COUNT(*) FROM enrollment e WHERE e.subject_id = sub.subject_id)   AS enrolled,
       (SELECT COUNT(*) FROM class_session cs WHERE cs.subject_id = sub.subject_id) AS sessions,
       (SELECT ROUND(AVG(adjusted_pct), 2) FROM v_attendance_summary v
         WHERE v.subject_id = sub.subject_id)                                    AS avg_attendance,
       (SELECT COUNT(*) FROM v_defaulters d WHERE d.subject_id = sub.subject_id) AS defaulters,
       (SELECT ROUND(AVG(percentage), 2) FROM v_result_sheet rs
         WHERE rs.subject_id = sub.subject_id)                                   AS avg_marks_pct
FROM subject sub
LEFT JOIN teaches t ON t.subject_id = sub.subject_id AND t.academic_year = '2026-27'
LEFT JOIN faculty f ON f.faculty_id = t.faculty_id;

-- ---------------------------------------------------------------------------
-- V6. Department statistics
-- ---------------------------------------------------------------------------
CREATE VIEW v_dept_stats AS
SELECT d.dept_id,
       d.dept_name,
       (SELECT COUNT(*) FROM student s WHERE s.dept_id = d.dept_id)            AS students,
       (SELECT COUNT(*) FROM faculty f WHERE f.dept_id = d.dept_id)            AS faculty,
       (SELECT ROUND(AVG(salary), 0) FROM faculty f WHERE f.dept_id = d.dept_id) AS avg_salary,
       (SELECT ROUND(AVG(adjusted_pct), 2) FROM v_attendance_summary v
         WHERE v.dept_id = d.dept_id)                                          AS avg_attendance,
       (SELECT COUNT(DISTINCT roll_no) FROM v_defaulters v
         WHERE v.dept_id = d.dept_id)                                          AS defaulter_students
FROM department d;
