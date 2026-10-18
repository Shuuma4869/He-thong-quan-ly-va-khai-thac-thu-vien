CREATE TABLE publishers (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    CONSTRAINT ck_publishers_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX ix_publishers_name ON publishers (name);
