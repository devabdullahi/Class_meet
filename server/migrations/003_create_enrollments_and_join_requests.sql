-- 003_create_enrollments_and_join_requests.sql
-- Which courses a student is taking, and requests to join a study group.

CREATE TABLE course_enrollments (
    user_id     uuid        NOT NULL REFERENCES users (id),
    course_id   uuid        NOT NULL REFERENCES courses (id),
    enrolled_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE group_join_requests (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   uuid        NOT NULL REFERENCES study_groups (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id),
    status     text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'declined')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    -- One row per student per group. A declined student may ask again, which
    -- resets this same row to 'pending' instead of adding a second one.
    CONSTRAINT group_join_requests_group_user_key UNIQUE (group_id, user_id)
);

-- The leader's "pending requests for my group" lookup.
CREATE INDEX group_join_requests_pending_idx ON group_join_requests (group_id) WHERE status = 'pending';
