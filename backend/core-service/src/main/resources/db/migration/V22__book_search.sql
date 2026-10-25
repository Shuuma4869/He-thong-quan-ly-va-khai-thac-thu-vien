CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

ALTER TABLE books
    ADD COLUMN search_title TEXT,
    ADD COLUMN search_description TEXT,
    ADD COLUMN search_vector TSVECTOR;

CREATE FUNCTION refresh_book_search() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.search_title := lower(public.unaccent(NEW.title));
    NEW.search_description := lower(public.unaccent(coalesce(NEW.description, '')));
    NEW.search_vector := to_tsvector('simple', NEW.search_title || ' ' || NEW.search_description);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_refresh_book_search
    BEFORE INSERT OR UPDATE OF title, description ON books
    FOR EACH ROW EXECUTE FUNCTION refresh_book_search();

UPDATE books SET title = title;

ALTER TABLE books
    ALTER COLUMN search_title SET NOT NULL,
    ALTER COLUMN search_description SET NOT NULL,
    ALTER COLUMN search_vector SET NOT NULL;

CREATE INDEX ix_books_search_vector ON books USING GIN (search_vector);
CREATE INDEX ix_books_search_title_trgm ON books USING GIN (search_title public.gin_trgm_ops);
