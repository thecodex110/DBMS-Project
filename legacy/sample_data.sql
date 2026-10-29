-- ============================================================================
-- 🎓 COLLEGE ATTENDANCE & MULTI-TIER DEFAULTER MANAGEMENT SYSTEM
-- Comprehensive Multi-Tier Sample Dataset (DML)
-- ============================================================================

USE college_dbms;

-- ----------------------------------------------------------------------------
-- 1. Populate Departments
-- ----------------------------------------------------------------------------
INSERT INTO department (dept_id, dept_name, building, hod_name) VALUES
('DEPT_CS', 'Computer Science & Engineering', 'Aryabhata Block', 'Dr. Arvind Verma'),
('DEPT_IT', 'Information Technology', 'Turing Block', 'Prof. Sunita Patil'),
('DEPT_EC', 'Electronics & Telecommunication', 'Bhabha Block', 'Prof. Priya Nair'),
('DEPT_ME', 'Mechanical Engineering', 'Visvesvaraya Block', 'Dr. Rajesh Khanna');

-- ----------------------------------------------------------------------------
-- 2. Populate Faculty Members
-- ----------------------------------------------------------------------------
INSERT INTO faculty (faculty_id, name, dept_id, email, designation, password) VALUES
('FAC101', 'Dr. Ramesh Sharma', 'DEPT_CS', 'ramesh.sharma@college.edu', 'Professor & Dean Academic', 'prof_ramesh@123'),
('FAC102', 'Prof. Sunita Patil', 'DEPT_IT', 'sunita.patil@college.edu', 'Associate Professor & HOD', 'sunita_p#2024'),
('FAC103', 'Dr. Arvind Verma', 'DEPT_CS', 'arvind.verma@college.edu', 'Professor & HOD', 'arvind_v$89'),
('FAC104', 'Prof. Priya Nair', 'DEPT_EC', 'priya.nair@college.edu', 'Associate Professor', 'priya_nair!99'),
('FAC105', 'Dr. Rajesh Khanna', 'DEPT_ME', 'rajesh.khanna@college.edu', 'Professor & HOD', 'rajesh_k#44');

-- ----------------------------------------------------------------------------
-- 3. Populate Subjects
-- ----------------------------------------------------------------------------
INSERT INTO subject (subject_id, subject_name, credits, dept_id, faculty_id) VALUES
('CS301', 'Database Management Systems', 4, 'DEPT_CS', 'FAC101'),
('CS302', 'Operating Systems', 4, 'DEPT_CS', 'FAC103'),
('IT303', 'Computer Networks', 4, 'DEPT_IT', 'FAC102'),
('EC304', 'Microprocessors & Microcontrollers', 4, 'DEPT_EC', 'FAC104'),
('ME305', 'Thermodynamics & Heat Transfer', 4, 'DEPT_ME', 'FAC105');

-- ----------------------------------------------------------------------------
-- 4. Populate Students (20 Cohorts)
-- ----------------------------------------------------------------------------
INSERT INTO student (roll_no, name, gender, blood_group, year, branch, dept_id) VALUES
('21CS001', 'Aarav Mehta', 'Male', 'O+', 3, 'Computer Science', 'DEPT_CS'),
('21CS002', 'Ananya Iyer', 'Female', 'B+', 3, 'Computer Science', 'DEPT_CS'),
('21CS003', 'Rohan Deshmukh', 'Male', 'A+', 3, 'Computer Science', 'DEPT_CS'),
('21CS004', 'Ishaan Malhotra', 'Male', 'AB+', 3, 'Computer Science', 'DEPT_CS'),
('21CS005', 'Tanvi Shinde', 'Female', 'O-', 3, 'Computer Science', 'DEPT_CS'),
('21CS006', 'Aditya Rathi', 'Male', 'B-', 3, 'Computer Science', 'DEPT_CS'),
('21IT001', 'Pooja Kulkarni', 'Female', 'AB+', 3, 'Information Technology', 'DEPT_IT'),
('21IT002', 'Varun Joshi', 'Male', 'O-', 3, 'Information Technology', 'DEPT_IT'),
('21IT003', 'Rhea Kapoor', 'Female', 'A+', 3, 'Information Technology', 'DEPT_IT'),
('21IT004', 'Siddharth Sen', 'Male', 'B+', 3, 'Information Technology', 'DEPT_IT'),
('21IT005', 'Kavya Pillai', 'Female', 'O+', 3, 'Information Technology', 'DEPT_IT'),
('21EC001', 'Sneha Gupta', 'Female', 'A-', 3, 'Electronics', 'DEPT_EC'),
('21EC002', 'Kunal Shah', 'Male', 'B-', 3, 'Electronics', 'DEPT_EC'),
('21EC003', 'Vikram Chaudhary', 'Male', 'O+', 3, 'Electronics', 'DEPT_EC'),
('21EC004', 'Meera Nambiar', 'Female', 'AB-', 3, 'Electronics', 'DEPT_EC'),
('21ME001', 'Harsh Vardhan', 'Male', 'B+', 3, 'Mechanical Engineering', 'DEPT_ME'),
('21ME002', 'Devika Menon', 'Female', 'A+', 3, 'Mechanical Engineering', 'DEPT_ME'),
('21ME003', 'Pranav Kadam', 'Male', 'O+', 3, 'Mechanical Engineering', 'DEPT_ME'),
('22CS011', 'Zoya Khan', 'Female', 'AB+', 2, 'Computer Science', 'DEPT_CS'),
('22CS012', 'Kabir Bansal', 'Male', 'A-', 2, 'Computer Science', 'DEPT_CS');

-- ----------------------------------------------------------------------------
-- 5. Timetable Slots
-- ----------------------------------------------------------------------------
INSERT INTO timetable_slot (slot_id, day_of_week, start_time, end_time, room_number, subject_id, faculty_id) VALUES
(1, 'Monday', '09:00:00', '10:00:00', 'LH-101', 'CS301', 'FAC101'),
(2, 'Tuesday', '10:00:00', '11:00:00', 'LH-101', 'CS301', 'FAC101'),
(3, 'Wednesday', '09:00:00', '10:00:00', 'LH-101', 'CS301', 'FAC101'),
(4, 'Thursday', '11:00:00', '12:00:00', 'LH-101', 'CS301', 'FAC101'),
(5, 'Friday', '02:00:00', '03:00:00', 'LAB-3', 'CS301', 'FAC101'),
(6, 'Monday', '11:00:00', '12:00:00', 'LH-202', 'IT303', 'FAC102'),
(7, 'Wednesday', '11:00:00', '12:00:00', 'LH-202', 'IT303', 'FAC102'),
(8, 'Tuesday', '09:00:00', '10:00:00', 'LH-301', 'EC304', 'FAC104'),
(9, 'Thursday', '09:00:00', '10:00:00', 'LH-401', 'ME305', 'FAC105'),
(10, 'Friday', '10:00:00', '11:00:00', 'LH-102', 'CS302', 'FAC103');

-- ----------------------------------------------------------------------------
-- 6. Attendance Sessions (Lectures Conducted)
-- ----------------------------------------------------------------------------
INSERT INTO attendance_session (session_id, slot_id, subject_id, session_date, topic_covered, conducted_by) VALUES
(1, 1, 'CS301', '2026-09-01', 'Relational Algebra & Tuple Calculus', 'FAC101'),
(2, 2, 'CS301', '2026-09-02', 'Entity-Relationship to Relational Mapping', 'FAC101'),
(3, 3, 'CS301', '2026-09-03', 'Functional Dependencies & Normal Forms (1NF, 2NF, 3NF)', 'FAC101'),
(4, 4, 'CS301', '2026-09-04', 'Boyce-Codd Normal Form (BCNF) & Lossless Join', 'FAC101'),
(5, 5, 'CS301', '2026-09-05', 'Transaction ACID Properties & Two-Phase Locking', 'FAC101');

-- ----------------------------------------------------------------------------
-- 7. Attendance Records (Period-Wise Roll Call)
-- ----------------------------------------------------------------------------
INSERT INTO attendance_record (session_id, roll_no, status) VALUES
-- Session 1
(1, '21CS001', 1), (1, '21CS002', 1), (1, '21CS003', 0), (1, '21CS004', 1), (1, '21CS005', 1), (1, '21CS006', 1),
(1, '21IT001', 1), (1, '21IT002', 0), (1, '21IT003', 1), (1, '21IT004', 0), (1, '21IT005', 1),
(1, '21EC001', 1), (1, '21EC002', 1), (1, '21EC003', 1), (1, '21EC004', 1),
(1, '21ME001', 0), (1, '21ME002', 1), (1, '21ME003', 1), (1, '22CS011', 1), (1, '22CS012', 1),

-- Session 2
(2, '21CS001', 1), (2, '21CS002', 1), (2, '21CS003', 0), (2, '21CS004', 1), (2, '21CS005', 0), (2, '21CS006', 1),
(2, '21IT001', 1), (2, '21IT002', 0), (2, '21IT003', 1), (2, '21IT004', 1), (2, '21IT005', 1),
(2, '21EC001', 1), (2, '21EC002', 0), (2, '21EC003', 1), (2, '21EC004', 0),
(2, '21ME001', 1), (2, '21ME002', 1), (2, '21ME003', 1), (2, '22CS011', 1), (2, '22CS012', 0),

-- Session 3
(3, '21CS001', 1), (3, '21CS002', 1), (3, '21CS003', 1), (3, '21CS004', 1), (3, '21CS005', 0), (3, '21CS006', 0),
(3, '21IT001', 0), (3, '21IT002', 0), (3, '21IT003', 1), (3, '21IT004', 0), (3, '21IT005', 1),
(3, '21EC001', 1), (3, '21EC002', 0), (3, '21EC003', 1), (3, '21EC004', 1),
(3, '21ME001', 0), (3, '21ME002', 1), (3, '21ME003', 1), (3, '22CS011', 1), (3, '22CS012', 1),

-- Session 4
(4, '21CS001', 1), (4, '21CS002', 1), (4, '21CS003', 0), (4, '21CS004', 1), (4, '21CS005', 1), (4, '21CS006', 1),
(4, '21IT001', 1), (4, '21IT002', 1), (4, '21IT003', 1), (4, '21IT004', 0), (4, '21IT005', 0),
(4, '21EC001', 1), (4, '21EC002', 0), (4, '21EC003', 1), (4, '21EC004', 1),
(4, '21ME001', 0), (4, '21ME002', 0), (4, '21ME003', 1), (4, '22CS011', 1), (4, '22CS012', 0),

-- Session 5
(5, '21CS001', 0), (5, '21CS002', 1), (5, '21CS003', 0), (5, '21CS004', 1), (5, '21CS005', 0), (5, '21CS006', 1),
(5, '21IT001', 1), (5, '21IT002', 0), (5, '21IT003', 1), (5, '21IT004', 1), (5, '21IT005', 1),
(5, '21EC001', 0), (5, '21EC002', 0), (5, '21EC003', 1), (5, '21EC004', 1),
(5, '21ME001', 1), (5, '21ME002', 1), (5, '21ME003', 1), (5, '22CS011', 1), (5, '22CS012', 1);

-- ----------------------------------------------------------------------------
-- 8. Approved On-Duty & Medical Leaves (Dual-Metric Calculations)
-- ----------------------------------------------------------------------------
INSERT INTO duty_leave (leave_id, roll_no, session_id, leave_type, reason, is_approved, approved_by, approval_date) VALUES
(1, '21CS005', 2, 'Medical', 'Hospitalization - Viral Fever', 1, 'FAC101', '2026-09-03'),
(2, '21CS005', 3, 'Medical', 'Medical Bed Rest Certificate', 1, 'FAC101', '2026-09-04'),
(3, '21IT004', 3, 'Academic_Event', 'Inter-College Hackathon Representation', 1, 'FAC102', '2026-09-04'),
(4, '21ME001', 1, 'Sports', 'National Inter-University Cricket Tournament', 1, 'FAC105', '2026-09-02');

-- ----------------------------------------------------------------------------
-- 9. Defaulter Registry (Multi-Tier Initial Evaluation)
-- ----------------------------------------------------------------------------
INSERT INTO defaulter_registry (registry_id, roll_no, subject_id, total_sessions, attended_sessions, approved_leaves, raw_percentage, adjusted_percentage, risk_tier, recovery_sessions_needed, status, date_flagged) VALUES
(1, '21CS003', 'CS301', 5, 1, 0, 20.00, 20.00, 'Critical', 11, 'Official Detention Notice Issued', '2026-09-06'),
(2, '21CS005', 'CS301', 5, 2, 2, 40.00, 80.00, 'Safe', 0, 'Leaves Approved - Restored to Safe', '2026-09-06'),
(3, '21IT002', 'IT303', 5, 1, 0, 20.00, 20.00, 'Critical', 11, 'Mandatory Parent Conference Scheduled', '2026-09-06'),
(4, '21IT004', 'IT303', 5, 2, 1, 40.00, 60.00, 'Warning', 3, 'Warning Notice Dispatched', '2026-09-06'),
(5, '21EC002', 'EC304', 5, 1, 0, 20.00, 20.00, 'Critical', 11, 'Detention Flagged', '2026-09-06'),
(6, '21ME001', 'ME305', 5, 2, 1, 40.00, 60.00, 'Warning', 3, 'Counseling Flagged', '2026-09-06'),
(7, '22CS012', 'CS302', 5, 3, 0, 60.00, 60.00, 'Warning', 3, 'SMS Warning Sent', '2026-09-06');

-- ----------------------------------------------------------------------------
-- 10. Immutable Audit Logs
-- ----------------------------------------------------------------------------
INSERT INTO attendance_audit_log (session_id, roll_no, old_status, new_status, action_type, changed_by, changed_at, ip_address) VALUES
(1, '21CS003', NULL, 0, 'INSERT', 'FAC101', '2026-09-01 09:55:00', '192.168.1.10'),
(2, '21CS005', 0, 1, 'UPDATE', 'FAC101', '2026-09-03 14:30:00', '192.168.1.10'),
(3, '21IT004', 0, 0, 'UPDATE', 'FAC102', '2026-09-04 16:20:00', '192.168.1.15');

-- ----------------------------------------------------------------------------
-- 11. Legacy Sync Data
-- ----------------------------------------------------------------------------
INSERT INTO attendance (attendance_id, roll_no, date, status)
SELECT NULL, roll_no, '2026-09-01', status FROM attendance_record WHERE session_id = 1;
INSERT INTO attendance (attendance_id, roll_no, date, status)
SELECT NULL, roll_no, '2026-09-02', status FROM attendance_record WHERE session_id = 2;
INSERT INTO attendance (attendance_id, roll_no, date, status)
SELECT NULL, roll_no, '2026-09-03', status FROM attendance_record WHERE session_id = 3;
INSERT INTO attendance (attendance_id, roll_no, date, status)
SELECT NULL, roll_no, '2026-09-04', status FROM attendance_record WHERE session_id = 4;
INSERT INTO attendance (attendance_id, roll_no, date, status)
SELECT NULL, roll_no, '2026-09-05', status FROM attendance_record WHERE session_id = 5;

INSERT INTO defaulter_list (detention_id, roll_no, subject_id, attendance_percentage, status, date_flagged)
SELECT registry_id, roll_no, subject_id, adjusted_percentage, status, date_flagged FROM defaulter_registry;
