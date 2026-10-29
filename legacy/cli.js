#!/usr/bin/env node

const readline = require('readline');
const { initDB, getMemoryDb, isMySQLConnected } = require('./db');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    await initDB();
    const db = getMemoryDb();

    while (true) {
        console.clear();
        console.log("===============================================================");
        console.log(" 🎓 COLLEGE STUDENT ATTENDANCE & DEFAULTER MANAGEMENT SYSTEM");
        console.log("    Database: " + (isMySQLConnected() ? "MySQL (Live Server)" : "Relational Database Engine"));
        console.log("===============================================================");
        console.log(" 1. 📋 View & Mark Daily Attendance (Teacher Portal)");
        console.log(" 2. 📊 View Student Attendance Summary & Percentages");
        console.log(" 3. ⚠️  View & Generate Detention / Defaulter List (< 75%)");
        console.log(" 4. 🗄️  Inspect Relational Tables (student, faculty, subject, etc.)");
        console.log(" 5. 👨‍🏫 View Faculty & Assigned Subjects");
        console.log(" 6. ❌ Exit");
        console.log("===============================================================");

        const choice = await question("👉 Enter your choice [1-6]: ");

        if (choice === '1') {
            console.log("\n--- 📋 TEACHER ATTENDANCE PORTAL ---");
            console.log("Available Subjects:");
            db.subject.forEach((s, idx) => console.log(`  ${idx + 1}. [${s.subject_id}] ${s.subject_name}`));
            
            const subIdx = parseInt(await question("\nSelect Subject (number): ")) - 1;
            const selectedSubject = db.subject[subIdx] || db.subject[0];

            const today = new Date().toISOString().slice(0, 10);
            const dateInput = await question(`Enter Date (default ${today}): `) || today;

            console.log(`\nMarking Attendance for Subject: ${selectedSubject.subject_name} (${dateInput})`);
            console.log("Enter '1' for Present, '0' for Absent:\n");

            for (const st of db.student) {
                const statusStr = await question(`  [${st.roll_no}] ${st.name} (1/0) [Default 1]: `);
                const status = statusStr.trim() === '0' ? 0 : 1;
                
                // Save attendance
                db.attendance = db.attendance.filter(a => !(a.date === dateInput && a.roll_no === st.roll_no));
                db.attendance.push({
                    attendance_id: db.attendance.length + 1,
                    roll_no: st.roll_no,
                    date: dateInput,
                    status: status
                });
            }
            console.log("\n✅ Attendance successfully saved to database!");
            await question("\nPress Enter to continue...");
        } else if (choice === '2') {
            console.log("\n--- 📊 STUDENT ATTENDANCE REPORT & PERCENTAGES ---");
            console.log("----------------------------------------------------------------------------------");
            console.log(String("Roll No").padEnd(10) + " | " + String("Name").padEnd(16) + " | " + String("Branch").padEnd(20) + " | Total | Attended | % Status");
            console.log("----------------------------------------------------------------------------------");
            
            db.student.forEach(st => {
                const att = db.attendance.filter(a => a.roll_no === st.roll_no);
                const total = att.length;
                const attended = att.filter(a => a.status === 1).length;
                const pct = total > 0 ? ((attended * 100.0) / total).toFixed(1) : "0.0";
                const badge = parseFloat(pct) < 75 ? "⚠️ DEFAULTER (<75%)" : "✅ Eligible";
                console.log(String(st.roll_no).padEnd(10) + " | " + String(st.name).padEnd(16) + " | " + String(st.branch).padEnd(20) + ` | ${String(total).padEnd(5)} | ${String(attended).padEnd(8)} | ${pct}% [${badge}]`);
            });
            console.log("----------------------------------------------------------------------------------");
            await question("\nPress Enter to continue...");
        } else if (choice === '3') {
            console.log("\n--- ⚠️ OFFICIAL DEFAULTER / DETENTION LIST ---");
            // Refresh defaulters
            const today = new Date().toISOString().slice(0, 10);
            db.defaulter_list = [];
            db.student.forEach(st => {
                const att = db.attendance.filter(a => a.roll_no === st.roll_no);
                if (att.length > 0) {
                    const attended = att.filter(a => a.status === 1).length;
                    const pct = Number(((attended * 100.0) / att.length).toFixed(2));
                    if (pct < 75.0) {
                        db.defaulter_list.push({
                            detention_id: db.defaulter_list.length + 1,
                            roll_no: st.roll_no,
                            subject_id: 'CS301',
                            attendance_percentage: pct,
                            status: 'Notice Issued',
                            date_flagged: today
                        });
                    }
                }
            });

            console.log("---------------------------------------------------------------------------------------");
            console.log("Det.ID | Roll No    | Student Name     | Subject | Att. Pct | Action Status");
            console.log("---------------------------------------------------------------------------------------");
            db.defaulter_list.forEach(d => {
                const st = db.student.find(s => s.roll_no === d.roll_no);
                console.log(String(d.detention_id).padEnd(6) + " | " + String(d.roll_no).padEnd(10) + " | " + String(st ? st.name : '').padEnd(16) + ` | ${String(d.subject_id).padEnd(7)} | ${String(d.attendance_percentage).padEnd(8)}% | ${d.status}`);
            });
            console.log("---------------------------------------------------------------------------------------");
            await question("\nPress Enter to continue...");
        } else if (choice === '4') {
            console.log("\nSelect Table to View: [1] student  [2] faculty  [3] subject  [4] attendance  [5] defaulter_list");
            const tblChoice = await question("Enter number [1-5]: ");
            const tblMap = { '1': 'student', '2': 'faculty', '3': 'subject', '4': 'attendance', '5': 'defaulter_list' };
            const tblName = tblMap[tblChoice] || 'student';

            console.log(`\n--- TABLE: ${tblName} ---`);
            console.table(db[tblName]);
            await question("\nPress Enter to continue...");
        } else if (choice === '5') {
            console.log("\n--- 👨‍🏫 FACULTY & ALLOCATED SUBJECTS ---");
            db.faculty.forEach(f => {
                const subs = db.subject.filter(s => s.faculty_id === f.faculty_id);
                console.log(`\n• ${f.name} [${f.faculty_id}] - Dept: ${f.department}`);
                subs.forEach(s => console.log(`   └─ Subject: [${s.subject_id}] ${s.subject_name}`));
            });
            await question("\nPress Enter to continue...");
        } else if (choice === '6') {
            console.log("\n👋 Exiting College DBMS. Thank you!");
            rl.close();
            process.exit(0);
        }
    }
}

main();
