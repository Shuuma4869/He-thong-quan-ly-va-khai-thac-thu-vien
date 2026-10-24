ALTER TABLE editions ADD CONSTRAINT uq_editions_book_id UNIQUE (book_id, id);

CREATE TABLE holds (
    id UUID PRIMARY KEY,
    reader_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
    edition_id UUID,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    status VARCHAR(12) NOT NULL CHECK (status IN ('WAITING','READY','FULFILLED','CANCELLED','EXPIRED')),
    queued_at TIMESTAMPTZ NOT NULL,
    ready_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    copy_id UUID REFERENCES book_copies(id) ON DELETE RESTRICT,
    loan_id UUID UNIQUE REFERENCES loans(id) ON DELETE RESTRICT,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    policy_version VARCHAR(80) NOT NULL CHECK (length(btrim(policy_version)) BETWEEN 1 AND 80),
    pickup_seconds BIGINT NOT NULL CHECK (pickup_seconds BETWEEN 1 AND 31622400),
    CONSTRAINT fk_holds_edition_book FOREIGN KEY (book_id, edition_id) REFERENCES editions(book_id,id) ON DELETE RESTRICT,
    CONSTRAINT ck_holds_assignment CHECK (
        (copy_id IS NULL AND ready_at IS NULL AND expires_at IS NULL)
        OR (copy_id IS NOT NULL AND ready_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at > ready_at AND ready_at >= queued_at)),
    CONSTRAINT ck_holds_lifecycle CHECK (
        (status='WAITING' AND copy_id IS NULL AND closed_at IS NULL AND loan_id IS NULL)
        OR (status='READY' AND copy_id IS NOT NULL AND closed_at IS NULL AND loan_id IS NULL)
        OR (status='FULFILLED' AND copy_id IS NOT NULL AND closed_at IS NOT NULL AND loan_id IS NOT NULL)
        OR (status='CANCELLED' AND closed_at IS NOT NULL AND loan_id IS NULL)
        OR (status='EXPIRED' AND copy_id IS NOT NULL AND closed_at IS NOT NULL AND loan_id IS NULL)),
    CONSTRAINT ck_holds_closed_time CHECK (closed_at IS NULL OR (closed_at >= queued_at AND (ready_at IS NULL OR closed_at >= ready_at)))
);
CREATE UNIQUE INDEX uq_holds_active_reader_book ON holds(reader_id,book_id) WHERE status IN ('WAITING','READY');
CREATE UNIQUE INDEX uq_holds_ready_copy ON holds(copy_id) WHERE status='READY';
CREATE INDEX ix_holds_queue ON holds(book_id,branch_id,queued_at,id) WHERE status='WAITING';
CREATE INDEX ix_holds_reader_time ON holds(reader_id,queued_at DESC,id);
CREATE INDEX ix_holds_expiry ON holds(expires_at,id) WHERE status='READY';

CREATE TABLE hold_changes (
    id UUID PRIMARY KEY,
    hold_id UUID NOT NULL REFERENCES holds(id) ON DELETE RESTRICT,
    hold_version BIGINT NOT NULL CHECK (hold_version >= 0),
    event_type VARCHAR(40) NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    occurred_at TIMESTAMPTZ NOT NULL,
    UNIQUE (hold_id,hold_version)
);

CREATE TABLE loan_extensions (
    id UUID PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
    loan_version BIGINT NOT NULL CHECK (loan_version > 0),
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_due_at TIMESTAMPTZ NOT NULL,
    due_at TIMESTAMPTZ NOT NULL CHECK (due_at > previous_due_at),
    extended_at TIMESTAMPTZ NOT NULL,
    policy_version VARCHAR(80) NOT NULL,
    policy_snapshot JSONB NOT NULL CHECK (jsonb_typeof(policy_snapshot)='object'),
    UNIQUE (loan_id,loan_version)
);
