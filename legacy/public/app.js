// ============================================================
// College DBMS Frontend Application Logic
// ============================================================

// State
let currentFaculty = {
    faculty_id: 'FAC101',
    name: 'Dr. Ramesh Sharma',
    department: 'Computer Science'
};

let students = [];
let subjects = [];
let currentAttendanceState = {}; // { [roll_no]: 1 or 0 }

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
    // Set default date to today
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('attendanceDate').value = today;

    initTabs();
    initEventListeners();
    await checkDatabaseStatus();
    await loadInitialData();
});

// ------------------------------------------------------------
// 1. Initial Data Loading
// ------------------------------------------------------------
async function checkDatabaseStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('dbStatusText').textContent = data.database;
    } catch (e) {
        document.getElementById('dbStatusText').textContent = 'Relational Engine Online';
    }
}

async function loadInitialData() {
    await loadSubjects();
    await loadStudentsForAttendance();
    await loadAttendanceSummary();
    await loadDefaulterList();
    await loadRawTable('student');
}

// ------------------------------------------------------------
// 2. Navigation Tabs
// ------------------------------------------------------------
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            // Refresh tab specific data
            if (tabId === 'summary-tab') loadAttendanceSummary();
            if (tabId === 'defaulters-tab') loadDefaulterList();
            if (tabId === 'tables-tab') loadRawTable('student');
        });
    });
}

// ------------------------------------------------------------
// 3. Mark Attendance Features
// ------------------------------------------------------------
async function loadSubjects() {
    try {
        const res = await fetch(`/api/subjects?faculty_id=${currentFaculty.faculty_id}`);
        const result = await res.json();
        const select = document.getElementById('subjectSelect');
        select.innerHTML = '';

        if (result.success && result.data.length > 0) {
            subjects = result.data;
            subjects.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub.subject_id;
                opt.textContent = `${sub.subject_id} - ${sub.subject_name}`;
                select.appendChild(opt);
            });
        } else {
            // Fallback: all subjects
            const allRes = await fetch('/api/subjects');
            const allData = await allRes.json();
            allData.data.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub.subject_id;
                opt.textContent = `${sub.subject_id} - ${sub.subject_name} (${sub.faculty_name})`;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        showToast('Error loading subjects', 'danger');
    }
}

async function loadStudentsForAttendance() {
    try {
        const res = await fetch('/api/students');
        const result = await res.json();
        if (result.success) {
            students = result.data;
            const date = document.getElementById('attendanceDate').value;
            
            // Check if attendance already exists for this date
            const attRes = await fetch(`/api/attendance?date=${date}`);
            const attData = await attRes.json();
            const existingMap = {};
            if (attData.success && attData.data.length > 0) {
                attData.data.forEach(a => { existingMap[a.roll_no] = a.status; });
            }

            // Populate attendance state
            currentAttendanceState = {};
            students.forEach(s => {
                currentAttendanceState[s.roll_no] = existingMap[s.roll_no] !== undefined ? existingMap[s.roll_no] : 1;
            });

            renderAttendanceTable();
        }
    } catch (err) {
        showToast('Error loading students', 'danger');
    }
}

function renderAttendanceTable() {
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = '';

    let present = 0;
    let absent = 0;

    students.forEach(st => {
        const isPresent = currentAttendanceState[st.roll_no] === 1;
        if (isPresent) present++; else absent++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${st.roll_no}</strong></td>
            <td>${st.name}</td>
            <td>${st.gender}</td>
            <td><span class="badge badge-neutral">${st.blood_group || 'N/A'}</span></td>
            <td>${st.branch}</td>
            <td>Year ${st.year}</td>
            <td style="text-align: center;">
                <div class="attendance-toggle-group">
                    <button type="button" class="toggle-pill present ${isPresent ? 'active' : ''}" onclick="setAttendance('${st.roll_no}', 1)">
                        ✓ Present
                    </button>
                    <button type="button" class="toggle-pill absent ${!isPresent ? 'active' : ''}" onclick="setAttendance('${st.roll_no}', 0)">
                        ✗ Absent
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('presentCount').textContent = `Present: ${present}`;
    document.getElementById('absentCount').textContent = `Absent: ${absent}`;
    document.getElementById('totalStudentsCount').textContent = `Total: ${students.length}`;
}

window.setAttendance = function(roll_no, status) {
    currentAttendanceState[roll_no] = status;
    renderAttendanceTable();
};

async function saveAttendance() {
    const date = document.getElementById('attendanceDate').value;
    const records = Object.keys(currentAttendanceState).map(roll_no => ({
        roll_no: roll_no,
        status: currentAttendanceState[roll_no]
    }));

    try {
        const res = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, records })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            loadAttendanceSummary();
        } else {
            showToast(data.message, 'danger');
        }
    } catch (e) {
        showToast('Failed to save attendance', 'danger');
    }
}

// ------------------------------------------------------------
// 4. Attendance Summary & Defaulter Calculations
// ------------------------------------------------------------
async function loadAttendanceSummary() {
    try {
        const res = await fetch('/api/reports/summary');
        const result = await res.json();
        if (!result.success) return;

        const data = result.data;
        const tbody = document.getElementById('summaryTableBody');
        tbody.innerHTML = '';

        let totalStudents = data.length;
        let sumPct = 0;
        let defaulters = 0;

        data.forEach(item => {
            const pct = item.attendance_percentage || 0;
            sumPct += pct;
            const isDefaulter = pct < 75.0;
            if (isDefaulter) defaulters++;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.roll_no}</strong></td>
                <td>${item.name}</td>
                <td>${item.branch}</td>
                <td>Year ${item.year}</td>
                <td>${item.total_classes}</td>
                <td><span class="badge badge-success">${item.attended_classes}</span></td>
                <td><span class="badge badge-danger">${item.absent_classes}</span></td>
                <td>
                    <div style="font-weight: 700; color: ${isDefaulter ? '#ef4444' : '#10b981'};">${pct}%</div>
                    <div class="pct-bar-container">
                        <div class="pct-bar-fill ${isDefaulter ? 'pct-red' : 'pct-green'}" style="width: ${pct}%"></div>
                    </div>
                </td>
                <td>
                    <span class="badge ${isDefaulter ? 'badge-danger' : 'badge-success'}">
                        ${isDefaulter ? '⚠️ Defaulter (<75%)' : '✅ Eligible'}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Update KPIs
        document.getElementById('kpiTotalStudents').textContent = totalStudents;
        document.getElementById('kpiAvgAttendance').textContent = totalStudents > 0 ? (sumPct / totalStudents).toFixed(1) + '%' : '0%';
        document.getElementById('kpiTotalDefaulters').textContent = defaulters;
    } catch (e) {
        console.error("Error loading summary:", e);
    }
}

// ------------------------------------------------------------
// 5. Defaulter List Management
// ------------------------------------------------------------
async function loadDefaulterList() {
    try {
        const res = await fetch('/api/defaulters');
        const result = await res.json();
        if (!result.success) return;

        const tbody = document.getElementById('defaultersTableBody');
        tbody.innerHTML = '';

        if (result.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: #94a3b8;">No defaulters currently flagged! All students are above attendance requirements.</td></tr>`;
            return;
        }

        result.data.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${d.detention_id}</td>
                <td><strong>${d.roll_no}</strong></td>
                <td>${d.student_name}</td>
                <td>${d.branch}</td>
                <td>${d.subject_name || d.subject_id}</td>
                <td>${d.faculty_name || 'Assigned Faculty'}</td>
                <td><strong style="color: #ef4444;">${d.attendance_percentage}%</strong></td>
                <td>
                    <select class="form-control" onchange="updateDefaulterStatus(${d.detention_id}, this.value)" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
                        <option value="Under Review" ${d.status === 'Under Review' ? 'selected' : ''}>Under Review</option>
                        <option value="Notice Issued" ${d.status === 'Notice Issued' ? 'selected' : ''}>Notice Issued</option>
                        <option value="Parent Call Scheduled" ${d.status === 'Parent Call Scheduled' ? 'selected' : ''}>Parent Call Scheduled</option>
                        <option value="Cleared" ${d.status === 'Cleared' ? 'selected' : ''}>Cleared</option>
                    </select>
                </td>
                <td>${d.date_flagged}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="printNotice('${d.roll_no}', '${d.student_name}', '${d.attendance_percentage}')">🖨️ Notice</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Error loading defaulters:", e);
    }
}

window.updateDefaulterStatus = async function(id, status) {
    try {
        const res = await fetch(`/api/defaulters/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Defaulter action updated', 'success');
        }
    } catch (e) {
        showToast('Error updating status', 'danger');
    }
};

window.printNotice = function(roll_no, name, pct) {
    alert(`📢 OFFICIAL ATTENDANCE DEFAULTER NOTICE\n\nStudent: ${name} (${roll_no})\nAttendance: ${pct}%\n\nYou are hereby notified that your attendance is below the mandatory 75% requirement. Report to the HOD office immediately.`);
};

async function autoGenerateDefaulters() {
    const subjectId = document.getElementById('subjectSelect').value || 'CS301';
    try {
        const res = await fetch('/api/defaulters/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject_id: subjectId, threshold: 75.0 })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            loadDefaulterList();
            loadAttendanceSummary();
        }
    } catch (e) {
        showToast('Error generating defaulter list', 'danger');
    }
}

// ------------------------------------------------------------
// 6. SQL Table Explorer (For Lab Evaluation)
// ------------------------------------------------------------
async function loadRawTable(tableName) {
    const btns = document.querySelectorAll('#tableSelectorTabs button');
    btns.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-table') === tableName);
    });

    try {
        const res = await fetch(`/api/tables/${tableName}`);
        const result = await res.json();
        if (!result.success) return;

        const data = result.data;
        document.getElementById('currentTableBadge').textContent = `Table: ${tableName}`;
        document.getElementById('currentTableCount').textContent = `${data.length} records`;

        const thead = document.getElementById('rawTableHead');
        const tbody = document.getElementById('rawTableBody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td style="text-align:center; color:#94a3b8;">Table is currently empty</td></tr>`;
            return;
        }

        const headers = Object.keys(data[0]);
        const headerRow = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        data.forEach(row => {
            const tr = document.createElement('tr');
            headers.forEach(h => {
                const td = document.createElement('td');
                td.textContent = row[h] !== null ? row[h] : 'NULL';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Error loading table:", e);
    }
}

// ------------------------------------------------------------
// 7. Interactive SQL Console
// ------------------------------------------------------------
async function executeCustomSql() {
    const sql = document.getElementById('sqlInput').value.trim();
    if (!sql) return;

    try {
        const res = await fetch('/api/sql/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sql })
        });
        const result = await res.json();

        const thead = document.getElementById('sqlResultHead');
        const tbody = document.getElementById('sqlResultBody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        if (result.success && result.data.length > 0) {
            const headers = Object.keys(result.data[0]);
            const headerRow = document.createElement('tr');
            headers.forEach(h => {
                const th = document.createElement('th');
                th.textContent = h;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);

            result.data.forEach(row => {
                const tr = document.createElement('tr');
                headers.forEach(h => {
                    const td = document.createElement('td');
                    td.textContent = row[h] !== null ? row[h] : 'NULL';
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            showToast(`Query returned ${result.data.length} row(s)`, 'success');
        } else {
            tbody.innerHTML = `<tr><td style="color: #94a3b8;">Query executed with 0 results.</td></tr>`;
        }
    } catch (e) {
        showToast('SQL Execution Error', 'danger');
    }
}

// ------------------------------------------------------------
// 8. Event Listeners & UI Helpers
// ------------------------------------------------------------
function initEventListeners() {
    // Attendance Actions
    document.getElementById('markAllPresentBtn').addEventListener('click', () => {
        students.forEach(s => currentAttendanceState[s.roll_no] = 1);
        renderAttendanceTable();
    });

    document.getElementById('markAllAbsentBtn').addEventListener('click', () => {
        students.forEach(s => currentAttendanceState[s.roll_no] = 0);
        renderAttendanceTable();
    });

    document.getElementById('submitAttendanceBtn').addEventListener('click', saveAttendance);
    document.getElementById('attendanceDate').addEventListener('change', loadStudentsForAttendance);
    document.getElementById('recalcDefaultersBtn').addEventListener('click', autoGenerateDefaulters);

    // Table Selector
    document.querySelectorAll('#tableSelectorTabs button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tbl = btn.getAttribute('data-table');
            loadRawTable(tbl);
        });
    });

    // SQL Console
    document.getElementById('runSqlBtn').addEventListener('click', executeCustomSql);
    document.querySelectorAll('.sample-sql').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('sqlInput').value = btn.getAttribute('data-sql');
            executeCustomSql();
        });
    });

    // Faculty Switcher Modal
    document.getElementById('switchFacultyBtn').addEventListener('click', () => {
        document.getElementById('loginModal').classList.add('active');
    });

    document.getElementById('closeModalBtn').addEventListener('click', () => {
        document.getElementById('loginModal').classList.remove('active');
    });

    document.getElementById('cancelLoginBtn').addEventListener('click', () => {
        document.getElementById('loginModal').classList.remove('active');
    });

    document.getElementById('quickFacultySelect').addEventListener('change', (e) => {
        const [id, pass] = e.target.value.split('|');
        document.getElementById('loginFacultyId').value = id;
        document.getElementById('loginPassword').value = pass;
    });

    document.getElementById('confirmLoginBtn').addEventListener('click', async () => {
        const id = document.getElementById('loginFacultyId').value.trim();
        const pass = document.getElementById('loginPassword').value.trim();

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ faculty_id: id, password: pass })
            });
            const data = await res.json();
            if (data.success) {
                currentFaculty = data.faculty;
                document.getElementById('navFacultyName').textContent = currentFaculty.name;
                document.getElementById('navFacultyDept').textContent = `${currentFaculty.department} (${currentFaculty.faculty_id})`;
                document.getElementById('loginModal').classList.remove('active');
                showToast(`Welcome back, ${currentFaculty.name}!`, 'success');
                await loadSubjects();
            } else {
                showToast(data.message, 'danger');
            }
        } catch (e) {
            showToast('Sign in failed', 'danger');
        }
    });

    // Summary Search Filter
    document.getElementById('summarySearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#summaryTableBody tr');
        rows.forEach(r => {
            const text = r.textContent.toLowerCase();
            r.style.display = text.includes(query) ? '' : 'none';
        });
    });
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}
