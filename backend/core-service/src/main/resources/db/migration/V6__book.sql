CREATE TABLE books (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_books_title_not_blank CHECK (length(btrim(title)) > 0),
    CONSTRAINT ck_books_normalized_title_not_blank CHECK (length(btrim(normalized_title)) > 0)
);

CREATE INDEX ix_books_normalized_title ON books (normalized_title, id);

CREATE TABLE book_authors (
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
    PRIMARY KEY (book_id, author_id)
);

CREATE INDEX ix_book_authors_author ON book_authors (author_id, book_id);

CREATE TABLE book_categories (
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    PRIMARY KEY (book_id, category_id)
);

CREATE INDEX ix_book_categories_category ON book_categories (category_id, book_id);
