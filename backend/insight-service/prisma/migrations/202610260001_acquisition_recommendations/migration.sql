CREATE TABLE acquisition_recommendations (
    id UUID PRIMARY KEY,
    book_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    window_from TIMESTAMPTZ(6) NOT NULL,
    window_to TIMESTAMPTZ(6) NOT NULL,
    snapshot_at TIMESTAMPTZ(6) NOT NULL,
    source_contract_version VARCHAR(40) NOT NULL,
    source_revision VARCHAR(255) NOT NULL,
    score_version VARCHAR(40) NOT NULL,
    score DECIMAL(5,1) NOT NULL CHECK (score BETWEEN 0 AND 100),
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    evidence JSONB NOT NULL,
    state VARCHAR(8) NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','APPROVED','REJECTED')),
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ(6),
    review_reason VARCHAR(1000),
    CONSTRAINT ck_acquisition_window CHECK (window_from < window_to AND window_to <= snapshot_at),
    CONSTRAINT uq_acquisition_source_snapshot UNIQUE
        (book_id, branch_id, window_from, window_to, snapshot_at, source_contract_version, source_revision, score_version),
    CONSTRAINT ck_acquisition_review CHECK (
        (state = 'DRAFT' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
        OR (state <> 'DRAFT' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
            AND review_reason IS NOT NULL AND length(btrim(review_reason)) >= 10)
    )
);
CREATE INDEX ix_acquisition_recommendations_state_created ON acquisition_recommendations(state, created_at, id);
CREATE INDEX ix_acquisition_recommendations_scope_created ON acquisition_recommendations(book_id, branch_id, created_at, id);

CREATE TABLE acquisition_decisions (
    id UUID PRIMARY KEY,
    recommendation_id UUID NOT NULL REFERENCES acquisition_recommendations(id) ON DELETE RESTRICT,
    action VARCHAR(8) NOT NULL CHECK (action IN ('APPROVED','REJECTED')),
    actor_id UUID NOT NULL,
    reason VARCHAR(1000) NOT NULL CHECK (length(btrim(reason)) >= 10),
    version INTEGER NOT NULL CHECK (version > 0),
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_acquisition_decision_version UNIQUE (recommendation_id, version)
);
CREATE INDEX ix_acquisition_decisions_created ON acquisition_decisions(recommendation_id, created_at, id);
