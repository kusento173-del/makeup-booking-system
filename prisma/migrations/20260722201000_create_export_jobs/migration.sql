CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "requested_by_user_id" UUID NOT NULL,
    "requested_by_role_code" VARCHAR(32) NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "site_id" UUID,
    "schedule_date" DATE NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "output_filename" VARCHAR(255),
    "content_type" VARCHAR(100),
    "storage_key" VARCHAR(500),
    "file_size_bytes" BIGINT,
    "file_sha256" CHAR(64),
    "row_count" INTEGER,
    "failure_reason" VARCHAR(500),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "export_jobs_requested_role_check" CHECK (
        "requested_by_role_code" IN ('ADMIN', 'CUSTOMER_SERVICE')
    ),
    CONSTRAINT "export_jobs_scope_check" CHECK (
        ("scope" = 'SINGLE_SITE' AND "site_id" IS NOT NULL)
        OR ("scope" = 'ALL_SITES' AND "site_id" IS NULL)
    ),
    CONSTRAINT "export_jobs_status_check" CHECK (
        "status" IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')
    ),
    CONSTRAINT "export_jobs_output_filename_check" CHECK (
        "output_filename" IS NULL
        OR (
            "output_filename" = btrim("output_filename")
            AND "output_filename" <> ''
            AND "output_filename" !~ '[\\/]'
        )
    ),
    CONSTRAINT "export_jobs_content_type_check" CHECK (
        "content_type" IS NULL
        OR "content_type" = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ),
    CONSTRAINT "export_jobs_storage_key_check" CHECK (
        "storage_key" IS NULL
        OR ("storage_key" = btrim("storage_key") AND "storage_key" <> '')
    ),
    CONSTRAINT "export_jobs_file_size_check" CHECK (
        "file_size_bytes" IS NULL OR "file_size_bytes" > 0
    ),
    CONSTRAINT "export_jobs_file_sha256_check" CHECK (
        "file_sha256" IS NULL OR "file_sha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "export_jobs_row_count_check" CHECK (
        "row_count" IS NULL OR "row_count" >= 0
    ),
    CONSTRAINT "export_jobs_failure_reason_check" CHECK (
        "failure_reason" IS NULL
        OR ("failure_reason" = btrim("failure_reason") AND "failure_reason" <> '')
    ),
    CONSTRAINT "export_jobs_lifecycle_check" CHECK (
        (
            "status" = 'PENDING'
            AND "started_at" IS NULL
            AND "completed_at" IS NULL
            AND "expires_at" IS NULL
            AND "failure_reason" IS NULL
            AND "output_filename" IS NULL
            AND "content_type" IS NULL
            AND "storage_key" IS NULL
            AND "file_size_bytes" IS NULL
            AND "file_sha256" IS NULL
            AND "row_count" IS NULL
        )
        OR (
            "status" = 'PROCESSING'
            AND "started_at" IS NOT NULL
            AND "completed_at" IS NULL
            AND "expires_at" IS NULL
            AND "failure_reason" IS NULL
            AND "output_filename" IS NULL
            AND "content_type" IS NULL
            AND "storage_key" IS NULL
            AND "file_size_bytes" IS NULL
            AND "file_sha256" IS NULL
            AND "row_count" IS NULL
        )
        OR (
            "status" = 'SUCCEEDED'
            AND "started_at" IS NOT NULL
            AND "completed_at" IS NOT NULL
            AND "expires_at" IS NOT NULL
            AND "failure_reason" IS NULL
            AND "output_filename" IS NOT NULL
            AND "content_type" IS NOT NULL
            AND "storage_key" IS NOT NULL
            AND "file_size_bytes" IS NOT NULL
            AND "file_sha256" IS NOT NULL
            AND "row_count" IS NOT NULL
        )
        OR (
            "status" = 'FAILED'
            AND "started_at" IS NOT NULL
            AND "completed_at" IS NOT NULL
            AND "expires_at" IS NULL
            AND "failure_reason" IS NOT NULL
            AND "output_filename" IS NULL
            AND "content_type" IS NULL
            AND "storage_key" IS NULL
            AND "file_size_bytes" IS NULL
            AND "file_sha256" IS NULL
            AND "row_count" IS NULL
        )
    ),
    CONSTRAINT "export_jobs_timeline_check" CHECK (
        ("started_at" IS NULL OR "started_at" >= "created_at")
        AND ("completed_at" IS NULL OR "completed_at" >= "started_at")
        AND ("expires_at" IS NULL OR "expires_at" > "completed_at")
    ),
    CONSTRAINT "export_jobs_row_version_check" CHECK ("row_version" > 0)
);

CREATE INDEX "export_jobs_requester_created_idx"
ON "export_jobs"("requested_by_user_id", "created_at" DESC);

CREATE INDEX "export_jobs_site_date_created_idx"
ON "export_jobs"("site_id", "schedule_date", "created_at" DESC);

CREATE INDEX "export_jobs_status_created_idx"
ON "export_jobs"("status", "created_at");

CREATE INDEX "export_jobs_expires_at_idx"
ON "export_jobs"("expires_at");

ALTER TABLE "export_jobs"
ADD CONSTRAINT "export_jobs_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "export_jobs"
ADD CONSTRAINT "export_jobs_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "protect_export_job_history"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'export job history cannot be deleted';
    END IF;

    IF NEW."id" <> OLD."id"
        OR NEW."requested_by_user_id" <> OLD."requested_by_user_id"
        OR NEW."requested_by_role_code" <> OLD."requested_by_role_code"
        OR NEW."scope" <> OLD."scope"
        OR NEW."site_id" IS DISTINCT FROM OLD."site_id"
        OR NEW."schedule_date" <> OLD."schedule_date"
        OR NEW."created_at" <> OLD."created_at"
    THEN
        RAISE EXCEPTION 'export job request fields are immutable';
    END IF;

    IF NEW."row_version" <> OLD."row_version" + 1 THEN
        RAISE EXCEPTION 'export job row version must increment by one';
    END IF;

    IF NOT (
        (OLD."status" = 'PENDING' AND NEW."status" = 'PROCESSING')
        OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('SUCCEEDED', 'FAILED'))
    ) THEN
        RAISE EXCEPTION 'invalid export job status transition';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "export_jobs_protect_history"
BEFORE UPDATE OR DELETE ON "export_jobs"
FOR EACH ROW EXECUTE FUNCTION "protect_export_job_history"();
