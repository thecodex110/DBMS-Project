
INSERT INTO department (dept_id, dept_name, building, established_year) VALUES
    ('CS',   'Computer Engineering',                    'A-Block', 1998),
    ('IT',   'Information Technology',                  'B-Block', 2001),
    ('ENTC', 'Electronics & Telecommunication',         'C-Block', 1995),
    ('MECH', 'Mechanical Engineering',                  'D-Block', 1990);

INSERT INTO faculty (faculty_id, name, email, designation, dept_id, joining_date, salary) VALUES
    ('FAC101', 'Dr. Ramesh Sharma',   'ramesh.sharma@college.edu',  'Professor',           'CS',   '2008-07-15', 145000),
    ('FAC102', 'Prof. Sunita Patil',  'sunita.patil@college.edu',   'Associate Professor', 'IT',   '2012-06-01', 112000),
    ('FAC103', 'Dr. Arvind Verma',    'arvind.verma@college.edu',   'Professor',           'CS',   '2010-01-10', 138000),
    ('FAC104', 'Prof. Priya Nair',    'priya.nair@college.edu',     'Assistant Professor', 'ENTC', '2016-08-20',  82000),
    ('FAC105', 'Dr. Rajesh Khanna',   'rajesh.khanna@college.edu',  'Associate Professor', 'MECH', '2011-03-14', 118000),
    ('FAC106', 'Prof. Neha Joshi',    'neha.joshi@college.edu',     'Assistant Professor', 'CS',   '2019-07-01',  76000),
    ('FAC107', 'Prof. Amit Kulkarni', 'amit.kulkarni@college.edu',  'Assistant Professor', 'IT',   '2018-12-03',  79000),
    ('FAC108', 'Dr. Kavita Rao',      'kavita.rao@college.edu',     'Professor',           'ENTC', '2007-09-09', 150000),
    ('FAC109', 'Prof. Sameer Desai',  'sameer.desai@college.edu',   'Lecturer',            'MECH', '2022-01-17',  55000),
    ('FAC110', 'Prof. Anjali Mehta',  'anjali.mehta@college.edu',   'Assistant Professor', 'CS',   '2024-07-01',  70000);

INSERT INTO student (roll_no, first_name, last_name, gender, dob, city, year, dept_id, admission_date) VALUES
    ('23CS001', 'Aarav',     'Mehta',     'M', '2005-03-14', 'Pune',      3, 'CS',   '2023-08-01'),
    ('23CS002', 'Ananya',    'Iyer',      'F', '2005-07-22', 'Mumbai',    3, 'CS',   '2023-08-01'),
    ('23CS003', 'Rohan',     'Deshmukh',  'M', '2004-11-02', 'Nagpur',    3, 'CS',   '2023-08-01'),
    ('23CS004', 'Ishaan',    'Malhotra',  'M', '2005-01-19', 'Delhi',     3, 'CS',   '2023-08-01'),
    ('23CS005', 'Tanvi',     'Shinde',    'F', '2005-05-30', 'Pune',      3, 'CS',   '2023-08-01'),
    ('23CS006', 'Aditya',    'Rathi',     'M', '2004-09-12', 'Jaipur',    3, 'CS',   '2023-08-01'),
    ('23CS007', 'Sneha',     'Kulkarni',  'F', '2005-12-05', 'Nashik',    3, 'CS',   '2023-08-01'),
    ('23CS008', 'Kabir',     'Bansal',    'M', '2005-08-08', 'Indore',    3, 'CS',   '2023-08-01'),
    ('23CS009', 'Zoya',      'Khan',      'F', '2005-02-27', 'Bhopal',    3, 'CS',   '2023-08-01'),
    ('23CS010', 'Om',        'Patil',     'M', '2004-10-17', 'Pune',      3, 'CS',   '2023-08-01'),
    ('24CS101', 'Riya',      'Sharma',    'F', '2006-04-11', 'Pune',      2, 'CS',   '2024-08-01'),
    ('24CS102', 'Arjun',     'Nair',      'M', '2006-06-03', 'Mumbai',    2, 'CS',   '2024-08-01'),
    ('24CS103', 'Diya',      'Agarwal',   'F', '2006-01-25', 'Jaipur',    2, 'CS',   '2024-08-01'),
    ('24CS104', 'Yash',      'Pawar',     'M', '2005-12-20', 'Nashik',    2, 'CS',   '2024-08-01'),
    ('24CS105', 'Sara',      'Thomas',    'F', '2006-09-09', 'Kochi',     2, 'CS',   '2024-08-01'),
    ('23IT001', 'Pooja',     'Kulkarni',  'F', '2005-03-03', 'Pune',      3, 'IT',   '2023-08-01'),
    ('23IT002', 'Varun',     'Joshi',     'M', '2004-12-12', 'Mumbai',    3, 'IT',   '2023-08-01'),
    ('23IT003', 'Rhea',      'Kapoor',    'F', '2005-06-16', 'Delhi',     3, 'IT',   '2023-08-01'),
    ('23IT004', 'Siddharth', 'Sen',       'M', '2005-04-04', 'Kolkata',   3, 'IT',   '2023-08-01'),
    ('23IT005', 'Kavya',     'Pillai',    'F', '2005-10-21', 'Chennai',   3, 'IT',   '2023-08-01'),
    ('23EC001', 'Sneha',     'Gupta',     'F', '2005-01-08', 'Indore',    3, 'ENTC', '2023-08-01'),
    ('23EC002', 'Kunal',     'Shah',      'M', '2004-07-07', 'Ahmedabad', 3, 'ENTC', '2023-08-01'),
    ('23EC003', 'Vikram',    'Chaudhary', 'M', '2005-09-29', 'Nagpur',    3, 'ENTC', '2023-08-01'),
    ('23EC004', 'Meera',     'Nambiar',   'F', '2005-11-13', 'Kochi',     3, 'ENTC', '2023-08-01'),
    ('23ME001', 'Harsh',     'Vardhan',   'M', '2004-08-18', 'Delhi',     3, 'MECH', '2023-08-01'),
    ('23ME002', 'Devika',    'Menon',     'F', '2005-02-14', 'Pune',      3, 'MECH', '2023-08-01'),
    ('23ME003', 'Pranav',    'Kadam',     'M', '2005-05-05', 'Satara',    3, 'MECH', '2023-08-01'),
    ('23ME004', 'Nikhil',    'Gaikwad',   'M', '2004-12-31', 'Pune',      3, 'MECH', '2023-08-01');


UPDATE student
   SET email = lower(first_name) || '.' || lower(roll_no) || '@college.edu';

INSERT INTO student_phone (roll_no, phone) VALUES
    ('23CS001', '9876543210'), ('23CS001', '9822001100'),
    ('23CS002', '9765432109'),
    ('23CS003', '9654321098'), ('23CS003', '9011223344'),
    ('23CS005', '9543210987'),
    ('23IT001', '9432109876'), ('23IT001', '8888777766'),
    ('23IT003', '9321098765'),
    ('23EC001', '9210987654'),
    ('23ME002', '9109876543'), ('23ME002', '7709876543'),
    ('24CS101', '9988776655');

INSERT INTO subject (subject_id, subject_name, credits, semester, subject_type, dept_id) VALUES
    ('CS501', 'Database Management Systems', 4, 5, 'Theory', 'CS'),
    ('CS502', 'Operating Systems',           4, 5, 'Theory', 'CS'),
    ('CS503', 'Theory of Computation',       3, 5, 'Theory', 'CS'),
    ('CS504', 'DBMS Laboratory',             2, 5, 'Lab',    'CS'),
    ('IT501', 'Computer Networks',           4, 5, 'Theory', 'IT'),
    ('IT502', 'Web Technology',              3, 5, 'Theory', 'IT'),
    ('EC501', 'Microprocessors',             4, 5, 'Theory', 'ENTC'),
    ('EC502', 'Digital Signal Processing',   4, 5, 'Theory', 'ENTC'),
    ('ME501', 'Thermodynamics',              4, 5, 'Theory', 'MECH'),
    ('ME502', 'Dynamics of Machinery',       3, 5, 'Theory', 'MECH'),
    ('CS301', 'Data Structures',             4, 3, 'Theory', 'CS'),
    ('CS302', 'Discrete Mathematics',        3, 3, 'Theory', 'CS');


INSERT INTO teaches (subject_id, academic_year, faculty_id) VALUES
    ('CS501', '2026-27', 'FAC101'), ('CS504', '2026-27', 'FAC101'),
    ('CS502', '2026-27', 'FAC103'), ('CS301', '2026-27', 'FAC103'),
    ('CS503', '2026-27', 'FAC106'), ('CS302', '2026-27', 'FAC106'),
    ('IT501', '2026-27', 'FAC102'), ('IT502', '2026-27', 'FAC107'),
    ('EC501', '2026-27', 'FAC104'), ('EC502', '2026-27', 'FAC108'),
    ('ME501', '2026-27', 'FAC105'), ('ME502', '2026-27', 'FAC109');

INSERT INTO enrollment (roll_no, subject_id, enrolled_on)
SELECT s.roll_no, sub.subject_id, '2026-07-01'
  FROM student s
  JOIN subject sub ON sub.dept_id = s.dept_id
                  AND sub.semester = s.year * 2 - 1;
