ALTER TABLE users
    ADD COLUMN phone_e164 VARCHAR(16),
    ADD COLUMN pending_email VARCHAR(320),
    ADD COLUMN pending_email_normalized VARCHAR(320),
    ADD COLUMN pending_email_requested_at TIMESTAMPTZ,
    ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0 CHECK (credential_version >= 0);

ALTER TABLE users
    ADD CONSTRAINT ck_user_phone_e164 CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    ADD CONSTRAINT ck_pending_email_complete CHECK (
        (pending_email IS NULL AND pending_email_normalized IS NULL AND pending_email_requested_at IS NULL)
        OR (pending_email IS NOT NULL AND pending_email_normalized IS NOT NULL AND pending_email_requested_at IS NOT NULL));

CREATE UNIQUE INDEX ux_users_phone_e164 ON users(phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX ux_users_pending_email ON users(pending_email_normalized) WHERE pending_email_normalized IS NOT NULL;
