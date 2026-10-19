-- A revision must not be reused after removing and recreating a subject's image.
CREATE SEQUENCE catalog_media_revision_seq AS BIGINT MINVALUE 1;
SELECT setval('catalog_media_revision_seq', COALESCE(MAX(version), 0) + 1, false)
FROM catalog_media_references;
ALTER TABLE catalog_media_references
    ALTER COLUMN version SET DEFAULT nextval('catalog_media_revision_seq');
