CREATE TABLE shelves (
    id UUID PRIMARY KEY,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    code VARCHAR(30) NOT NULL,
    label VARCHAR(150) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_shelves_branch_code UNIQUE (branch_id, code),
    CONSTRAINT ck_shelves_code_not_blank CHECK (length(btrim(code)) > 0),
    CONSTRAINT ck_shelves_label_not_blank CHECK (length(btrim(label)) > 0)
);

CREATE INDEX ix_shelves_branch_order ON shelves (branch_id, sort_order, code, id);
