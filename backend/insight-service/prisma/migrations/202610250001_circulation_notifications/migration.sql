CREATE TABLE consumed_circulation_events (
    event_id UUID PRIMARY KEY,
    digest CHAR(64) NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE circulation_notices (
    aggregate_type VARCHAR(8) NOT NULL CHECK (aggregate_type IN ('LOAN','HOLD')),
    aggregate_id UUID NOT NULL,
    aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 0),
    event_id UUID NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    reader_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ(6) NOT NULL,
    received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_at TIMESTAMPTZ(6),
    expires_at TIMESTAMPTZ(6),
    PRIMARY KEY (aggregate_type, aggregate_id)
);
CREATE UNIQUE INDEX circulation_notices_event_id_key ON circulation_notices(event_id);
CREATE INDEX circulation_notices_reader_id_occurred_at_aggregate_id_idx ON circulation_notices(reader_id, occurred_at, aggregate_id);
