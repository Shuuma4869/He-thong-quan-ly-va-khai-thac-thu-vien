-- V23 follows the merged V22 book-search migration; it does not alter Search behavior.
CREATE TABLE category_aliases (
    id UUID PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    alias_name VARCHAR(150) NOT NULL,
    normalized_alias VARCHAR(150) NOT NULL UNIQUE,
    CONSTRAINT ck_category_aliases_name_not_blank CHECK (length(btrim(alias_name)) > 0),
    CONSTRAINT ck_category_aliases_normalized_not_blank CHECK (length(btrim(normalized_alias)) > 0)
);

CREATE INDEX ix_category_aliases_category ON category_aliases (category_id, normalized_alias, id);
