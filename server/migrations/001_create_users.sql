-- 001_create_users.sql
-- Feature F1: the account record created the first time a student signs in
-- with their UTA Microsoft Entra ID account.

CREATE TABLE users (
    -- Our own identifier. It is what the session cookie carries and what
    -- future tables (course enrolments, group memberships) will reference,
    -- so the directory's identifiers never leak into the rest of the schema.
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The identity provider's two identifiers, kept provider-neutral in name
    -- because the provider already changed once:
    --   provider_tenant_id  Entra's `tid`. Which directory the account is in.
    --                       The server only ever admits UTA's tenant, but
    --                       storing it keeps the key correct if Class Meet is
    --                       opened to a second university later.
    --   provider_object_id  Entra's `oid`. Immutable, never reused, and unique
    --                       *within* a tenant — the same human in two tenants
    --                       has two object IDs, which is why the key is the
    --                       pair and not the object ID alone.
    provider_tenant_id text        NOT NULL,
    provider_object_id text        NOT NULL,

    -- Lowercased university email, for display and for the course-roster
    -- features later. NOT the key: Microsoft documents `preferred_username`,
    -- `upn` and `email` as mutable and reusable, so an account must survive
    -- the student's address changing. Still UNIQUE, so one address cannot end
    -- up attached to two rows.
    email              text        NOT NULL UNIQUE,

    name               text        NOT NULL,

    created_at         timestamptz NOT NULL DEFAULT now(),
    last_login_at      timestamptz NOT NULL DEFAULT now(),

    -- What sign-in upserts on.
    CONSTRAINT users_provider_identity_key UNIQUE (provider_tenant_id, provider_object_id)
);

-- Sign-in looks users up by the provider identity (covered by the UNIQUE
-- constraint above). This index serves the email lookups later iterations need.
CREATE INDEX users_email_idx ON users (email);
