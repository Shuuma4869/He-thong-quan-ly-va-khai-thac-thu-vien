CREATE TABLE inventory_sessions (
    id UUID PRIMARY KEY,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    shelf_id UUID REFERENCES shelves(id) ON DELETE RESTRICT,
    opened_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opened_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FINALIZED','CANCELLED')),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    snapshot_count INTEGER NOT NULL CHECK (snapshot_count BETWEEN 0 AND 5000),
    scan_count INTEGER NOT NULL DEFAULT 0 CHECK (scan_count BETWEEN 0 AND 20000),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    close_reason VARCHAR(500),
    CHECK ((status='OPEN' AND closed_at IS NULL AND closed_by IS NULL)
        OR (status<>'OPEN' AND closed_at IS NOT NULL AND closed_by IS NOT NULL))
);
CREATE UNIQUE INDEX ux_inventory_open_branch ON inventory_sessions(branch_id) WHERE status='OPEN';
CREATE INDEX ix_inventory_sessions_page ON inventory_sessions(opened_at DESC,id DESC);

-- UUID và dữ liệu chụp không phụ thuộc Copy sống: xóa/chuyển Copy không xóa bằng chứng.
CREATE TABLE inventory_snapshots (
    session_id UUID NOT NULL REFERENCES inventory_sessions(id) ON DELETE RESTRICT,
    copy_id UUID NOT NULL,
    barcode VARCHAR(100) NOT NULL,
    branch_id UUID NOT NULL,
    shelf_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    copy_version BIGINT NOT NULL CHECK (copy_version>=0),
    PRIMARY KEY(session_id,copy_id),
    UNIQUE(session_id,barcode)
);
CREATE TABLE inventory_scans (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES inventory_sessions(id) ON DELETE RESTRICT,
    client_scan_id UUID NOT NULL,
    barcode VARCHAR(100) NOT NULL CHECK (length(btrim(barcode)) BETWEEN 1 AND 100),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    shelf_id UUID NOT NULL REFERENCES shelves(id) ON DELETE RESTRICT,
    scanned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ NOT NULL,
    client_scanned_at TIMESTAMPTZ,
    UNIQUE(session_id,client_scan_id)
);
CREATE INDEX ix_inventory_scans_page ON inventory_scans(session_id,received_at,id);
CREATE TABLE inventory_anomalies (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES inventory_sessions(id) ON DELETE RESTRICT,
    copy_id UUID,
    kind VARCHAR(32) NOT NULL CHECK (kind IN ('WRONG_SHELF','EXPECTED_BUT_MISSING','STATUS_MISMATCH','WRONG_BRANCH','UNKNOWN_BARCODE','DUPLICATE_SCAN')),
    evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence)='object'),
    detected_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_inventory_anomalies_page ON inventory_anomalies(session_id,kind,id);
