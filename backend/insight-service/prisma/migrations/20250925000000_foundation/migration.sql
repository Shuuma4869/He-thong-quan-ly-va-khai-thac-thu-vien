CREATE TABLE "service_metadata" (
    "metadata_key" VARCHAR(100) NOT NULL,
    "metadata_value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_metadata_pkey" PRIMARY KEY ("metadata_key")
);

INSERT INTO "service_metadata" ("metadata_key", "metadata_value")
VALUES ('schema_stage', 'foundation');
