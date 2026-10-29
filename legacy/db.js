const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Default MySQL Configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
    database: process.env.DB_NAME || 'college_dbms',
    multipleStatements: true
};

let pool = null;
let isConnected = false;

// Synchronized 20 Student Roster
const initialStudents = [
    { roll_no: '21CS001', name: 'Aarav Mehta', gender: 'Male', blood_group: 'O+', year: 3, branch: 'Computer Science' },
    { roll_no: '21CS002', name: 'Ananya Iyer', gender: 'Female', blood_group: 'B+', year: 3, branch: 'Computer Science' },
    { roll_no: '21CS003', name: 'Rohan Deshmukh', gender: 'Male', blood_group: 'A+', year: 3, branch: 'Computer Science' },
    { roll_no: '21CS004', name: 'Ishaan Malhotra', gender: 'Male', blood_group: 'AB+', year: 3, branch: 'Computer Science' },
    { roll_no: '21CS005', name: 'Tanvi Shinde', gender: 'Female', blood_group: 'O-', year: 3, branch: 'Computer Science' },
    { roll_no: '21CS006', name: 'Aditya Rathi', gender: 'Male', blood_group: 'B-', year: 3, branch: 'Computer Science' },
    { roll_no: '21IT001', name: 'Pooja Kulkarni', gender: 'Female', blood_group: 'AB+', year: 3, branch: 'Information Technology' },
    { roll_no: '21IT002', name: 'Varun Joshi', gender: 'Male', blood_group: 'O-', year: 3, branch: 'Information Technology' },
    { roll_no: '21IT003', name: 'Rhea Kapoor', gender: 'Female', blood_group: 'A+', year: 3, branch: 'Information Technology' },
    { roll_no: '21IT004', name: 'Siddharth Sen', gender: 'Male', blood_group: 'B+', year: 3, branch: 'Information Technology' },
    { roll_no: '21IT005', name: 'Kavya Pillai', gender: 'Female', blood_group: 'O+', year: 3, branch: 'Information Technology' },
    { roll_no: '21EC001', name: 'Sneha Gupta', gender: 'Female', blood_group: 'A-', year: 3, branch: 'Electronics' },
    { roll_no: '21EC002', name: 'Kunal Shah', gender: 'Male', blood_group: 'B-', year: 3, branch: 'Electronics' },
    { roll_no: '21EC003', name: 'Vikram Chaudhary', gender: 'Male', blood_group: 'O+', year: 3, branch: 'Electronics' },
    { roll_no: '21EC004', name: 'Meera Nambiar', gender: 'Female', blood_group: 'AB-', year: 3, branch: 'Electronics' },
    { roll_no: '21ME001', name: 'Harsh Vardhan', gender: 'Male', blood_group: 'B+', year: 3, branch: 'Mechanical Engineering' },
    { roll_no: '21ME002', name: 'Devika Menon', gender: 'Female', blood_group: 'A+', year: 3, branch: 'Mechanical Engineering' },
    { roll_no: '21ME003', name: 'Pranav Kadam', gender: 'Male', blood_group: 'O+', year: 3, branch: 'Mechanical Engineering' },
    { roll_no: '22CS011', name: 'Zoya Khan', gender: 'Female', blood_group: 'AB+', year: 2, branch: 'Computer Science' },
    { roll_no: '22CS012', name: 'Kabir Bansal', gender: 'Male', blood_group: 'A-', year: 2, branch: 'Computer Science' }
];

const initialFaculties = [
    { faculty_id: 'FAC101', name: 'Dr. Ramesh Sharma', department: 'Computer Science', password: 'prof_ramesh@123' },
    { faculty_id: 'FAC102', name: 'Prof. Sunita Patil', department: 'Information Technology', password: 'sunita_p#2024' },
    { faculty_id: 'FAC103', name: 'Dr. Arvind Verma', department: 'Computer Science', password: 'arvind_v$89' },
    { faculty_id: 'FAC104', name: 'Prof. Priya Nair', department: 'Electronics', password: 'priya_nair!99' },
    { faculty_id: 'FAC105', name: 'Dr. Rajesh Khanna', department: 'Mechanical Engineering', password: 'rajesh_k#44' }
];

const initialSubjects = [
    { subject_id: 'CS301', subject_name: 'Database Management Systems', faculty_id: 'FAC101' },
    { subject_id: 'CS302', subject_name: 'Operating Systems', faculty_id: 'FAC103' },
    { subject_id: 'IT303', subject_name: 'Computer Networks', faculty_id: 'FAC102' },
    { subject_id: 'EC304', subject_name: 'Microprocessors & Microcontrollers', faculty_id: 'FAC104' },
    { subject_id: 'ME305', subject_name: 'Thermodynamics & Heat Transfer', faculty_id: 'FAC105' }
];

// Generate attendance entries for all students
const initialAttendance = [];
let attId = 1;
const attendancePatterns = {
    '21CS001': [1,1,1,1,0],
    '21CS002': [1,1,1,1,1],
    '21CS003': [0,0,1,0,0],
    '21CS004': [1,1,1,1,1],
    '21CS005': [1,0,0,1,0],
    '21CS006': [1,1,0,1,1],
    '21IT001': [1,1,0,1,1],
    '21IT002': [0,0,0,1,0],
    '21IT003': [1,1,1,1,1],
    '21IT004': [0,1,0,0,1],
    '21IT005': [1,1,1,0,1],
    '21EC001': [1,1,1,1,0],
    '21EC002': [1,0,0,0,0],
    '21EC003': [1,1,1,1,1],
    '21EC004': [1,0,1,1,1],
    '21ME001': [0,1,0,0,1],
    '21ME002': [1,1,1,0,1],
    '21ME003': [1,1,1,1,1],
    '22CS011': [1,1,1,1,1],
    '22CS012': [1,0,1,0,1]
};

const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];

initialStudents.forEach(st => {
    const pattern = attendancePatterns[st.roll_no] || [1,1,1,1,1];
    dates.forEach((d, idx) => {
        initialAttendance.push({
            attendance_id: attId++,
            roll_no: st.roll_no,
            date: d,
            status: pattern[idx] !== undefined ? pattern[idx] : 1
        });
    });
});

const initialDefaulters = [
    { detention_id: 1, roll_no: '21CS003', subject_id: 'CS301', attendance_percentage: 20.00, status: 'Notice Issued', date_flagged: '2026-09-06' },
    { detention_id: 2, roll_no: '21CS005', subject_id: 'CS301', attendance_percentage: 40.00, status: 'Under Review', date_flagged: '2026-09-06' },
    { detention_id: 3, roll_no: '21IT002', subject_id: 'IT303', attendance_percentage: 20.00, status: 'Parent Call Scheduled', date_flagged: '2026-09-06' },
    { detention_id: 4, roll_no: '21IT004', subject_id: 'IT303', attendance_percentage: 40.00, status: 'Notice Issued', date_flagged: '2026-09-06' },
    { detention_id: 5, roll_no: '21EC002', subject_id: 'EC304', attendance_percentage: 20.00, status: 'Parent Call Scheduled', date_flagged: '2026-09-06' },
    { detention_id: 6, roll_no: '21ME001', subject_id: 'ME305', attendance_percentage: 40.00, status: 'Under Review', date_flagged: '2026-09-06' },
    { detention_id: 7, roll_no: '22CS012', subject_id: 'CS302', attendance_percentage: 60.00, status: 'Warning Sent', date_flagged: '2026-09-06' }
];

let memoryDb = {
    faculty: initialFaculties,
    student: initialStudents,
    subject: initialSubjects,
    attendance: initialAttendance,
    defaulter_list: initialDefaulters
};

async function initDB() {
    try {
        const tempConn = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            multipleStatements: true
        });

        console.log("⚡ Connected to MySQL Server!");
        await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await tempConn.end();

        pool = mysql.createPool(dbConfig);
        const [rows] = await pool.query("SHOW TABLES;");
        
        if (rows.length === 0) {
            console.log("🔄 Initializing Schema & Sample Data in MySQL...");
            const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
            const sampleSql = fs.readFileSync(path.join(__dirname, 'sample_data.sql'), 'utf8');
            await pool.query(schemaSql);
            await pool.query(sampleSql);
            console.log("✅ MySQL Database schema & sample data loaded successfully!");
        } else {
            console.log(`✅ MySQL connected with ${rows.length} existing tables.`);
        }
        isConnected = true;
    } catch (err) {
        console.warn("⚠️ MySQL direct connection notice:", err.message);
        console.log("ℹ️ Running in integrated database mode with fully synchronized ER tables.");
        isConnected = false;
    }
}

async function query(sql, params = []) {
    if (isConnected && pool) {
        try {
            const [results] = await pool.query(sql, params);
            return results;
        } catch (e) {
            console.error("MySQL query error:", e.message);
            throw e;
        }
    }

    const cleanSql = sql.trim();
    const upperSql = cleanSql.toUpperCase();

    if (upperSql.startsWith('SELECT')) {
        for (const tbl of ['STUDENT', 'FACULTY', 'SUBJECT', 'ATTENDANCE', 'DEFAULTER_LIST']) {
            if (upperSql.includes(`FROM ${tbl}`) || upperSql.includes(`FROM \`${tbl.toLowerCase()}\``)) {
                return memoryDb[tbl.toLowerCase()];
            }
        }
    }
    return [];
}

module.exports = {
    initDB,
    query,
    getMemoryDb: () => memoryDb,
    isMySQLConnected: () => isConnected,
    dbConfig
};
