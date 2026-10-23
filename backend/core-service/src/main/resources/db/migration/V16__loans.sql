CREATE TABLE loans (
    id UUID PRIMARY KEY,
    copy_id UUID NOT NULL REFERENCES book_copies(id) ON DELETE RESTRICT,
    edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
    reader_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    borrowed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    borrowed_at TIMESTAMPTZ NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    returned_at TIMESTAMPTZ,
    returned_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    renewal_count INTEGER NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    policy_version VARCHAR(80) NOT NULL,
    policy_snapshot JSONB NOT NULL,
    CONSTRAINT ck_loans_due_after_borrow CHECK (due_at > borrowed_at),
    CONSTRAINT ck_loans_return_pair CHECK (
        (returned_at IS NULL AND returned_by IS NULL)
        OR (returned_at IS NOT NULL AND returned_by IS NOT NULL AND returned_at >= borrowed_at)
    ),
    CONSTRAINT ck_loans_renewal_count CHECK (renewal_count >= 0),
    CONSTRAINT ck_loans_version CHECK (version >= 0),
    CONSTRAINT ck_loans_policy_version CHECK (length(btrim(policy_version)) BETWEEN 1 AND 80),
    CONSTRAINT ck_loans_policy_snapshot CHECK (jsonb_typeof(policy_snapshot) = 'object')
);

CREATE UNIQUE INDEX uq_loans_active_copy ON loans(copy_id) WHERE returned_at IS NULL;
CREATE INDEX ix_loans_reader_time ON loans(reader_id, borrowed_at DESC, id);
CREATE INDEX ix_loans_active_reader_due ON loans(reader_id, due_at, id) WHERE returned_at IS NULL;
CREATE INDEX ix_loans_edition ON loans(edition_id);
CREATE INDEX ix_loans_branch_time ON loans(branch_id, borrowed_at DESC, id);
