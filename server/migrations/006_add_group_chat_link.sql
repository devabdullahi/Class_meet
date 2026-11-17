-- 006_add_group_chat_link.sql
-- An optional invite link to the group's own chat (GroupMe, Discord,
-- WhatsApp or Microsoft Teams), set by the leader.
--
-- Like an online meeting link, it is shared with members only: anyone with
-- an invite link can walk into the chat, so outsiders and students who have
-- only asked to join are told a chat exists but never get the link
-- (server/src/groups/visibility.ts). Which hosts are accepted is decided by
-- the API (server/src/groups/chat-link.ts); the check here only keeps a
-- plain-http link from ever being stored.
--
-- Nullable: most groups have no chat, and existing groups start without one.

ALTER TABLE study_groups
    ADD COLUMN chat_link text CHECK (chat_link IS NULL OR chat_link LIKE 'https://%');
