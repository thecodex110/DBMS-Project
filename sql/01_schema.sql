

PRAGMA foreign_keys = ON;

CREATE TABLE department (
    dept_id          VARCHAR(10)  PRIMARY KEY,
    dept_name        VARCHAR(100) NOT NULL UNIQUE,
    building         VARCHAR(50)  NOT NULL,
    established_year INTEGER      CHECK (established_year BETWEEN 1950 AND 2100)
);


CREATE TABLE faculty (
    faculty_id   VARCHAR(10)   PRIMARY KEY,
    name         VARCHAR(100)  NOT NULL,
    email        VARCHAR(100)  NOT NULL UNIQUE CHECK (email LIKE '%_@_%._%'),
    designation  VARCHAR(30)   NOT NULL DEFAULT 'Assistant Professor'
                 CHECK (designation IN ('Professor', 'Associate Professor',
                                        'Assistant Professor', 'Lecturer')),
    dept_id      VARCHAR(10)   NOT NULL,
    joining_date DATE          NOT NULL CHECK (date(joining_date) IS NOT NULL),
    salary       DECIMAL(10,2) NOT NULL CHECK (salary > 0),
    FOREIGN KEY (dept_id) REFERENCES department(dept_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE student (
    roll_no        VARCHAR(10)  PRIMARY KEY,
    first_name     VARCHAR(50)  NOT NULL,
    last_name      VARCHAR(50)  NOT NULL,
    gender         CHAR(1)      NOT NULL CHECK (gender IN ('M', 'F', 'O')),
    dob            DATE         NOT NULL CHECK (date(dob) IS NOT NULL),
    email          VARCHAR(100) UNIQUE CHECK (email LIKE '%_@_%._%'),
    city           VARCHAR(50),
    year           INTEGER      NOT NULL CHECK (year BETWEEN 1 AND 4),
    dept_id        VARCHAR(10)  NOT NULL,
    admission_date DATE         NOT NULL DEFAULT (date('now')),
    FOREIGN KEY (dept_id) REFERENCES department(dept_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE student_phone (
    roll_no VARCHAR(10) NOT NULL,
    phone   VARCHAR(15) NOT NULL CHECK (length(phone) = 10 AND phone NOT GLOB '*[^0-9]*'),
    PRIMARY KEY (roll_no, phone),
    FOREIGN KEY (roll_no) REFERENCES student(roll_no)
        ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE subject (
    subject_id   VARCHAR(10)  PRIMARY KEY,
    subject_name VARCHAR(100) NOT NULL,
    credits      INTEGER      NOT NULL DEFAULT 4 CHECK (credits BETWEEN 1 AND 6),
    semester     INTEGER      NOT NULL CHECK (semester BETWEEN 1 AND 8),
    subject_type VARCHAR(10)  NOT NULL DEFAULT 'Theory' CHECK (subject_type IN ('Theory', 'Lab')),
    dept_id      VARCHAR(10)  NOT NULL,
    FOREIGN KEY (dept_id) REFERENCES department(dept_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);


CREATE TABLE teaches (
    subject_id    VARCHAR(10) NOT NULL,
    academic_year VARCHAR(9)  NOT NULL DEFAULT '2026-27',
    faculty_id    VARCHAR(10) NOT NULL,
    PRIMARY KEY (subject_id, academic_year),
    FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE enrollment (
    roll_no     VARCHAR(10) NOT NULL,
    subject_id  VARCHAR(10) NOT NULL,
    enrolled_on DATE        NOT NULL DEFAULT (date('now')),
    PRIMARY KEY (roll_no, subject_id),
    FOREIGN KEY (roll_no) REFERENCES student(roll_no)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE class_session (
    session_id   INTEGER      PRIMARY KEY AUTOINCREMENT,
    subject_id   VARCHAR(10)  NOT NULL,
    faculty_id   VARCHAR(10)  NOT NULL,
    session_date DATE         NOT NULL CHECK (date(session_date) IS NOT NULL),
    start_time   TIME         NOT NULL CHECK (time(start_time) IS NOT NULL),
    topic        VARCHAR(200),
    UNIQUE (subject_id, session_date, start_time),
    FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);


CREATE TABLE attendance (
    session_id INTEGER     NOT NULL,
    roll_no    VARCHAR(10) NOT NULL,
    status     CHAR(1)     NOT NULL CHECK (status IN ('P', 'A')),
    marked_at  DATETIME    NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (session_id, roll_no),
    FOREIGN KEY (session_id) REFERENCES class_session(session_id)
        ON DELETE CASCADE,
    FOREIGN KEY (roll_no) REFERENCES student(roll_no)
        ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE leave_request (
    leave_id    INTEGER      PRIMARY KEY AUTOINCREMENT,
    roll_no     VARCHAR(10)  NOT NULL,
    from_date   DATE         NOT NULL CHECK (date(from_date) IS NOT NULL),
    to_date     DATE         NOT NULL CHECK (date(to_date) IS NOT NULL),
    leave_type  VARCHAR(15)  NOT NULL CHECK (leave_type IN ('Medical', 'Sports', 'Event', 'Personal')),
    reason      VARCHAR(200) NOT NULL,
    status      VARCHAR(10)  NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    reviewed_by VARCHAR(10),
    applied_on  DATE         NOT NULL DEFAULT (date('now')),
    CHECK (from_date <= to_date),
    FOREIGN KEY (roll_no) REFERENCES student(roll_no)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES faculty(faculty_id)
        ON UPDATE CASCADE ON DELETE SET NULL
);


CREATE TABLE exam_result (
    roll_no        VARCHAR(10)  NOT NULL,
    subject_id     VARCHAR(10)  NOT NULL,
    exam_type      VARCHAR(10)  NOT NULL CHECK (exam_type IN ('Internal', 'MidSem', 'EndSem')),
    marks_obtained DECIMAL(5,2) CHECK (marks_obtained >= 0),
    max_marks      INTEGER      NOT NULL CHECK (max_marks > 0),
    PRIMARY KEY (roll_no, subject_id, exam_type),
    CHECK (marks_obtained IS NULL OR marks_obtained <= max_marks),
    FOREIGN KEY (roll_no, subject_id) REFERENCES enrollment(roll_no, subject_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE defaulter_notice (
    notice_id      INTEGER      PRIMARY KEY AUTOINCREMENT,
    roll_no        VARCHAR(10)  NOT NULL,
    subject_id     VARCHAR(10)  NOT NULL,
    attendance_pct DECIMAL(5,2) NOT NULL CHECK (attendance_pct BETWEEN 0 AND 100),
    issued_on      DATE         NOT NULL DEFAULT (date('now')),
    status         VARCHAR(15)  NOT NULL DEFAULT 'Issued'
                   CHECK (status IN ('Issued', 'Acknowledged', 'Cleared')),
    UNIQUE (roll_no, subject_id, issued_on),
    FOREIGN KEY (roll_no, subject_id) REFERENCES enrollment(roll_no, subject_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE app_user (
    username      VARCHAR(30)  PRIMARY KEY,
    password_hash VARCHAR(128) NOT NULL,
    salt          VARCHAR(32)  NOT NULL,
    role          VARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'faculty')),
    faculty_id    VARCHAR(10)  UNIQUE,
    last_login    DATETIME,
    CHECK ((role = 'faculty') = (faculty_id IS NOT NULL)),
    FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE audit_log (
    log_id     INTEGER     PRIMARY KEY AUTOINCREMENT,
    table_name VARCHAR(30) NOT NULL,
    operation  VARCHAR(6)  NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    row_key    VARCHAR(60) NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    changed_at DATETIME    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
