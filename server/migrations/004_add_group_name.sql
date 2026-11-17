-- 004_add_group_name.sql
-- A short name for each study group, so lists can tell groups apart at a
-- glance; the goal becomes the line under it.
--
-- Nullable on purpose. Groups created before this migration have no name and
-- nothing sensible to invent one from, so they keep NULL and the app shows
-- their goal in its place. New groups always get a name: the API requires one
-- (server/src/groups/validation.ts), so NOT NULL here would only break the
-- existing rows.

ALTER TABLE study_groups ADD COLUMN name text;
