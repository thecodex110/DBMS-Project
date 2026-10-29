-- ============================================================================
-- 🎓 COLLEGE ATTENDANCE & MULTI-TIER DEFAULTER MANAGEMENT SYSTEM
-- Advanced Views, Stored Procedures, Functions & Audit Triggers
-- ============================================================================

USE college_dbms;

-- ----------------------------------------------------------------------------
-- 1. ADVANCED RELATIONAL VIEWS
-- ----------------------------------------------------------------------------

-- View 1: Dual-Metric Attendance Calculation View (Raw % vs. Adjusted %)
-- Evaluates Approved On-Duty/Medical Leaves without altering raw attendance history logs.
DROP VIEW IF EXISTS view_raw_vs_adjusted_attendance;
CREATE VIEW view_raw_vs_adjusted_attendance AS
SELECT 
    s.roll_no,
    s.name AS student_name,
    s.branch,
    s.year,
    sub.subject_id,
    sub.subject_name,
    COUNT(DISTINCT ses.session_id) AS total_sessions_conducted,
    SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) AS attended_sessions,
    COUNT(DISTINCT CASE WHEN dl.is_approved = 1 AND ar.status = 0 THEN dl.leave_id ELSE NULL END) AS approved_duty_leaves,
    
    -- Raw Attendance Percentage = (Attended / Total) * 100
    ROUND((SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(DISTINCT ses.session_id), 0)), 2) AS raw_attendance_percentage,
    
    -- Adjusted Attendance Percentage = ((Attended + Approved Duty Leaves) / Total) * 100
    ROUND(((SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) + 
           COUNT(DISTINCT CASE WHEN dl.is_approved = 1 AND ar.status = 0 THEN dl.leave_id ELSE NULL END)) * 100.0 / 
           NULLIF(COUNT(DISTINCT ses.session_id), 0)), 2) AS adjusted_attendance_percentage,

    -- In-Database Attendance Recovery Math:
    -- N = CEIL((0.75 * T - A) / 0.25) = CEIL(3*T - 4*A)
    CASE 
        WHEN ((SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) + 
               COUNT(DISTINCT CASE WHEN dl.is_approved = 1 AND ar.status = 0 THEN dl.leave_id ELSE NULL END)) * 100.0 / 
               NULLIF(COUNT(DISTINCT ses.session_id), 0)) >= 75.00 THEN 0
        ELSE GREATEST(0, CEIL((0.75 * COUNT(DISTINCT ses.session_id) - 
                              (SUM(CASE WHEN ar.status = 1 THEN 1 ELSE 0 END) + 
                               COUNT(DISTINCT CASE WHEN dl.is_approved = 1 AND ar.status = 0 THEN dl.leave_id ELSE NULL END))) / 0.25))
    END AS recovery_sessions_needed

FROM student s
CROSS JOIN subject sub
JOIN attendance_session ses ON sub.subject_id = ses.subject_id
LEFT JOIN attendance_record ar ON ses.session_id = ar.session_id AND s.roll_no = ar.roll_no
LEFT JOIN duty_leave dl ON dl.session_id = ses.session_id AND dl.roll_no = s.roll_no
GROUP BY s.roll_no, s.name, s.branch, s.year, sub.subject_id, sub.subject_name;

-- ----------------------------------------------------------------------------
-- View 2: Multi-Tier Defaulter Risk Categorization & Escalation Matrix
-- Tier 1 (Critical Defaulter): < 60%
-- Tier 2 (Warning Defaulter): 60% - 74.99%
-- Tier 3 (Safe Status): >= 75%
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS view_multi_tier_defaulters;
CREATE VIEW view_multi_tier_defaulters AS
SELECT 
    v.roll_no,
    v.student_name,
    v.branch,
    v.year,
    v.subject_id,
    v.subject_name,
    v.total_sessions_conducted,
    v.attended_sessions,
    v.approved_duty_leaves,
    v.raw_attendance_percentage,
    v.adjusted_attendance_percentage,
    v.recovery_sessions_needed,
    CASE 
        WHEN v.adjusted_attendance_percentage < 60.00 THEN 'Tier 1 (Critical Defaulter)'
        WHEN v.adjusted_attendance_percentage BETWEEN 60.00 AND 74.99 THEN 'Tier 2 (Warning Defaulter)'
        ELSE 'Tier 3 (Safe Status)'
    END AS risk_tier,
    CASE 
        WHEN v.adjusted_attendance_percentage < 60.00 THEN 'Official Detention Notice & Mandatory Parent Conference'
        WHEN v.adjusted_attendance_percentage BETWEEN 60.00 AND 74.99 THEN 'Faculty Counseling & Automated Warning SMS'
        ELSE 'Eligible for Semester Examinations'
    END AS administrative_escalation_action
FROM view_raw_vs_adjusted_attendance v;

-- ----------------------------------------------------------------------------
-- View 3: Window Function Analytics (Cohort Ranking & Percentiles)
-- Identifies bottom 10th percentile for urgent academic intervention
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS view_cohort_window_rankings;
CREATE VIEW view_cohort_window_rankings AS
SELECT 
    v.roll_no,
    v.student_name,
    v.branch,
    v.subject_id,
    v.subject_name,
    v.adjusted_attendance_percentage,
    DENSE_RANK() OVER (PARTITION BY v.branch, v.subject_id ORDER BY v.adjusted_attendance_percentage DESC) AS subject_attendance_rank,
    ROUND(PERCENT_RANK() OVER (PARTITION BY v.branch, v.subject_id ORDER BY v.adjusted_attendance_percentage ASC) * 100, 2) AS percentile_rank,
    NTILE(10) OVER (PARTITION BY v.branch, v.subject_id ORDER BY v.adjusted_attendance_percentage ASC) AS decile_group,
    CASE 
        WHEN NTILE(10) OVER (PARTITION BY v.branch, v.subject_id ORDER BY v.adjusted_attendance_percentage ASC) = 1 
        THEN 'CRITICAL INTERVENTION NEEDED (Bottom 10% Cohort)'
        ELSE 'Regular Tracking'
    END AS cohort_intervention_flag
FROM view_raw_vs_adjusted_attendance v;

-- ----------------------------------------------------------------------------
-- View 4 & 5: Backward Compatibility Views
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS view_student_attendance_summary;
CREATE VIEW view_student_attendance_summary AS
SELECT 
    s.roll_no,
    s.name,
    s.branch,
    s.year,
    COUNT(a.attendance_id) AS total_classes,
    SUM(CASE WHEN a.status = 1 THEN 1 ELSE 0 END) AS attended_classes,
    ROUND((SUM(CASE WHEN a.status = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(a.attendance_id), 0)), 2) AS attendance_percentage
FROM student s
LEFT JOIN attendance a ON s.roll_no = a.roll_no
GROUP BY s.roll_no, s.name, s.branch, s.year;

DROP VIEW IF EXISTS view_active_defaulters;
CREATE VIEW view_active_defaulters AS
SELECT 
    d.detention_id,
    s.roll_no,
    s.name AS student_name,
    s.branch,
    sub.subject_name,
    f.name AS faculty_name,
    d.attendance_percentage,
    d.status,
    d.date_flagged
FROM defaulter_list d
JOIN student s ON d.roll_no = s.roll_no
JOIN subject sub ON d.subject_id = sub.subject_id
JOIN faculty f ON sub.faculty_id = f.faculty_id;

-- ----------------------------------------------------------------------------
-- 2. STORED PROCEDURES & INTEGRITY AUTOMATION
-- ----------------------------------------------------------------------------

DELIMITER //

-- Procedure 1: Automated Multi-Tier Defaulter Registry Population
DROP PROCEDURE IF EXISTS GenerateMultiTierDefaulters //
CREATE PROCEDURE GenerateMultiTierDefaulters(
    IN p_subject_id VARCHAR(20)
)
BEGIN
    -- Delete existing entries for this subject to refresh the active registry
    DELETE FROM defaulter_registry WHERE subject_id = p_subject_id;
    
    -- Insert updated evaluations with Recovery Math and Tier Classification
    INSERT INTO defaulter_registry (
        roll_no,
        subject_id,
        total_sessions,
        attended_sessions,
        approved_leaves,
        raw_percentage,
        adjusted_percentage,
        risk_tier,
        recovery_sessions_needed,
        status,
        date_flagged
    )
    SELECT 
        v.roll_no,
        v.subject_id,
        v.total_sessions_conducted,
        v.attended_sessions,
        v.approved_duty_leaves,
        v.raw_attendance_percentage,
        v.adjusted_attendance_percentage,
        CASE 
            WHEN v.adjusted_attendance_percentage < 60.00 THEN 'Critical'
            WHEN v.adjusted_attendance_percentage BETWEEN 60.00 AND 74.99 THEN 'Warning'
            ELSE 'Safe'
        END AS risk_tier,
        v.recovery_sessions_needed,
        CASE 
            WHEN v.adjusted_attendance_percentage < 60.00 THEN 'Detention Notice Dispatched'
            WHEN v.adjusted_attendance_percentage BETWEEN 60.00 AND 74.99 THEN 'Warning SMS Triggered'
            ELSE 'Eligible'
        END AS status,
        CURDATE()
    FROM view_raw_vs_adjusted_attendance v
    WHERE v.subject_id = p_subject_id AND v.adjusted_attendance_percentage < 75.00;

    SELECT CONCAT('Multi-tier defaulter registry refreshed for subject: ', p_subject_id) AS result_message;
END //

-- Procedure 2: Mark Attendance with Concurrency Transaction Control
DROP PROCEDURE IF EXISTS MarkSessionAttendance //
CREATE PROCEDURE MarkSessionAttendance(
    IN p_session_id INT,
    IN p_roll_no VARCHAR(20),
    IN p_status TINYINT,
    IN p_user VARCHAR(50)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
        -- Insert or Update Attendance Record with Row-Level Lock
        INSERT INTO attendance_record (session_id, roll_no, status, marked_at)
        VALUES (p_session_id, p_roll_no, p_status, NOW())
        ON DUPLICATE KEY UPDATE 
            status = p_status,
            marked_at = NOW();

        -- Record into Immutable Audit Trail
        INSERT INTO attendance_audit_log (session_id, roll_no, old_status, new_status, action_type, changed_by, changed_at)
        VALUES (p_session_id, p_roll_no, NULL, p_status, 'UPDATE', p_user, NOW());
    COMMIT;

    SELECT 'Session attendance recorded with immutable audit verification' AS status;
END //

-- Procedure 3: Legacy Defaulter Generator
DROP PROCEDURE IF EXISTS GenerateDefaulterList //
CREATE PROCEDURE GenerateDefaulterList(
    IN p_subject_id VARCHAR(20),
    IN p_threshold_percentage DECIMAL(5, 2)
)
BEGIN
    DELETE FROM defaulter_list WHERE subject_id = p_subject_id;
    
    INSERT INTO defaulter_list (roll_no, subject_id, attendance_percentage, status, date_flagged)
    SELECT 
        s.roll_no,
        p_subject_id,
        ROUND((SUM(CASE WHEN a.status = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(a.attendance_id)), 2) AS pct,
        'Auto Flagged',
        CURDATE()
    FROM student s
    JOIN attendance a ON s.roll_no = a.roll_no
    GROUP BY s.roll_no
    HAVING pct < p_threshold_percentage;
    
    SELECT CONCAT('Defaulter list generated for subject: ', p_subject_id) AS result;
END //

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 3. IMMUTABLE AUDIT LOGGING DATABASE TRIGGERS
-- ----------------------------------------------------------------------------

DELIMITER //

DROP TRIGGER IF EXISTS trg_attendance_record_audit_update //
CREATE TRIGGER trg_attendance_record_audit_update
AFTER UPDATE ON attendance_record
FOR EACH ROW
BEGIN
    IF OLD.status <> NEW.status THEN
        INSERT INTO attendance_audit_log (
            session_id,
            roll_no,
            old_status,
            new_status,
            action_type,
            changed_by,
            changed_at
        ) VALUES (
            OLD.session_id,
            OLD.roll_no,
            OLD.status,
            NEW.status,
            'UPDATE',
            CURRENT_USER(),
            NOW()
        );
    END IF;
END //

DELIMITER ;
