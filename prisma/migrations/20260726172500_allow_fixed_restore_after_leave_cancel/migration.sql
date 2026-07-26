CREATE OR REPLACE FUNCTION protect_appointment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    restoring_after_artist_leave BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'appointments cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    restoring_after_artist_leave :=
        OLD."status" = 'CANCELLED'
        AND NEW."status" = 'BOOKED'
        AND OLD."appointment_type" = 'FIXED'
        AND OLD."fixed_rule_id" IS NOT NULL
        AND OLD."cancellation_reason_code" = 'ARTIST_LEAVE'
        AND OLD."cancellation_source_type" = 'LEAVE_RECORD'
        AND OLD."cancellation_source_id" IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM "leave_records"
            WHERE "id" = OLD."cancellation_source_id"
              AND "status" = 'CANCELLED'
        );

    IF NEW."row_version" <> OLD."row_version" + 1
        OR NEW."updated_at" < OLD."updated_at"
    THEN
        RAISE EXCEPTION 'appointment version history is invalid'
            USING ERRCODE = '55000';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."host_id" IS DISTINCT FROM OLD."host_id"
        OR NEW."host_code_snapshot" IS DISTINCT FROM OLD."host_code_snapshot"
        OR NEW."host_name_snapshot" IS DISTINCT FROM OLD."host_name_snapshot"
        OR NEW."artist_id" IS DISTINCT FROM OLD."artist_id"
        OR NEW."artist_nickname_snapshot" IS DISTINCT FROM OLD."artist_nickname_snapshot"
        OR NEW."site_id" IS DISTINCT FROM OLD."site_id"
        OR NEW."site_name_snapshot" IS DISTINCT FROM OLD."site_name_snapshot"
        OR NEW."operator_id_at_booking" IS DISTINCT FROM OLD."operator_id_at_booking"
        OR NEW."operator_name_snapshot" IS DISTINCT FROM OLD."operator_name_snapshot"
        OR NEW."appointment_date" IS DISTINCT FROM OLD."appointment_date"
        OR NEW."start_at" IS DISTINCT FROM OLD."start_at"
        OR NEW."end_at" IS DISTINCT FROM OLD."end_at"
        OR NEW."duration_minutes" IS DISTINCT FROM OLD."duration_minutes"
        OR NEW."appointment_type" IS DISTINCT FROM OLD."appointment_type"
        OR NEW."fixed_rule_id" IS DISTINCT FROM OLD."fixed_rule_id"
        OR NEW."rescheduled_from_appointment_id" IS DISTINCT FROM OLD."rescheduled_from_appointment_id"
        OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
        OR NEW."created_by_role" IS DISTINCT FROM OLD."created_by_role"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'appointment identity and history are immutable'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."status" = 'BOOKED'
        AND NEW."status" IN ('CANCELLED', 'COMPLETED')
        AND NEW."daily_sequence" = OLD."daily_sequence"
    THEN
        RETURN NEW;
    END IF;

    IF restoring_after_artist_leave
        AND NEW."daily_sequence" IN (1, 2)
        AND NEW."cancelled_at" IS NULL
        AND NEW."cancelled_by_user_id" IS NULL
        AND NEW."cancellation_reason_code" IS NULL
        AND NEW."cancellation_reason_text" IS NULL
        AND NEW."cancellation_source_type" IS NULL
        AND NEW."cancellation_source_id" IS NULL
        AND NEW."completed_at" IS NULL
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'appointment state transition is not allowed'
        USING ERRCODE = '55000';
END;
$$;
