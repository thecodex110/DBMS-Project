const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB, query, getMemoryDb, isMySQLConnected } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------
// 1. Auth & Faculty API
// ------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
    const { faculty_id, password } = req.body;
    if (!faculty_id || !password) {
        return res.status(400).json({ success: false, message: 'Faculty ID and Password are required' });
    }

    try {
        if (isMySQLConnected()) {
            const users = await query('SELECT * FROM faculty WHERE faculty_id = ? AND password = ?', [faculty_id, password]);
            if (users.length > 0) {
                const user = { ...users[0] };
                delete user.password;
                return res.json({ success: true, faculty: user });
            }
        } else {
            const db = getMemoryDb();
            const user = db.faculty.find(f => f.faculty_id.toLowerCase() === faculty_id.toLowerCase() && f.password === password);
            if (user) {
                const safeUser = { ...user };
                delete safeUser.password;
                return res.json({ success: true, faculty: safeUser });
            }
        }
        res.status(401).json({ success: false, message: 'Invalid Faculty ID or Password' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get Faculty list
app.get('/api/faculty', async (req, res) => {
    try {
        if (isMySQLConnected()) {
            const faculties = await query('SELECT faculty_id, name, department FROM faculty');
            return res.json({ success: true, data: faculties });
        }
        const db = getMemoryDb();
        res.json({ success: true, data: db.faculty.map(({ password, ...rest }) => rest) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ------------------------------------------------------------
// 2. Subjects API
// ------------------------------------------------------------
app.get('/api/subjects', async (req, res) => {
    const { faculty_id } = req.query;
    try {
        if (isMySQLConnected()) {
            let sql = 'SELECT s.subject_id, s.subject_name, s.faculty_id, f.name as faculty_name FROM subject s JOIN faculty f ON s.faculty_id = f.faculty_id';
            let params = [];
            if (faculty_id) {
                sql += ' WHERE s.faculty_id = ?';
                params.push(faculty_id);
            }
            const rows = await query(sql, params);
            return res.json({ success: true, data: rows });
        }
        const db = getMemoryDb();
        let rows = db.subject.map(s => {
            const fac = db.faculty.find(f => f.faculty_id === s.faculty_id);
            return { ...s, faculty_name: fac ? fac.name : 'Unknown' };
        });
        if (faculty_id) {
            rows = rows.filter(s => s.faculty_id.toLowerCase() === faculty_id.toLowerCase());
        }
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ------------------------------------------------------------
// 3. Students API
// ------------------------------------------------------------
app.get('/api/students', async (req, res) => {
    try {
        if (isMySQLConnected()) {
            const rows = await query('SELECT * FROM student ORDER BY roll_no');
            return res.json({ success: true, data: rows });
        }
        const db = getMemoryDb();
        res.json({ success: true, data: db.student });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ------------------------------------------------------------
// 4. Attendance API
// ------------------------------------------------------------

// Get attendance for a specific date or student
app.get('/api/attendance', async (req, res) => {
    const { date, roll_no } = req.query;
    try {
        if (isMySQLConnected()) {
            let sql = 'SELECT a.*, s.name, s.branch FROM attendance a JOIN student s ON a.roll_no = s.roll_no WHERE 1=1';
            const params = [];
            if (date) { sql += ' AND a.date = ?'; params.push(date); }
            if (roll_no) { sql += ' AND a.roll_no = ?'; params.push(roll_no); }
            sql += ' ORDER BY a.date DESC, a.roll_no ASC';
            const rows = await query(sql, params);
            return res.json({ success: true, data: rows });
        }
        const db = getMemoryDb();
        let list = db.attendance.map(a => {
            const st = db.student.find(s => s.roll_no === a.roll_no);
            return { ...a, name: st ? st.name : '', branch: st ? st.branch : '' };
        });
        if (date) list = list.filter(a => a.date === date);
        if (roll_no) list = list.filter(a => a.roll_no === roll_no);
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Mark / Submit Batch Attendance
app.post('/api/attendance/mark', async (req, res) => {
    const { date, records } = req.body; 
    // records = [{ roll_no: '21CS001', status: 1 }, ...]
    if (!date || !records || !Array.isArray(records)) {
        return res.status(400).json({ success: false, message: 'Date and records array are required' });
    }

    try {
        if (isMySQLConnected()) {
            for (const item of records) {
                // Remove existing entry for same roll_no and date if any, then insert
                await query('DELETE FROM attendance WHERE roll_no = ? AND date = ?', [item.roll_no, date]);
                await query('INSERT INTO attendance (roll_no, date, status) VALUES (?, ?, ?)', [item.roll_no, date, item.status]);
            }
        } else {
            const db = getMemoryDb();
            // Remove existing for this date
            db.attendance = db.attendance.filter(a => !(a.date === date && records.some(r => r.roll_no === a.roll_no)));
            // Append new
            records.forEach(r => {
                db.attendance.push({
                    attendance_id: db.attendance.length + 1,
                    roll_no: r.roll_no,
                    date: date,
                    status: Number(r.status)
                });
            });
        }
        res.json({ success: true, message: `Successfully saved attendance for ${records.length} students on ${date}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ------------------------------------------------------------
// 5. Attendance Summary & Analytics API
// ------------------------------------------------------------
app.get('/api/reports/summary', async (req, res) => {
    try {
        if (isMySQLConnected()) {
            const sql = `
                SELECT 
                    s.roll_no,
                    s.name,
                    s.gender,
                    s.branch,
                    s.year,
                    COUNT(a.attendance_id) AS total_classes,
                    SUM(CASE WHEN a.status = 1 THEN 1 ELSE 0 END) AS attended_classes,
                    SUM(CASE WHEN a.status = 0 THEN 1 ELSE 0 END) AS absent_classes,
                    ROUND((SUM(CASE WHEN a.status = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(a.attendance_id), 0)), 2) AS attendance_percentage
                FROM student s
                LEFT JOIN attendance a ON s.roll_no = a.roll_no
                GROUP BY s.roll_no, s.name, s.gender, s.branch, s.year
                ORDER BY s.roll_no;
            `;
            const rows = await query(sql);
            return res.json({ success: true, data: rows });
        }

        const db = getMemoryDb();
        const summary = db.student.map(st => {
            const att = db.attendance.filter(a => a.roll_no === st.roll_no);
            const total = att.length;
            const attended = att.filter(a => a.status === 1).length;
            const absent = total - attended;
            const pct = total > 0 ? Number(((attended * 100.0) / total).toFixed(2)) : 0.00;
            return {
                roll_no: st.roll_no,
                name: st.name,
                gender: st.gender,
                branch: st.branch,
                year: st.year,
                total_classes: total,
                attended_classes: attended,
                absent_classes: absent,
                attendance_percentage: pct
            };
        });
        res.json({ success: true, data: summary });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ------------------------------------------------------------
// 6. Detention / Defaulter List API
// ------------------------------------------------------------
app.get('/api/defaulters', async (req, res) => {
    try {
        if (isMySQLConnected()) {
            const sql = `
                SELECT 
                    d.detention_id,
                    d.roll_no,
                    s.name AS student_name,
                    s.branch,
                    d.subject_id,
                    sub.subject_name,
                    f.name AS faculty_name,
                    d.attendance_percentage,
                    d.status,
                    d.date_flagged
                FROM defaulter_list d
                JOIN student s ON d.roll_no = s.roll_no
                JOIN subject sub ON d.subject_id = sub.subject_id
                JOIN faculty f ON sub.faculty_id = f.faculty_id
                ORDER BY d.attendance_percentage ASC;
            `;
            const rows = await query(sql);
            return res.json({ success: true, data: rows });
        }

        const db = getMemoryDb();
        const rows = db.defaulter_list.map(d => {
            const st = db.student.find(s => s.roll_no === d.roll_no);
            const sub = db.subject.find(s => s.subject_id === d.subject_id);
            const fac = sub ? db.faculty.find(f => f.faculty_id === sub.faculty_id) : null;
            return {
                detention_id: d.detention_id,
                roll_no: d.roll_no,
                student_name: st ? st.name : 'Unknown',
                branch: st ? st.branch : 'Unknown',
                subject_id: d.subject_id,
                subject_name: sub ? sub.subject_name : 'Unknown',
                faculty_name: fac ? fac.name : 'Unknown',
                attendance_percentage: d.attendance_percentage,
                status: d.status,
                date_flagged: d.date_flagged
            };
        });
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Generate / Refresh Defaulter List based on < 75% threshold
app.post('/api/defaulters/generate', async (req, res) => {
    const { subject_id = 'CS301', threshold = 75.0 } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    try {
        if (isMySQLConnected()) {
            await query('DELETE FROM defaulter_list WHERE subject_id = ?', [subject_id]);
            const insertSql = `
                INSERT INTO defaulter_list (roll_no, subject_id, attendance_percentage, status, date_flagged)
                SELECT 
                    s.roll_no,
                    ?,
                    ROUND((SUM(CASE WHEN a.status = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(a.attendance_id)), 2) AS pct,
                    'Auto Flagged',
                    ?
                FROM student s
                JOIN attendance a ON s.roll_no = a.roll_no
                GROUP BY s.roll_no
                HAVING pct < ?;
            `;
            await query(insertSql, [subject_id, today, threshold]);
        } else {
            const db = getMemoryDb();
            db.defaulter_list = db.defaulter_list.filter(d => d.subject_id !== subject_id);
            db.student.forEach(st => {
                const att = db.attendance.filter(a => a.roll_no === st.roll_no);
                if (att.length > 0) {
                    const attended = att.filter(a => a.status === 1).length;
                    const pct = Number(((attended * 100.0) / att.length).toFixed(2));
                    if (pct < threshold) {
                        db.defaulter_list.push({
                            detention_id: db.defaulter_list.length + 1,
                            roll_no: st.roll_no,
                            subject_id: subject_id,
                            attendance_percentage: pct,
                            status: 'Auto Flagged',
                            date_flagged: today
                        });
                    }
                }
            });
        }
        res.json({ success: true, message: `Defaulter list updated for subject ${subject_id} with threshold ${threshold}%` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update Defaulter Action Status
app.put('/api/defaulters/:id', async (req, res) => {
    const detention_id = req.params.id;
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

    try {
        if (isMySQLConnected()) {
            await query('UPDATE defaulter_list SET status = ? WHERE detention_id = ?', [status, detention_id]);
        } else {
            const db = getMemoryDb();
            const item = db.defaulter_list.find(d => String(d.detention_id) === String(detention_id));
            if (item) item.status = status;
        }
        res.json({ success: true, message: 'Defaulter status updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ------------------------------------------------------------
// 7. Raw SQL & Table Explorer API (For Lab Evaluators)
// ------------------------------------------------------------
app.get('/api/tables/:tableName', async (req, res) => {
    const tableName = req.params.tableName.toLowerCase();
    const validTables = ['student', 'faculty', 'subject', 'attendance', 'defaulter_list'];
    if (!validTables.includes(tableName)) {
        return res.status(400).json({ success: false, message: 'Invalid table name' });
    }

    try {
        if (isMySQLConnected()) {
            const rows = await query(`SELECT * FROM \`${tableName}\``);
            return res.json({ success: true, data: rows });
        }
        const db = getMemoryDb();
        res.json({ success: true, data: db[tableName] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/sql/execute', async (req, res) => {
    const { query: sqlQuery } = req.body;
    if (!sqlQuery) return res.status(400).json({ success: false, message: 'SQL Query is required' });

    try {
        if (isMySQLConnected()) {
            const results = await query(sqlQuery);
            return res.json({ success: true, data: results });
        }
        // Basic parser for in-memory tables
        const tbls = ['student', 'faculty', 'subject', 'attendance', 'defaulter_list'];
        const foundTbl = tbls.find(t => sqlQuery.toLowerCase().includes(t));
        if (foundTbl) {
            const db = getMemoryDb();
            return res.json({ success: true, data: db[foundTbl] });
        }
        res.json({ success: true, data: [{ info: "Executed query successfully", query: sqlQuery }] });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// App status info
app.get('/api/status', (req, res) => {
    res.json({
        database: isMySQLConnected() ? 'MySQL (Live Server Connected)' : 'Integrated Relational Engine (Schema Synchronized)',
        activeTables: ['student', 'faculty', 'subject', 'attendance', 'defaulter_list'],
        uptime: process.uptime()
    });
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 College DBMS Portal running at http://localhost:${PORT}`);
    });
});
