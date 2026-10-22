CREATE TABLE "metadata_lookups" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "isbn13" VARCHAR(13) NOT NULL,
    "attempts" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "metadata_lookups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "metadata_lookups_isbn_digits" CHECK (isbn13 ~ '^[0-9]{13}$'),
    CONSTRAINT "metadata_lookups_attempts_array" CHECK (jsonb_typeof(attempts) = 'array')
);
CREATE INDEX "metadata_lookups_owner_id_created_at_id_idx" ON "metadata_lookups"("owner_id", "created_at", "id");
CREATE INDEX "metadata_lookups_owner_id_isbn13_idx" ON "metadata_lookups"("owner_id", "isbn13");
