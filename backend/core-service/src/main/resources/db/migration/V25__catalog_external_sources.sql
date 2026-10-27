CREATE TABLE catalog_external_sources (
    source_code VARCHAR(40) NOT NULL,
    source_record_id VARCHAR(100) NOT NULL,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
    source_url TEXT NOT NULL,
    source_snapshot_sha256 CHAR(64) NOT NULL,
    source_title TEXT NOT NULL,
    source_authors TEXT NOT NULL,
    ebook_released_on DATE,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_code, source_record_id),
    CONSTRAINT ck_catalog_external_source_url CHECK (left(source_url, 8) = 'https://'),
    CONSTRAINT ck_catalog_external_source_sha CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX ix_catalog_external_sources_book ON catalog_external_sources(book_id);
