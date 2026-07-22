CREATE FUNCTION protect_appointment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'appointments cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."status" <> 'BOOKED'
        OR NEW."status" NOT IN ('CANCELLED', 'COMPLETED')
        OR NEW."row_version" <> OLD."row_version" + 1
        OR NEW."updated_at" < OLD."updated_at"
        OR NEW."id" IS DISTINCT FROM OLD."id"
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
        OR NEW."daily_sequence" IS DISTINCT FROM OLD."daily_sequence"
        OR NEW."rescheduled_from_appointment_id" IS DISTINCT FROM OLD."rescheduled_from_appointment_id"
        OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
        OR NEW."created_by_role" IS DISTINCT FROM OLD."created_by_role"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'appointment identity and history are immutable'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "appointments_protect_history"
BEFORE UPDATE OR DELETE ON "appointments"
FOR EACH ROW
EXECUTE FUNCTION protect_appointment_history();
