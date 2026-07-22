ALTER TABLE "export_jobs"
ADD COLUMN "storage_deleted_at" TIMESTAMPTZ(3);

CREATE INDEX "export_jobs_cleanup_idx"
ON "export_jobs"("status", "storage_deleted_at", "expires_at");

CREATE OR REPLACE FUNCTION "protect_export_job_history"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'export job history cannot be deleted'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW."id" <> OLD."id"
        OR NEW."requested_by_user_id" <> OLD."requested_by_user_id"
        OR NEW."requested_by_role_code" <> OLD."requested_by_role_code"
        OR NEW."scope" <> OLD."scope"
        OR NEW."site_id" IS DISTINCT FROM OLD."site_id"
        OR NEW."schedule_date" <> OLD."schedule_date"
        OR NEW."created_at" <> OLD."created_at"
    THEN
        RAISE EXCEPTION 'export job request fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW."row_version" <> OLD."row_version" + 1 THEN
        RAISE EXCEPTION 'export job row version must increment by one'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD."status" = 'SUCCEEDED'
        AND NEW."status" = 'SUCCEEDED'
        AND OLD."storage_deleted_at" IS NULL
        AND NEW."storage_deleted_at" IS NOT NULL
    THEN
        IF NEW."output_filename" IS DISTINCT FROM OLD."output_filename"
            OR NEW."content_type" IS DISTINCT FROM OLD."content_type"
            OR NEW."storage_key" IS DISTINCT FROM OLD."storage_key"
            OR NEW."file_size_bytes" IS DISTINCT FROM OLD."file_size_bytes"
            OR NEW."file_sha256" IS DISTINCT FROM OLD."file_sha256"
            OR NEW."row_count" IS DISTINCT FROM OLD."row_count"
            OR NEW."failure_reason" IS DISTINCT FROM OLD."failure_reason"
            OR NEW."started_at" IS DISTINCT FROM OLD."started_at"
            OR NEW."completed_at" IS DISTINCT FROM OLD."completed_at"
            OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
        THEN
            RAISE EXCEPTION 'completed export history is immutable'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW."storage_deleted_at" IS DISTINCT FROM OLD."storage_deleted_at" THEN
        RAISE EXCEPTION 'invalid export storage cleanup transition'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NOT (
        (OLD."status" = 'PENDING' AND NEW."status" = 'PROCESSING')
        OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('SUCCEEDED', 'FAILED'))
    ) THEN
        RAISE EXCEPTION 'invalid export job status transition'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
