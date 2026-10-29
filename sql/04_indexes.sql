


CREATE INDEX idx_student_dept_year     ON student(dept_id, year);


CREATE INDEX idx_student_name          ON student(last_name, first_name);


CREATE INDEX idx_session_subject_date  ON class_session(subject_id, session_date);


CREATE INDEX idx_attendance_roll       ON attendance(roll_no, status);


CREATE INDEX idx_result_subject        ON exam_result(subject_id, exam_type);


CREATE INDEX idx_leave_roll_status     ON leave_request(roll_no, status, from_date, to_date);


CREATE INDEX idx_faculty_dept          ON faculty(dept_id);
