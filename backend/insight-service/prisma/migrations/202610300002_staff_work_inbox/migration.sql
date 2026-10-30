ALTER TABLE circulation_notices ADD COLUMN branch_id UUID;

CREATE TABLE staff_work_items (
    aggregate_type VARCHAR(8) NOT NULL CHECK (aggregate_type = 'HOLD'),
    aggregate_id UUID NOT NULL,
    work_type VARCHAR(8) NOT NULL CHECK (work_type IN ('WAITING', 'READY')),
    branch_id UUID NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL,
    updated_at TIMESTAMPTZ(6) NOT NULL,
    resolved_at TIMESTAMPTZ(6),
    PRIMARY KEY (aggregate_type, aggregate_id, work_type)
);
CREATE INDEX staff_work_items_open_idx
    ON staff_work_items (resolved_at, work_type, branch_id, created_at);
