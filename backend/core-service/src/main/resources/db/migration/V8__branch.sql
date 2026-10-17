CREATE TABLE branches (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT ck_branches_code_not_blank CHECK (length(btrim(code)) > 0),
    CONSTRAINT ck_branches_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT ck_branches_status CHECK (status IN ('ACTIVE', 'DISABLED'))
);
