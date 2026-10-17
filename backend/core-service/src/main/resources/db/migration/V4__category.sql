CREATE TABLE categories (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    normalized_name VARCHAR(150) NOT NULL UNIQUE,
    CONSTRAINT ck_categories_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT ck_categories_normalized_name_not_blank CHECK (length(btrim(normalized_name)) > 0)
);
