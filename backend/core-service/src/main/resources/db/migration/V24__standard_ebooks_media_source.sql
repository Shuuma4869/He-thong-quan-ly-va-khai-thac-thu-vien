ALTER TABLE catalog_media_references
    DROP CONSTRAINT catalog_media_references_source_check;

ALTER TABLE catalog_media_references
    ADD CONSTRAINT catalog_media_references_source_check
    CHECK (source IN ('open-library', 'google-books', 'wikimedia', 'standard-ebooks'));
