CREATE TABLE favorites (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_favorites PRIMARY KEY (user_id, book_id)
);

CREATE INDEX ix_favorites_user_created_book
    ON favorites (user_id, created_at DESC, book_id ASC);
CREATE INDEX ix_favorites_book_user
    ON favorites (book_id, user_id);
