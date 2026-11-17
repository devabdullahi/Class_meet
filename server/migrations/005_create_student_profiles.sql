-- 005_create_student_profiles.sql
-- A short profile a student may fill in, so a group leader deciding on their
-- join request knows a little more than their name.
--
-- Who may see it is decided by the API, not by this table: a profile is shown
-- only to the leader of a group the student has a pending request for (see
-- findGroup in server/src/groups/repository.ts). It holds no contact details,
-- and the email in `users` is never shown with it.
--
-- One row per student, and only once they have saved something: every field
-- is optional, and a student who clears them all has their row deleted, so
-- "no row" is the single meaning of "has not added a profile yet".

CREATE TABLE student_profiles (
    user_id            uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- Free text, because majors are many and change names; length-limited
    -- by the API (server/src/profiles/validation.ts).
    major              text,
    year               text        CHECK (year IN ('freshman', 'sophomore', 'junior', 'senior', 'graduate')),
    meeting_preference text        CHECK (meeting_preference IN ('on_campus', 'online', 'either')),
    -- How they like to study, picked from a fixed list rather than typed, so
    -- a leader reads a consistent phrase and no one can put contact details
    -- or anything else in it. At most two, as the form asks.
    study_styles       text[]      NOT NULL DEFAULT '{}'
                       CHECK (study_styles <@ ARRAY['practice_problems', 'talking_it_through',
                                                    'quiet_focused_work', 'teaching_each_other',
                                                    'exam_cramming']::text[]
                              AND cardinality(study_styles) <= 2),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
