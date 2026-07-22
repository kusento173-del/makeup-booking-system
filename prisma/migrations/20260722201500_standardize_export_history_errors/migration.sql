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
