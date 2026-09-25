CREATE TABLE system_metadata (
    metadata_key VARCHAR(100) PRIMARY KEY,
    metadata_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT ck_outbox_retry_non_negative CHECK (retry_count >= 0)
);

CREATE INDEX ix_outbox_unpublished ON outbox_events (occurred_at)
    WHERE published_at IS NULL;

INSERT INTO system_metadata (metadata_key, metadata_value)
VALUES ('schema_stage', 'foundation');
