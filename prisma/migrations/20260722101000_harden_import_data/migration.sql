ALTER TABLE "import_batches"
DROP CONSTRAINT "import_batches_timeline_check";

ALTER TABLE "import_batches"
ADD CONSTRAINT "import_batches_timeline_check" CHECK (
    ("confirmed_at" IS NULL OR "confirmed_at" >= "created_at")
    AND (
        "started_at" IS NULL
        OR ("confirmed_at" IS NOT NULL AND "started_at" >= "confirmed_at")
    )
    AND (
        "completed_at" IS NULL
        OR "completed_at" >= COALESCE("started_at", "confirmed_at", "created_at")
    )
);

CREATE INDEX "host_profiles_source_import_batch_idx"
ON "host_profiles"("source_import_batch_id");

CREATE INDEX "artist_profiles_source_import_batch_idx"
ON "artist_profiles"("source_import_batch_id");

CREATE INDEX "operator_profiles_source_import_batch_idx"
ON "operator_profiles"("source_import_batch_id");

CREATE INDEX "host_operator_relations_source_import_batch_idx"
ON "host_operator_relations"("source_import_batch_id");
