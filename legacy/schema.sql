-- ============================================================================
-- 🎓 COLLEGE ATTENDANCE & MULTI-TIER DEFAULTER MANAGEMENT SYSTEM (ENTERPRISE)
-- Relational Schema Definition (DDL) - 3NF / BCNF Normalized Architecture
-- ============================================================================

CREATE DATABASE IF NOT EXISTS college_dbms;
USE college_dbms;

-- Clean re-run cleanup in reverse foreign-key dependency order
DROP TABLE IF EXISTS attendance_audit_log;
DROP TABLE IF EXISTS defaulter_registry;
DROP TABLE IF EXISTS defaulter_list; -- Legacy compatibility
DROP TABLE IF EXISTS duty_leave;
DROP TABLE IF EXISTS attendance_record;
DROP TABLE IF EXISTS attendance; -- Legacy compatibility
DROP TABLE IF EXISTS attendance_session;
DROP TABLE IF EXISTS timetable_slot;
DROP TABLE IF EXISTS subject;
DROP TABLE IF EXISTS faculty;
DROP TABLE IF EXISTS student;
DROP TABLE IF EXISTS department;

-- ----------------------------------------------------------------------------
-- 1. DEPARTMENT Table (Academic Hierarchy Root)
-- ----------------------------------------------------------------------------
CREATE TABLE department (
    dept_id VARCHAR(10) NOT NULL,
    dept_name VARCHAR(100) NOT NULL,
    building VARCHAR(50) NOT NULL,
    hod_name VARCHAR(100) NOT NULL,
    PRIMARY KEY (dept_id)
);

-- ----------------------------------------------------------------------------
-- 2. FACULTY Table
-- ----------------------------------------------------------------------------
CREATE TABLE faculty (
    faculty_id VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    dept_id VARCHAR(10) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    designation VARCHAR(50) DEFAULT 'Assistant Professor',
    password VARCHAR(255) NOT NULL,
    PRIMARY KEY (faculty_id),
    CONSTRAINT fk_faculty_dept 
        FOREIGN KEY (dept_id) REFERENCES department(dept_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 3. STUDENT Table
-- ----------------------------------------------------------------------------
CREATE TABLE student (
    roll_no VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    blood_group VARCHAR(5),
    year INT NOT NULL,
    branch VARCHAR(50) NOT NULL,
    dept_id VARCHAR(10) NOT NULL,
    PRIMARY KEY (roll_no),
    CONSTRAINT chk_student_gender CHECK (gender IN ('Male', 'Female', 'Other')),
    CONSTRAINT chk_student_year CHECK (year BETWEEN 1 AND 4),
    CONSTRAINT fk_student_dept 
        FOREIGN KEY (dept_id) REFERENCES department(dept_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 4. SUBJECT Table
-- ----------------------------------------------------------------------------
CREATE TABLE subject (
    subject_id VARCHAR(20) NOT NULL,
    subject_name VARCHAR(100) NOT NULL,
    credits INT NOT NULL DEFAULT 4,
    dept_id VARCHAR(10) NOT NULL,
    faculty_id VARCHAR(20) NOT NULL,
    PRIMARY KEY (subject_id),
    CONSTRAINT fk_subject_dept 
        FOREIGN KEY (dept_id) REFERENCES department(dept_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_subject_faculty 
        FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_subject_credits CHECK (credits BETWEEN 1 AND 6)
);

-- ----------------------------------------------------------------------------
-- 5. TIMETABLE SLOT Table (Period & Room Allocation Guardrails)
-- ----------------------------------------------------------------------------
CREATE TABLE timetable_slot (
    slot_id INT AUTO_INCREMENT,
    day_of_week VARCHAR(10) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room_number VARCHAR(20) NOT NULL,
    subject_id VARCHAR(20) NOT NULL,
    faculty_id VARCHAR(20) NOT NULL,
    PRIMARY KEY (slot_id),
    CONSTRAINT fk_slot_subject 
        FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_slot_faculty 
        FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_day_of_week CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
    CONSTRAINT chk_slot_time CHECK (start_time < end_time)
);

-- ----------------------------------------------------------------------------
-- 6. ATTENDANCE SESSION Table (Period-Wise Lecture/Lab Instances)
-- ----------------------------------------------------------------------------
CREATE TABLE attendance_session (
    session_id INT AUTO_INCREMENT,
    slot_id INT NOT NULL,
    subject_id VARCHAR(20) NOT NULL,
    session_date DATE NOT NULL,
    topic_covered VARCHAR(200),
    conducted_by VARCHAR(20) NOT NULL,
    PRIMARY KEY (session_id),
    CONSTRAINT fk_session_slot 
        FOREIGN KEY (slot_id) REFERENCES timetable_slot(slot_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_session_subject 
        FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_session_faculty 
        FOREIGN KEY (conducted_by) REFERENCES faculty(faculty_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 7. ATTENDANCE RECORD Table (Composite Primary Key: session_id + roll_no)
-- Status: 1 = Present, 0 = Absent
-- ----------------------------------------------------------------------------
CREATE TABLE attendance_record (
    session_id INT NOT NULL,
    roll_no VARCHAR(20) NOT NULL,
    status TINYINT(1) NOT NULL,
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, roll_no),
    CONSTRAINT fk_record_session 
        FOREIGN KEY (session_id) REFERENCES attendance_session(session_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_record_student 
        FOREIGN KEY (roll_no) REFERENCES student(roll_no)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_record_status CHECK (status IN (0, 1))
);

-- ----------------------------------------------------------------------------
-- 8. DUTY & MEDICAL LEAVE Table (Adjusted Attendance Calculations)
-- ----------------------------------------------------------------------------
CREATE TABLE duty_leave (
    leave_id INT AUTO_INCREMENT,
    roll_no VARCHAR(20) NOT NULL,
    session_id INT NOT NULL,
    leave_type VARCHAR(20) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    is_approved TINYINT(1) NOT NULL DEFAULT 0,
    approved_by VARCHAR(20),
    approval_date DATE,
    PRIMARY KEY (leave_id),
    CONSTRAINT fk_leave_student 
        FOREIGN KEY (roll_no) REFERENCES student(roll_no)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_leave_session 
        FOREIGN KEY (session_id) REFERENCES attendance_session(session_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_leave_approver 
        FOREIGN KEY (approved_by) REFERENCES faculty(faculty_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_leave_type CHECK (leave_type IN ('Medical', 'Sports', 'NSS_NCC', 'Academic_Event', 'Official_Duty')),
    CONSTRAINT chk_leave_approval CHECK (is_approved IN (0, 1))
);

-- ----------------------------------------------------------------------------
-- 9. DEFAULTER REGISTRY Table (Multi-Tier Risk & Recovery Math)
-- Risk Tiers: 'Critical' (<60%), 'Warning' (60%-74.99%), 'Safe' (>=75%)
-- ----------------------------------------------------------------------------
CREATE TABLE defaulter_registry (
    registry_id INT AUTO_INCREMENT,
    roll_no VARCHAR(20) NOT NULL,
    subject_id VARCHAR(20) NOT NULL,
    total_sessions INT NOT NULL,
    attended_sessions INT NOT NULL,
    approved_leaves INT NOT NULL DEFAULT 0,
    raw_percentage DECIMAL(5, 2) NOT NULL,
    adjusted_percentage DECIMAL(5, 2) NOT NULL,
    risk_tier VARCHAR(20) NOT NULL,
    recovery_sessions_needed INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'Flagged for Review',
    date_flagged DATE NOT NULL,
    PRIMARY KEY (registry_id),
    CONSTRAINT fk_registry_student 
        FOREIGN KEY (roll_no) REFERENCES student(roll_no)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_registry_subject 
        FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_risk_tier CHECK (risk_tier IN ('Critical', 'Warning', 'Safe')),
    CONSTRAINT chk_raw_pct CHECK (raw_percentage BETWEEN 0.00 AND 100.00),
    CONSTRAINT chk_adj_pct CHECK (adjusted_percentage BETWEEN 0.00 AND 100.00)
);

-- ----------------------------------------------------------------------------
-- 10. IMMUTABLE ATTENDANCE AUDIT LOG Table (Anti-Tamper Audit Trail)
-- ----------------------------------------------------------------------------
CREATE TABLE attendance_audit_log (
    audit_id INT AUTO_INCREMENT,
    session_id INT NOT NULL,
    roll_no VARCHAR(20) NOT NULL,
    old_status TINYINT(1),
    new_status TINYINT(1) NOT NULL,
    action_type VARCHAR(10) NOT NULL,
    changed_by VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) DEFAULT '127.0.0.1',
    PRIMARY KEY (audit_id),
    CONSTRAINT chk_audit_action CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- ----------------------------------------------------------------------------
-- 11. LEGACY COMPATIBILITY TABLES (For seamless dashboard interoperability)
-- ----------------------------------------------------------------------------
CREATE TABLE attendance (
    attendance_id INT AUTO_INCREMENT,
    roll_no VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    status TINYINT(1) NOT NULL,
    PRIMARY KEY (attendance_id),
    CONSTRAINT fk_legacy_att_student FOREIGN KEY (roll_no) REFERENCES student(roll_no) ON DELETE CASCADE,
    CONSTRAINT chk_legacy_status CHECK (status IN (0, 1))
);

CREATE TABLE defaulter_list (
    detention_id INT AUTO_INCREMENT,
    roll_no VARCHAR(20) NOT NULL,
    subject_id VARCHAR(20) NOT NULL,
    attendance_percentage DECIMAL(5, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Flagged',
    date_flagged DATE NOT NULL,
    PRIMARY KEY (detention_id),
    CONSTRAINT fk_legacy_def_student FOREIGN KEY (roll_no) REFERENCES student(roll_no) ON DELETE CASCADE,
    CONSTRAINT fk_legacy_def_subject FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 12. COMPOSITE PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX idx_student_dept_year ON student(dept_id, year, branch);
CREATE INDEX idx_session_date_subject ON attendance_session(session_date, subject_id);
CREATE INDEX idx_record_roll_status ON attendance_record(roll_no, status);
CREATE INDEX idx_leave_roll_session ON duty_leave(roll_no, session_id, is_approved);
CREATE INDEX idx_defaulter_risk_subject ON defaulter_registry(subject_id, risk_tier, adjusted_percentage);
CREATE INDEX idx_audit_session_roll ON attendance_audit_log(session_id, roll_no, changed_at);
