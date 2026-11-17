-- 007_add_reports_and_moderators.sql
-- Students report a study group, or one of its members, and moderators
-- review the reports: keep the group as it is, take the group down, or take
-- the member out of it.

-- Granted by hand, never through the app, so there is no screen that can be
-- tricked into making someone a moderator (see the README, "Moderators"):
--   UPDATE users SET is_moderator = true WHERE email = 'someone@mavs.uta.edu';
ALTER TABLE users ADD COLUMN is_moderator boolean NOT NULL DEFAULT false;

-- A group a moderator took down. The study_groups row itself is deleted, and
-- its memberships and join requests with it (ON DELETE CASCADE), exactly as
-- when its leader deletes it. This row is what is left: it lets the group's
-- old link explain what happened instead of saying "not found", and it names
-- the group in the moderators' list of resolved reports.
CREATE TABLE removed_groups (
    -- The deleted group's id. No foreign key: that row no longer exists.
    group_id   uuid        PRIMARY KEY,
    course_id  uuid        NOT NULL REFERENCES courses (id),
    -- What the group was called when it was removed: its name, or its goal
    -- for a group from before groups had names.
    title      text        NOT NULL,
    removed_by uuid        NOT NULL REFERENCES users (id),
    removed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reports (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id      uuid        NOT NULL REFERENCES users (id),
    -- No foreign key on purpose: a report outlives the group a moderator
    -- removes because of it, as the record of what was reported and what was
    -- done about it. removed_groups names the group after that.
    group_id         uuid        NOT NULL,
    -- Null when the whole group is reported; otherwise the member reported.
    reported_user_id uuid        REFERENCES users (id),
    -- The fixed list the report form offers (server/src/moderation/validation.ts).
    reason           text        NOT NULL
                     CHECK (reason IN ('exam_answers', 'spam', 'harassment', 'not_study_group', 'other')),
    -- Optional; the API stores a blank answer as NULL.
    details          text        CHECK (char_length(details) BETWEEN 1 AND 500),
    status           text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    -- What the moderator did. 'removed' takes the whole group down;
    -- 'removed_from_group' takes one member out of it.
    outcome          text        CHECK (outcome IN ('kept', 'removed', 'removed_from_group')),
    resolved_by      uuid        REFERENCES users (id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    resolved_at      timestamptz,

    -- An open report has no outcome yet; a resolved one has all three.
    CONSTRAINT reports_resolution_check CHECK (
        (status = 'open' AND outcome IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
        OR (status = 'resolved' AND outcome IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    ),
    CONSTRAINT reports_member_outcome_check CHECK (
        outcome IS DISTINCT FROM 'removed_from_group' OR reported_user_id IS NOT NULL
    )
);

-- One open report per student per target: a second report of the same group
-- (or the same member of it) while a moderator is still reviewing the first
-- adds nothing. NULLS NOT DISTINCT makes "the whole group" (a NULL member)
-- count as one target. Once the report is resolved the student may report
-- again.
CREATE UNIQUE INDEX reports_one_open_per_target_idx
    ON reports (reporter_id, group_id, reported_user_id) NULLS NOT DISTINCT
    WHERE status = 'open';

-- The moderators' queue, and resolving every open report about one target.
CREATE INDEX reports_open_by_group_idx ON reports (group_id) WHERE status = 'open';
