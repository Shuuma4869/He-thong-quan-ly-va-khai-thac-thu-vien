ALTER TABLE reviews ADD COLUMN moderation_status VARCHAR(16) NOT NULL DEFAULT 'VISIBLE';
ALTER TABLE reviews ADD CONSTRAINT ck_reviews_moderation_status
    CHECK (moderation_status IN ('VISIBLE', 'HIDDEN'));

CREATE TABLE review_reports (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    review_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body_snapshot TEXT NOT NULL,
    rating_snapshot SMALLINT NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT uq_review_reports_reporter_review UNIQUE (reporter_id, review_id),
    CONSTRAINT ck_review_reports_reason CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
    CONSTRAINT ck_review_reports_status CHECK (status IN ('OPEN', 'RESOLVED'))
);
CREATE INDEX ix_review_reports_queue ON review_reports (status, created_at, id);
CREATE INDEX ix_review_reports_reporter_created ON review_reports (reporter_id, created_at DESC);

CREATE TABLE review_moderation_audit (
    id UUID PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES review_reports(id) ON DELETE RESTRICT,
    review_id UUID NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(16) NOT NULL,
    reason TEXT NOT NULL,
    before_status VARCHAR(16),
    after_status VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_review_moderation_action CHECK (action IN ('HIDE', 'DISMISS')),
    CONSTRAINT ck_review_moderation_reason CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500)
);
