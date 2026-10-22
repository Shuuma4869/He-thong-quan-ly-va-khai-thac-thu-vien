CREATE TABLE reviews (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
    body TEXT NOT NULL,
    rating SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_reviews_user_book UNIQUE (user_id, book_id),
    CONSTRAINT ck_reviews_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
    CONSTRAINT ck_reviews_rating_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX ix_reviews_book_created_id
    ON reviews (book_id, created_at DESC, id ASC);
