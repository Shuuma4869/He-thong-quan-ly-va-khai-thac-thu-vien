ALTER TABLE outbox_events
    ADD COLUMN delivery_order BIGSERIAL,
    ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN last_error_code VARCHAR(40);

-- Giữ thứ tự nghiệp vụ cho backlog đã có, kể cả hai fact cùng timestamp.
WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY occurred_at,
        CASE WHEN jsonb_typeof(payload->'aggregateVersion') = 'number'
             THEN (payload->>'aggregateVersion')::numeric ELSE 0 END, id) AS position
    FROM outbox_events
)
UPDATE outbox_events o SET delivery_order = ordered.position FROM ordered WHERE ordered.id = o.id;

CREATE UNIQUE INDEX ux_outbox_delivery_order ON outbox_events(delivery_order);
CREATE INDEX ix_outbox_pending_delivery ON outbox_events(next_attempt_at, delivery_order)
    WHERE published_at IS NULL;
CREATE INDEX ix_outbox_pending_aggregate ON outbox_events(aggregate_type, aggregate_id, delivery_order)
    WHERE published_at IS NULL;
