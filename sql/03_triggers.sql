

-- ---------------------------------------------------------------------------
-- T1. Attendance can be marked only for students ENROLLED in that subject
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_attendance_must_be_enrolled
BEFORE INSERT ON attendance
WHEN NOT EXISTS (
    SELECT 1
      FROM class_session cs
      JOIN enrollment e ON e.subject_id = cs.subject_id
     WHERE cs.session_id = NEW.session_id
       AND e.roll_no     = NEW.roll_no)
BEGIN
    SELECT RAISE(ABORT, 'Student is not enrolled in the subject of this session');
END;

-- ---------------------------------------------------------------------------
-- T2. A session cannot be scheduled in the future
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_session_not_in_future
BEFORE INSERT ON class_session
WHEN date(NEW.session_date) > date('now', 'localtime')
BEGIN
    SELECT RAISE(ABORT, 'Session date cannot be in the future');
END;

-- ---------------------------------------------------------------------------
-- T3. Only a PENDING leave can be approved / rejected
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_leave_review_once
BEFORE UPDATE OF status ON leave_request
WHEN OLD.status <> 'Pending' AND NEW.status <> OLD.status
BEGIN
    SELECT RAISE(ABORT, 'Leave request has already been reviewed');
END;

-- ---------------------------------------------------------------------------
-- T4..T6. AUDIT: every change to attendance is logged (tamper-proof trail)
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_audit_attendance_update
AFTER UPDATE OF status ON attendance
WHEN OLD.status <> NEW.status
BEGIN
    INSERT INTO audit_log (table_name, operation, row_key, old_value, new_value)
    VALUES ('attendance', 'UPDATE', NEW.session_id || '/' || NEW.roll_no, OLD.status, NEW.status);
END;

CREATE TRIGGER trg_audit_attendance_delete
AFTER DELETE ON attendance
BEGIN
    INSERT INTO audit_log (table_name, operation, row_key, old_value, new_value)
    VALUES ('attendance', 'DELETE', OLD.session_id || '/' || OLD.roll_no, OLD.status, NULL);
END;

-- ---------------------------------------------------------------------------
-- T7..T8. AUDIT: student insert / delete
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_audit_student_insert
AFTER INSERT ON student
BEGIN
    INSERT INTO audit_log (table_name, operation, row_key, old_value, new_value)
    VALUES ('student', 'INSERT', NEW.roll_no, NULL, NEW.first_name || ' ' || NEW.last_name);
END;

CREATE TRIGGER trg_audit_student_update
AFTER UPDATE ON student
BEGIN
    INSERT INTO audit_log (table_name, operation, row_key, old_value, new_value)
    VALUES ('student', 'UPDATE', NEW.roll_no,
            json_object('name', OLD.first_name || ' ' || OLD.last_name, 'city', OLD.city,
                        'year', OLD.year, 'email', OLD.email),
            json_object('name', NEW.first_name || ' ' || NEW.last_name, 'city', NEW.city,
                        'year', NEW.year, 'email', NEW.email));
END;

CREATE TRIGGER trg_audit_student_delete
AFTER DELETE ON student
BEGIN
    INSERT INTO audit_log (table_name, operation, row_key, old_value, new_value)
    VALUES ('student', 'DELETE', OLD.roll_no, OLD.first_name || ' ' || OLD.last_name, NULL);
END;

-- ---------------------------------------------------------------------------
-- T9. AUDIT: marks changed after being entered
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_audit_marks_update
AFTER UPDATE OF marks_obtained ON exam_result
WHEN OLD.marks_obtained IS NOT NEW.marks_obtained
BEGIN
    INSERT INTO audit_log (table_name, operation, row_key, old_value, new_value)
    VALUES ('exam_result', 'UPDATE', NEW.roll_no || '/' || NEW.subject_id || '/' || NEW.exam_type,
            OLD.marks_obtained, NEW.marks_obtained);
END;

-- ---------------------------------------------------------------------------
-- T10. AUDIT: leave review
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_audit_leave_review
AFTER UPDATE OF status ON leave_request
WHEN OLD.status <> NEW.status
BEGIN
    INSERT INTO audit_log (table_name, operation, row_key, old_value, new_value)
    VALUES ('leave_request', 'UPDATE', 'leave#' || NEW.leave_id, OLD.status,
            NEW.status || ' by ' || COALESCE(NEW.reviewed_by, '?'));
END;
