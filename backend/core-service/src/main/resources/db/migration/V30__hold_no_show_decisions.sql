CREATE TABLE hold_no_show_decisions (
    id UUID PRIMARY KEY,
    hold_id UUID NOT NULL REFERENCES holds(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    decision VARCHAR(12) NOT NULL CHECK (decision IN ('CONFIRMED', 'EXCUSED')),
    reason VARCHAR(1000) NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    policy_version VARCHAR(40) NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL,
    UNIQUE (hold_id, version)
);
CREATE INDEX ix_hold_no_show_decisions_hold_version ON hold_no_show_decisions (hold_id, version DESC);
