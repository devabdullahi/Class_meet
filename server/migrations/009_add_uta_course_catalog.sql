-- 009_add_uta_course_catalog.sql
-- The full catalog students can add. 002 seeded only three courses, so on a
-- fresh deployment any other course (MATH 2425, CSE 3318, ...) was not found
-- by Add Course. The CSE courses are UTA's 2025-2026 CSE catalog; MATH 2425 is
-- the calculus course CSE students take alongside them.
--
-- DO NOTHING keeps every course already in the table as it is, including ones
-- added by hand from docs/DEPLOY.md step 7, so this is safe on a database that
-- already has some of them.
INSERT INTO courses (code, title) VALUES
    ('CSE 1106', 'Introduction to Computer Science and Engineering'),
    ('CSE 1310', 'Introduction to Computers and Programming'),
    ('CSE 1320', 'Intermediate Programming'),
    ('CSE 1325', 'Object-Oriented Programming'),
    ('CSE 2312', 'Computer Organization and Assembly Language Programming'),
    ('CSE 2315', 'Discrete Structures'),
    ('CSE 3302', 'Programming Languages'),
    ('CSE 3310', 'Introduction to Software Engineering'),
    ('CSE 3311', 'Object-Oriented Software Engineering'),
    ('CSE 3313', 'Signal Processing'),
    ('CSE 3314', 'Professional Practices'),
    ('CSE 3315', 'Theoretical Computer Science'),
    ('CSE 3318', 'Algorithms and Data Structures'),
    ('CSE 3320', 'Operating Systems'),
    ('CSE 3330', 'Databases'),
    ('CSE 3340', 'Introduction to Human-Computer Interaction'),
    ('CSE 3380', 'Linear Algebra for CSE'),
    ('CSE 4303', 'Computer Graphics'),
    ('CSE 4304', 'Game Design and Development'),
    ('CSE 4305', 'Compilers'),
    ('CSE 4308', 'Artificial Intelligence'),
    ('CSE 4309', 'Fundamentals of Machine Learning'),
    ('CSE 4310', 'Fundamentals of Computer Vision'),
    ('CSE 4311', 'Neural Networks and Deep Learning'),
    ('CSE 4316', 'Senior Design I'),
    ('CSE 4317', 'Senior Design II'),
    ('CSE 4321', 'Software Testing and Maintenance'),
    ('CSE 4322', 'Software Project Management'),
    ('CSE 4323', 'Quantitative Computer Architecture'),
    ('CSE 4331', 'Database Implementation and Theory'),
    ('CSE 4333', 'Cloud Computing Fundamentals and Applications'),
    ('CSE 4334', 'Data Mining'),
    ('CSE 4344', 'Computer Networks'),
    ('CSE 4345', 'Computational Methods'),
    ('CSE 4351', 'Parallel Processing'),
    ('CSE 4360', 'Autonomous Robot Design and Programming'),
    ('CSE 4361', 'Software Design Patterns'),
    ('CSE 4373', 'General Purpose GPU Programming'),
    ('CSE 4376', 'Digital Communication Systems'),
    ('CSE 4378', 'Introduction to Unmanned Vehicles'),
    ('CSE 4379', 'Unmanned Vehicles Development'),
    ('CSE 4380', 'Information Security'),
    ('CSE 4381', 'Information Security II'),
    ('CSE 4382', 'Secure Programming'),
    ('MATH 2425', 'Calculus II')
ON CONFLICT (code) DO NOTHING;

-- 002 titled CSE 4316 "Computer Networks", but at UTA that is CSE 4344 (above);
-- CSE 4316 is Senior Design I. The title check leaves a corrected row alone.
UPDATE courses SET title = 'Senior Design I'
WHERE code = 'CSE 4316' AND title = 'Computer Networks';
