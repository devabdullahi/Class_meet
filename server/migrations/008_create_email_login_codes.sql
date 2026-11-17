-- 008_create_email_login_codes.sql
-- Sign-in by a one-time code emailed to a UTA address. UTA's Microsoft tenant
-- requires an administrator to approve every third-party app, so students
-- cannot consent to Class Meet's Microsoft sign-in themselves; proving that
-- they can read mail sent to their UTA address is the sign-in instead.

-- The code a student has been sent and not yet used. One row per address:
-- asking for a new code replaces the old one, so there is only ever one code
-- that works. A correct code deletes the row (single use).
CREATE TABLE email_login_codes (
    -- Normalised: lowercased, plus tag removed (server/src/email-login/email-address.ts).
    email       text        PRIMARY KEY,

    -- HMAC-SHA256 of the address and the code, keyed from SESSION_SECRET.
    -- Never the code: a million possible codes would make any unkeyed hash
    -- trivially reversible (see server/src/email-login/login-code.ts).
    code_hash   text        NOT NULL,

    -- Ten minutes after it was sent.
    expires_at  timestamptz NOT NULL,

    -- Guesses checked against this code. After five the code stops working,
    -- even if the sixth guess would have been right.
    attempts    integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),

    -- When the code was sent. Another code for the same address is refused
    -- until a minute after this, so the inbox cannot be flooded.
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Expired codes are deleted in bulk on each request for a new one.
CREATE INDEX email_login_codes_expires_at_idx ON email_login_codes (expires_at);

-- USERS: NO CHANGE TO THE TABLE. An account created by email sign-in is stored
-- with provider_tenant_id = 'email' and provider_object_id = the normalised
-- address, which satisfies the existing NOT NULL columns and the unique
-- (provider_tenant_id, provider_object_id) key exactly as a Microsoft account
-- does. Making those columns nullable instead would have loosened a constraint
-- every existing row relies on, and Postgres treats NULLs as distinct in a
-- unique key, so the pair would silently stop being one.
--
-- Email sign-in finds the account by users.email, which is already UNIQUE and
-- lowercased. So a student who first signed in with Microsoft and now signs in
-- with a code gets their existing account — the same person, the same groups
-- — and that row keeps its Microsoft identifiers. Microsoft accounts carry the
-- UTA address their directory reports, which is the address codes are sent to.
