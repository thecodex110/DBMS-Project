-- ============================================================================
-- 🎓 COLLEGE ATTENDANCE & MULTI-TIER DEFAULTER MANAGEMENT SYSTEM
-- Advanced Analytical SQL Queries & Performance Optimization
-- ============================================================================

USE college_dbms;

-- ----------------------------------------------------------------------------
-- 1. DUAL-METRIC ATTENDANCE & DUTY-LEAVE IMPACT ANALYSIS
-- ----------------------------------------------------------------------------

-- 1.1 Compare Raw Attendance % vs. Adjusted Attendance % (with Approved Medical/OD leaves)
SELECT 
    s.roll_no,
    s.name AS student_name,
    s.branch,
    COUNT(DISTINCT ses.session_id) AS total_sessions,
    SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) AS attended_sessions,
    COUNT(DISTINCT CASE WHEN dl.is_approved = 1 AND ar.status = 0 THEN dl.leave_id ELSE NULL END) AS approved_leaves,
    ROUND((SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT ses.session_id)), 2) AS raw_attendance_pct,
    ROUND(((SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) + 
           COUNT(DISTINCT CASE WHEN dl.is_approved = 1 AND ar.status = 0 THEN dl.leave_id ELSE NULL END)) * 100.0 / 
           COUNT(DISTINCT ses.session_id)), 2) AS adjusted_attendance_pct,
    CASE 
        WHEN ((SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) + 
               COUNT(DISTINCT CASE WHEN dl.is_approved = 1 AND ar.status = 0 THEN dl.leave_id ELSE NULL END)) * 100.0 / 
               COUNT(DISTINCT ses.session_id)) >= 75.00 THEN 'Eligible'
        ELSE 'Defaulter'
    END AS final_eligibility
FROM student s
CROSS JOIN subject sub
JOIN attendance_session ses ON sub.subject_id = ses.subject_id
LEFT JOIN attendance_record ar ON ses.session_id = ar.session_id AND s.roll_no = ar.roll_no
LEFT JOIN duty_leave dl ON dl.session_id = ses.session_id AND dl.roll_no = s.roll_no
WHERE sub.subject_id = 'CS301'
GROUP BY s.roll_no, s.name, s.branch;

-- ----------------------------------------------------------------------------
-- 2. IN-DATABASE ATTENDANCE RECOVERY MATH (BUNK & RECOVERY CALCULATOR)
-- Formula: N = CEIL((0.75 * Total - Attended) / 0.25)
-- ----------------------------------------------------------------------------

-- 2.1 Calculate mandatory consecutive future classes needed to cross 75%
SELECT 
    s.roll_no,
    s.name,
    s.branch,
    COUNT(ar.session_id) AS total_conducted,
    SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) AS attended,
    ROUND((SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(ar.session_id)), 2) AS current_pct,
    CASE 
        WHEN (SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(ar.session_id)) >= 75.00 THEN 0
        ELSE GREATEST(0, CEIL((0.75 * COUNT(ar.session_id) - SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END)) / 0.25))
    END AS consecutive_classes_to_attend_for_75_percent
FROM student s
JOIN attendance_record ar ON s.roll_no = ar.roll_no
GROUP BY s.roll_no, s.name, s.branch
HAVING current_pct < 75.00
ORDER BY consecutive_classes_to_attend_for_75_percent DESC;

-- ----------------------------------------------------------------------------
-- 3. WINDOW FUNCTION ANALYTICS (PERCENT_RANK, DENSE_RANK, NTILE)
-- ----------------------------------------------------------------------------

-- 3.1 Department & Subject Cohort Percentile Ranking
SELECT 
    v.roll_no,
    v.student_name,
    v.branch,
    v.subject_name,
    v.adjusted_attendance_percentage,
    DENSE_RANK() OVER (PARTITION BY v.branch, v.subject_id ORDER BY v.adjusted_attendance_percentage DESC) AS dept_rank,
    ROUND(PERCENT_RANK() OVER (PARTITION BY v.branch, v.subject_id ORDER BY v.adjusted_attendance_percentage ASC) * 100, 2) AS percentile_score,
    NTILE(10) OVER (PARTITION BY v.branch, v.subject_id ORDER BY v.adjusted_attendance_percentage ASC) AS decile_group
FROM view_raw_vs_adjusted_attendance v
ORDER BY v.branch, v.adjusted_attendance_percentage ASC;

-- 3.2 Isolate the Bottom 10th Percentile Cohort for Urgent Academic Intervention
WITH RankedCohort AS (
    SELECT 
        v.roll_no,
        v.student_name,
        v.branch,
        v.subject_name,
        v.adjusted_attendance_percentage,
        NTILE(10) OVER (PARTITION BY v.branch ORDER BY v.adjusted_attendance_percentage ASC) AS decile
    FROM view_raw_vs_adjusted_attendance v
)
SELECT roll_no, student_name, branch, subject_name, adjusted_attendance_percentage, 'Immediate Dean Meeting Required' AS intervention_status
FROM RankedCohort
WHERE decile = 1;

-- ----------------------------------------------------------------------------
-- 4. MULTI-TIER DEFAULTER RISK ESCALATION MATRIX REPORT
-- ----------------------------------------------------------------------------

-- 4.1 Categorize students into Tier 1 (Critical <60%), Tier 2 (Warning 60%-74.99%), Tier 3 (Safe >=75%)
SELECT 
    v.roll_no,
    v.student_name,
    v.branch,
    v.subject_name,
    v.adjusted_attendance_percentage,
    v.risk_tier,
    v.administrative_escalation_action
FROM view_multi_tier_defaulters v
ORDER BY v.adjusted_attendance_percentage ASC;

-- ----------------------------------------------------------------------------
-- 5. IMMUTABLE ATTENDANCE AUDIT LEDGER INSPECTION
-- ----------------------------------------------------------------------------

-- 5.1 Anti-Fraud Audit Trail: Track all manual edits or status modifications
SELECT 
    l.audit_id,
    l.session_id,
    l.roll_no,
    s.name AS student_name,
    l.old_status,
    l.new_status,
    l.action_type,
    l.changed_by,
    l.changed_at,
    l.ip_address
FROM attendance_audit_log l
JOIN student s ON l.roll_no = s.roll_no
ORDER BY l.changed_at DESC;

-- ----------------------------------------------------------------------------
-- 6. TIMETABLE & CLASSROOM OVERLAP VERIFICATION (GUARDRAIL QUERY)
-- ----------------------------------------------------------------------------

-- 6.1 Identify any potential room collision or faculty double-booking
SELECT 
    t1.slot_id AS slot_1,
    t2.slot_id AS slot_2,
    t1.day_of_week,
    t1.room_number,
    t1.start_time,
    t1.end_time,
    'Room Collision Detected!' AS warning
FROM timetable_slot t1
JOIN timetable_slot t2 ON t1.room_number = t2.room_number 
    AND t1.day_of_week = t2.day_of_week 
    AND t1.slot_id <> t2.slot_id
    AND ((t1.start_time < t2.end_time) AND (t1.end_time > t2.start_time));
