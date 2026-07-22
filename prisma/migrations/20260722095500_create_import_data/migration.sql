CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "import_type" VARCHAR(32) NOT NULL,
    "template_version" VARCHAR(16) NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
    "uploaded_by_user_id" UUID NOT NULL,
    "confirmed_by_user_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "failure_reason" VARCHAR(500),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_batches_import_type_check" CHECK (
        "import_type" IN ('HOST', 'ARTIST', 'OPERATOR', 'HOST_OPERATOR_RELATION')
    ),
    CONSTRAINT "import_batches_template_version_check" CHECK (
        "template_version" = btrim("template_version") AND "template_version" <> ''
    ),
    CONSTRAINT "import_batches_mode_check" CHECK ("mode" IN ('MERGE', 'SNAPSHOT')),
    CONSTRAINT "import_batches_original_filename_check" CHECK (
        "original_filename" = btrim("original_filename") AND "original_filename" <> ''
    ),
    CONSTRAINT "import_batches_file_sha256_check" CHECK (
        "file_sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "import_batches_storage_key_check" CHECK (
        "storage_key" = btrim("storage_key") AND "storage_key" <> ''
    ),
    CONSTRAINT "import_batches_status_check" CHECK (
        "status" IN (
            'UPLOADED',
            'VALIDATING',
            'PREVIEW_READY',
            'CONFIRMED',
            'IMPORTING',
            'SUCCEEDED',
            'FAILED'
        )
    ),
    CONSTRAINT "import_batches_summary_check" CHECK (jsonb_typeof("summary") = 'object'),
    CONSTRAINT "import_batches_failure_reason_check" CHECK (
        "failure_reason" IS NULL
        OR ("failure_reason" = btrim("failure_reason") AND "failure_reason" <> '')
    ),
    CONSTRAINT "import_batches_confirmation_pair_check" CHECK (
        ("confirmed_by_user_id" IS NULL) = ("confirmed_at" IS NULL)
    ),
    CONSTRAINT "import_batches_lifecycle_check" CHECK (
        (
            "status" IN ('UPLOADED', 'VALIDATING', 'PREVIEW_READY')
            AND "confirmed_at" IS NULL
            AND "started_at" IS NULL
            AND "completed_at" IS NULL
            AND "failure_reason" IS NULL
        )
        OR (
            "status" = 'CONFIRMED'
            AND "confirmed_at" IS NOT NULL
            AND "started_at" IS NULL
            AND "completed_at" IS NULL
            AND "failure_reason" IS NULL
        )
        OR (
            "status" = 'IMPORTING'
            AND "confirmed_at" IS NOT NULL
            AND "started_at" IS NOT NULL
            AND "completed_at" IS NULL
            AND "failure_reason" IS NULL
        )
        OR (
            "status" = 'SUCCEEDED'
            AND "confirmed_at" IS NOT NULL
            AND "started_at" IS NOT NULL
            AND "completed_at" IS NOT NULL
            AND "failure_reason" IS NULL
        )
        OR (
            "status" = 'FAILED'
            AND "completed_at" IS NOT NULL
            AND "failure_reason" IS NOT NULL
        )
    ),
    CONSTRAINT "import_batches_timeline_check" CHECK (
        ("confirmed_at" IS NULL OR "confirmed_at" >= "created_at")
        AND ("started_at" IS NULL OR "started_at" >= "confirmed_at")
        AND (
            "completed_at" IS NULL
            OR "completed_at" >= COALESCE("started_at", "confirmed_at", "created_at")
        )
    ),
    CONSTRAINT "import_batches_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "import_rows" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "import_batch_id" UUID NOT NULL,
    "sheet_name" VARCHAR(128) NOT NULL,
    "row_number" INTEGER NOT NULL,
    "business_key" VARCHAR(160),
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB NOT NULL,
    "validation_status" VARCHAR(16) NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "planned_action" VARCHAR(32),
    "target_entity_id" UUID,
    "applied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_rows_sheet_name_check" CHECK (
        "sheet_name" = btrim("sheet_name") AND "sheet_name" <> ''
    ),
    CONSTRAINT "import_rows_row_number_check" CHECK ("row_number" > 0),
    CONSTRAINT "import_rows_business_key_check" CHECK (
        "business_key" IS NULL OR ("business_key" = btrim("business_key") AND "business_key" <> '')
    ),
    CONSTRAINT "import_rows_raw_data_check" CHECK (jsonb_typeof("raw_data") = 'object'),
    CONSTRAINT "import_rows_normalized_data_check" CHECK (
        jsonb_typeof("normalized_data") = 'object'
    ),
    CONSTRAINT "import_rows_validation_status_check" CHECK (
        "validation_status" IN ('VALID', 'WARNING', 'ERROR')
    ),
    CONSTRAINT "import_rows_errors_check" CHECK (jsonb_typeof("errors") = 'array'),
    CONSTRAINT "import_rows_planned_action_check" CHECK (
        "planned_action" IS NULL
        OR "planned_action" IN (
            'CREATE',
            'UPDATE',
            'END_RELATION',
            'NO_CHANGE',
            'DEACTIVATE',
            'REJECT'
        )
    ),
    CONSTRAINT "import_rows_row_version_check" CHECK ("row_version" > 0)
);

CREATE INDEX "import_batches_type_hash_status_idx"
ON "import_batches"("import_type", "file_sha256", "status");

CREATE INDEX "import_batches_status_created_idx"
ON "import_batches"("status", "created_at" DESC);

CREATE INDEX "import_batches_uploader_created_idx"
ON "import_batches"("uploaded_by_user_id", "created_at" DESC);

CREATE UNIQUE INDEX "import_rows_batch_sheet_row_uq"
ON "import_rows"("import_batch_id", "sheet_name", "row_number");

CREATE INDEX "import_rows_batch_validation_idx"
ON "import_rows"("import_batch_id", "validation_status");

CREATE INDEX "import_rows_target_entity_idx"
ON "import_rows"("target_entity_id");

ALTER TABLE "import_batches"
ADD CONSTRAINT "import_batches_uploaded_by_user_id_fkey"
FOREIGN KEY ("uploaded_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "import_batches"
ADD CONSTRAINT "import_batches_confirmed_by_user_id_fkey"
FOREIGN KEY ("confirmed_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "import_rows"
ADD CONSTRAINT "import_rows_import_batch_id_fkey"
FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "host_profiles" ADD COLUMN "source_import_batch_id" UUID;
ALTER TABLE "artist_profiles" ADD COLUMN "source_import_batch_id" UUID;
ALTER TABLE "operator_profiles" ADD COLUMN "source_import_batch_id" UUID;
ALTER TABLE "host_operator_relations" ADD COLUMN "source_import_batch_id" UUID;

ALTER TABLE "host_profiles"
ADD CONSTRAINT "host_profiles_source_import_batch_id_fkey"
FOREIGN KEY ("source_import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_profiles"
ADD CONSTRAINT "artist_profiles_source_import_batch_id_fkey"
FOREIGN KEY ("source_import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_profiles"
ADD CONSTRAINT "operator_profiles_source_import_batch_id_fkey"
FOREIGN KEY ("source_import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "host_operator_relations"
ADD CONSTRAINT "host_operator_relations_source_import_batch_id_fkey"
FOREIGN KEY ("source_import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
