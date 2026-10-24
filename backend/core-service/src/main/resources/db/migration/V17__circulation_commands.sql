CREATE TABLE circulation_requests (
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_id UUID NOT NULL,
    command VARCHAR(40) NOT NULL,
    request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
    response_payload JSONB NOT NULL CHECK (jsonb_typeof(response_payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_id, request_id)
);

CREATE TABLE copy_state_changes (
    id UUID PRIMARY KEY,
    copy_id UUID NOT NULL REFERENCES book_copies(id) ON DELETE RESTRICT,
    from_status VARCHAR(20) NOT NULL,
    to_status VARCHAR(20) NOT NULL,
    copy_version BIGINT NOT NULL CHECK (copy_version > 0),
    actor_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    actor_kind VARCHAR(10) NOT NULL CHECK (actor_kind IN ('HUMAN', 'SYSTEM')),
    reason VARCHAR(500) NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
    occurred_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_copy_change_actor CHECK ((actor_kind = 'HUMAN' AND actor_id IS NOT NULL)
        OR (actor_kind = 'SYSTEM' AND actor_id IS NULL)),
    CONSTRAINT ck_copy_change_status CHECK (from_status <> to_status
        AND from_status IN ('IN_PROCESS','AVAILABLE','ON_LOAN','ON_HOLD','LOST','DAMAGED','WITHDRAWN')
        AND to_status IN ('IN_PROCESS','AVAILABLE','ON_LOAN','ON_HOLD','LOST','DAMAGED','WITHDRAWN')),
    UNIQUE (copy_id, copy_version)
);
