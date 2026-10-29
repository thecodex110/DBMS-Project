"""
Interactive runner for Student Attendance & Defaulter Management System.
Runs seamlessly without requiring a separate MySQL server.
"""

import sqlite3
import os

DB_FILE = "college.db"

def run_project():
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    print("=" * 60)
    print("🎓 COLLEGE STUDENT ATTENDANCE & DEFAULTER SYSTEM")
    print("=" * 60)

    # 1. Create Tables
    print("\n[1/4] Creating database tables...")
    cursor.executescript("""
    CREATE TABLE student (
        roll_no TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        gender TEXT NOT NULL,
        blood_group TEXT,
        year INTEGER NOT NULL,
        branch TEXT NOT NULL
    );

    CREATE TABLE faculty (
        faculty_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        password TEXT NOT NULL
    );

    CREATE TABLE subject (
        subject_id TEXT PRIMARY KEY,
        subject_name TEXT NOT NULL,
        faculty_id TEXT NOT NULL,
        FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
    );

    CREATE TABLE attendance (
        attendance_id INTEGER PRIMARY KEY AUTOINCREMENT,
        roll_no TEXT NOT NULL,
        date TEXT NOT NULL,
        status INTEGER NOT NULL,
        FOREIGN KEY (roll_no) REFERENCES student(roll_no)
    );

    CREATE TABLE defaulter_list (
        detention_id INTEGER PRIMARY KEY AUTOINCREMENT,
        roll_no TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        attendance_percentage REAL NOT NULL,
        status TEXT NOT NULL,
        date_flagged TEXT NOT NULL,
        FOREIGN KEY (roll_no) REFERENCES student(roll_no),
        FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
    );
    """)
    print("✅ Tables created successfully!")

    # 2. Insert Sample Data
    print("\n[2/4] Inserting sample records...")
    cursor.executescript("""
    INSERT INTO faculty (faculty_id, name, department, password) VALUES
    ('FAC101', 'Dr. Ramesh Sharma', 'Computer Science', 'prof_ramesh@123'),
    ('FAC102', 'Prof. Sunita Patil', 'Information Technology', 'sunita_p#2024'),
    ('FAC103', 'Dr. Arvind Verma', 'Computer Science', 'arvind_v$89'),
    ('FAC104', 'Prof. Priya Nair', 'Electronics', 'priya_nair!99');

    INSERT INTO subject (subject_id, subject_name, faculty_id) VALUES
    ('CS301', 'Database Management Systems', 'FAC101'),
    ('CS302', 'Operating Systems', 'FAC103'),
    ('IT303', 'Computer Networks', 'FAC102'),
    ('EC304', 'Microprocessors & Microcontrollers', 'FAC104');

    INSERT INTO student (roll_no, name, gender, blood_group, year, branch) VALUES
    ('21CS001', 'Aarav Mehta', 'Male', 'O+', 3, 'Computer Science'),
    ('21CS002', 'Ananya Iyer', 'Female', 'B+', 3, 'Computer Science'),
    ('21CS003', 'Rohan Deshmukh', 'Male', 'A+', 3, 'Computer Science'),
    ('21IT004', 'Pooja Kulkarni', 'Female', 'AB+', 3, 'Information Technology'),
    ('21IT005', 'Varun Joshi', 'Male', 'O-', 3, 'Information Technology'),
    ('21EC006', 'Sneha Gupta', 'Female', 'A-', 3, 'Electronics'),
    ('21EC007', 'Kunal Shah', 'Male', 'B-', 3, 'Electronics');

    INSERT INTO attendance (roll_no, date, status) VALUES
    ('21CS001', '2026-09-01', 1), ('21CS001', '2026-09-02', 1), ('21CS001', '2026-09-03', 1), ('21CS001', '2026-09-04', 1), ('21CS001', '2026-09-05', 0),
    ('21CS002', '2026-09-01', 1), ('21CS002', '2026-09-02', 1), ('21CS002', '2026-09-03', 1), ('21CS002', '2026-09-04', 1), ('21CS002', '2026-09-05', 1),
    ('21CS003', '2026-09-01', 0), ('21CS003', '2026-09-02', 0), ('21CS003', '2026-09-03', 1), ('21CS003', '2026-09-04', 0), ('21CS003', '2026-09-05', 0),
    ('21IT004', '2026-09-01', 1), ('21IT004', '2026-09-02', 1), ('21IT004', '2026-09-03', 0), ('21IT004', '2026-09-04', 1), ('21IT004', '2026-09-05', 1),
    ('21IT005', '2026-09-01', 0), ('21IT005', '2026-09-02', 0), ('21IT005', '2026-09-03', 0), ('21IT005', '2026-09-04', 1), ('21IT005', '2026-09-05', 0),
    ('21EC006', '2026-09-01', 1), ('21EC006', '2026-09-02', 1), ('21EC006', '2026-09-03', 1), ('21EC006', '2026-09-04', 1), ('21EC006', '2026-09-05', 0),
    ('21EC007', '2026-09-01', 1), ('21EC007', '2026-09-02', 0), ('21EC007', '2026-09-03', 0), ('21EC007', '2026-09-04', 0), ('21EC007', '2026-09-05', 0);

    INSERT INTO defaulter_list (roll_no, subject_id, attendance_percentage, status, date_flagged) VALUES
    ('21CS003', 'CS301', 20.00, 'Under Review', '2026-09-06'),
    ('21IT005', 'IT303', 20.00, 'Notice Issued', '2026-09-06'),
    ('21EC007', 'EC304', 20.00, 'Parent Call Scheduled', '2026-09-06');
    """)
    conn.commit()
    print("✅ Sample data inserted successfully!")

    # 3. Running Analysis Queries
    print("\n[3/4] 📊 OVERALL STUDENT ATTENDANCE REPORT:")
    print("-" * 65)
    print(f"{'Roll No':<10} | {'Name':<16} | {'Branch':<22} | {'Total':<5} | {'Attended':<8} | {'Pct %':<6}")
    print("-" * 65)
    cursor.execute("""
        SELECT 
            s.roll_no,
            s.name,
            s.branch,
            COUNT(a.attendance_id) AS total_classes,
            SUM(CASE WHEN a.status = 1 THEN 1 ELSE 0 END) AS attended,
            ROUND((SUM(CASE WHEN a.status = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(a.attendance_id)), 2) AS percentage
        FROM student s
        LEFT JOIN attendance a ON s.roll_no = a.roll_no
        GROUP BY s.roll_no, s.name, s.branch;
    """)
    for row in cursor.fetchall():
        print(f"{row[0]:<10} | {row[1]:<16} | {row[2]:<22} | {row[3]:<5} | {row[4]:<8} | {row[5]:<6}")

    # 4. Defaulter List
    print("\n[4/4] ⚠️ DETENTION / DEFAULTER LIST (< 75% Attendance):")
    print("-" * 75)
    print(f"{'Det.ID':<6} | {'Roll No':<10} | {'Student Name':<16} | {'Subject':<25} | {'Pct %':<6} | {'Status':<15}")
    print("-" * 75)
    cursor.execute("""
        SELECT 
            d.detention_id,
            s.roll_no,
            s.name,
            sub.subject_name,
            d.attendance_percentage,
            d.status
        FROM defaulter_list d
        JOIN student s ON d.roll_no = s.roll_no
        JOIN subject sub ON d.subject_id = sub.subject_id;
    """)
    for row in cursor.fetchall():
        print(f"{row[0]:<6} | {row[1]:<10} | {row[2]:<16} | {row[3]:<25} | {row[4]:<6} | {row[5]:<15}")

    print("\n" + "=" * 60)
    print("✨ Demo execution complete! Database saved to college.db")
    print("=" * 60)

    conn.close()

if __name__ == "__main__":
    run_project()
