ALTER TABLE users
    ADD COLUMN pending_email_code_hash VARCHAR(100),
    ADD COLUMN pending_email_expires_at TIMESTAMPTZ,
    ADD COLUMN pending_email_attempts INTEGER NOT NULL DEFAULT 0 CHECK (pending_email_attempts BETWEEN 0 AND 5),
    ADD COLUMN email_verification_window_started_at TIMESTAMPTZ,
    ADD COLUMN email_verification_send_count INTEGER NOT NULL DEFAULT 0 CHECK (email_verification_send_count BETWEEN 0 AND 5);

ALTER TABLE users ADD CONSTRAINT ck_pending_email_verification CHECK (
    (pending_email IS NULL AND pending_email_code_hash IS NULL AND pending_email_expires_at IS NULL AND pending_email_attempts = 0)
    OR (pending_email IS NOT NULL AND pending_email_code_hash IS NULL AND pending_email_expires_at IS NULL AND pending_email_attempts = 0)
    OR (pending_email IS NOT NULL AND pending_email_code_hash IS NOT NULL AND pending_email_expires_at IS NOT NULL));
