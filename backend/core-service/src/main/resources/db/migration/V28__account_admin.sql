ALTER TABLE users ADD COLUMN admin_version INTEGER NOT NULL DEFAULT 0 CHECK (admin_version >= 0);

CREATE TABLE account_admin_audit (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES users(id),
    target_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(24) NOT NULL CHECK (action IN ('STATUS', 'ROLE_GRANT', 'ROLE_REVOKE')),
    before_value VARCHAR(32) NOT NULL,
    after_value VARCHAR(32) NOT NULL,
    reason VARCHAR(250) NOT NULL,
    target_version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_account_admin_audit_target_time ON account_admin_audit(target_id, created_at DESC);
