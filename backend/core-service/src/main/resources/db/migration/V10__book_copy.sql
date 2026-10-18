CREATE TABLE book_copies (
    id UUID PRIMARY KEY,
    edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
    barcode VARCHAR(100) NOT NULL UNIQUE,
    shelf_id UUID NOT NULL REFERENCES shelves(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROCESS',
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_book_copies_barcode_not_blank CHECK (length(btrim(barcode)) > 0),
    CONSTRAINT ck_book_copies_version_non_negative CHECK (version >= 0),
    CONSTRAINT ck_book_copies_status CHECK (status IN ('IN_PROCESS','AVAILABLE','ON_LOAN','ON_HOLD','LOST','DAMAGED','WITHDRAWN'))
);

CREATE INDEX ix_book_copies_edition ON book_copies (edition_id, id);
CREATE INDEX ix_book_copies_shelf_status ON book_copies (shelf_id, status, id);
