CREATE TABLE catalog_media_references (
    id UUID PRIMARY KEY,
    edition_id UUID UNIQUE REFERENCES editions(id) ON DELETE CASCADE,
    author_id UUID UNIQUE REFERENCES authors(id) ON DELETE CASCADE,
    source VARCHAR(30) NOT NULL CHECK (source IN ('open-library','google-books','wikimedia')),
    source_id VARCHAR(500) NOT NULL,
    source_url VARCHAR(2048) NOT NULL,
    image_url VARCHAR(2048) NOT NULL,
    license VARCHAR(500) NOT NULL,
    license_url VARCHAR(2048) NOT NULL,
    attribution VARCHAR(2000) NOT NULL,
    evidence VARCHAR(2000) NOT NULL,
    mime VARCHAR(30) NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
    byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 2097152),
    approved_by UUID NOT NULL REFERENCES users(id),
    approved_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT ck_media_one_subject CHECK ((edition_id IS NULL) <> (author_id IS NULL))
);
