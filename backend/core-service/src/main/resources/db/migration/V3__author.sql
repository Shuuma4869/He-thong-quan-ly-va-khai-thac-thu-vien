CREATE TABLE authors (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    CONSTRAINT ck_authors_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX ix_authors_name ON authors (name);
