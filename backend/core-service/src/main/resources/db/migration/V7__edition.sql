CREATE TABLE editions (
    id UUID PRIMARY KEY,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
    publisher_id UUID REFERENCES publishers(id) ON DELETE RESTRICT,
    isbn13 VARCHAR(13),
    publication_year SMALLINT,
    language VARCHAR(35),
    CONSTRAINT ck_editions_isbn13_format CHECK (isbn13 IS NULL OR isbn13 ~ '^[0-9]{13}$'),
    CONSTRAINT ck_editions_publication_year CHECK (publication_year IS NULL OR publication_year BETWEEN 1000 AND 9999),
    CONSTRAINT ck_editions_language_not_blank CHECK (language IS NULL OR length(btrim(language)) > 0)
);

CREATE INDEX ix_editions_book ON editions (book_id, id);
CREATE INDEX ix_editions_publisher ON editions (publisher_id) WHERE publisher_id IS NOT NULL;
