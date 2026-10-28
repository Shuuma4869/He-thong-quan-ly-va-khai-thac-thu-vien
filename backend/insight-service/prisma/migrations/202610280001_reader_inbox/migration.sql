CREATE TABLE reader_notifications (
    id UUID PRIMARY KEY,
    reader_id UUID NOT NULL,
    aggregate_type VARCHAR(8) NOT NULL CHECK (aggregate_type = 'HOLD'),
    aggregate_id UUID NOT NULL,
    aggregate_version BIGINT NOT NULL CHECK (aggregate_version >= 0),
    event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('HOLD_READY', 'HOLD_EXPIRED')),
    occurred_at TIMESTAMPTZ(6) NOT NULL,
    received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ(6),
    read_at TIMESTAMPTZ(6)
);
CREATE INDEX reader_notifications_reader_received_idx
    ON reader_notifications (reader_id, received_at DESC, id DESC);
CREATE INDEX reader_notifications_reader_unread_idx
    ON reader_notifications (reader_id, received_at DESC) WHERE read_at IS NULL;
