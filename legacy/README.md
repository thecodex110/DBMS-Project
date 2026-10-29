# 🎓 College Student Attendance & Defaulter DBMS

A fully functional, interactive Relational Database Management System (DBMS) project built strictly according to the college **ER Diagram**.

---

## 📸 System Architecture & ER Entities

The database consists of **5 relational tables** modeled directly from the ER diagram:

1. **`student`**: `roll_no` (PK), `name`, `gender`, `blood_group`, `year`, `branch`
2. **`faculty`**: `faculty_id` (PK / Login ID), `name`, `department`, `password`
3. **`subject`**: `subject_id` (PK), `subject_name`, `faculty_id` (FK $\rightarrow$ `faculty`)
4. **`attendance`**: `attendance_id` (PK), `roll_no` (FK $\rightarrow$ `student`), `date`, `status` (1 = Present, 0 = Absent)
5. **`defaulter_list`**: `detention_id` (PK), `roll_no` (FK $\rightarrow$ `student`), `subject_id` (FK $\rightarrow$ `subject`), `attendance_percentage`, `status`, `date_flagged`

---

## 🚀 How to Run the Project

### Option A: Launch the Web Dashboard (Recommended)

1. Start the application server:
   ```bash
   npm start
   ```
2. Open your browser at:
   **[http://localhost:3000](http://localhost:3000)**

#### Web Features:
- 👨‍🏫 **Teacher Sign In & Portal**: Switch between faculties (`Dr. Ramesh Sharma`, `Prof. Sunita Patil`, etc.).
- 📋 **Live Attendance Sheet**: Mark individual students or use "Mark All Present / Absent", pick date, and save directly.
- 📊 **Attendance Analytics & Defaulters**: Live calculated percentage with color badges (>75% Green, <75% Red).
- ⚠️ **Defaulter List Manager**: Auto-generate detention list for students `< 75%`, update administrative action status.
- 🗄️ **Relational Table Explorer**: View raw rows of all 5 tables for lab evaluation.
- ⚡ **Interactive SQL Console**: Run live custom `SELECT` queries in the browser.

---

### Option B: Run in Terminal (CLI Mode)

To run the interactive command-line interface directly in your terminal:
```bash
npm run cli
```
*(Provides menu options to mark attendance, view student percentages, and inspect tables).*

---

### Option C: Import Pure SQL in MySQL Server

If your evaluator requests raw SQL script execution in MySQL terminal:
```bash
mysql -u root -p
```
Inside MySQL prompt:
```sql
SOURCE schema.sql;
SOURCE sample_data.sql;
SOURCE views_and_procedures.sql;
SOURCE queries.sql;
```

---

## 📂 Project Structure

```
DBMS/
├── schema.sql                # Complete DDL tables with PK, FK, & CHECK constraints
├── sample_data.sql           # Realistic college records (DML)
├── queries.sql               # Joins, subqueries, grouping & percentage calculations
├── views_and_procedures.sql  # Stored procedures & views for defaulter automation
├── server.js                 # Express REST API backend
├── db.js                     # MySQL connection & database layer
├── cli.js                    # Interactive Terminal CLI runner
├── public/                   # Sleek web UI (HTML5, CSS3, JavaScript)
├── package.json              # Project dependencies & runnable scripts
└── README.md                 # Project documentation
```
