-- 002_create_courses_and_groups.sql
-- Courses, the study groups created inside them, and who is in each group.

CREATE TABLE courses (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Display code as students write it, e.g. "CSE 3311". UNIQUE because the
    -- code is how a student finds the course; the id is what other tables use.
    code       text        NOT NULL UNIQUE,
    title      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE study_groups (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id    uuid        NOT NULL REFERENCES courses (id),
    leader_id    uuid        NOT NULL REFERENCES users (id),
    goal         text        NOT NULL,
    meeting_day  text        NOT NULL
                 CHECK (meeting_day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday',
                                        'Friday', 'Saturday', 'Sunday')),
    -- Wall-clock time in the campus time zone; the day is a weekly recurrence,
    -- so there is no date and no zone to store.
    meeting_time time        NOT NULL,
    format       text        NOT NULL CHECK (format IN ('in_person', 'online')),
    -- A place for in-person groups, a meeting link for online ones.
    location     text        NOT NULL,
    -- Includes the leader. Must be at least 2 or the group could never form.
    max_members  integer     NOT NULL CHECK (max_members BETWEEN 2 AND 50),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX study_groups_course_idx ON study_groups (course_id);

CREATE TABLE group_members (
    group_id  uuid        NOT NULL REFERENCES study_groups (id) ON DELETE CASCADE,
    user_id   uuid        NOT NULL REFERENCES users (id),
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- Serves "which groups is this student in" once joining exists.
CREATE INDEX group_members_user_idx ON group_members (user_id);

-- Starter catalog, taken from the course list the frontend pages already use.
-- A real catalog import replaces this; ON CONFLICT keeps the migration re-runnable.
INSERT INTO courses (code, title) VALUES
    ('CSE 3311', 'Object Oriented Software Engineering'),
    ('CSE 4308', 'Artificial Intelligence'),
    ('CSE 4316', 'Computer Networks')
ON CONFLICT (code) DO NOTHING;
