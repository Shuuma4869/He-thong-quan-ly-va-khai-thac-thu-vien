CREATE TABLE inventory_resolutions (
    id UUID PRIMARY KEY,
    anomaly_id UUID NOT NULL UNIQUE REFERENCES inventory_anomalies(id) ON DELETE RESTRICT,
    action VARCHAR(32) NOT NULL CHECK (action IN ('REVIEWED','MOVE_TO_SCANNED_SHELF')),
    reason VARCHAR(500) NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
    copy_version_seen BIGINT CHECK (copy_version_seen >= 0),
    copy_version_after BIGINT CHECK (copy_version_after >= 0),
    resolved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    resolved_at TIMESTAMPTZ NOT NULL,
    CHECK (action <> 'MOVE_TO_SCANNED_SHELF'
        OR (copy_version_seen IS NOT NULL AND copy_version_after IS NOT NULL))
);
