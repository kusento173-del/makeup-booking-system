CREATE FUNCTION validate_fixed_rule_source()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source "fixed_appointment_requests"%ROWTYPE;
BEGIN
    SELECT * INTO source FROM "fixed_appointment_requests" WHERE "id" = NEW."source_request_id";
    IF NOT FOUND
        OR source."status" <> 'APPROVED'
        OR source."request_type" NOT IN ('CREATE', 'CHANGE')
        OR NEW."host_id" IS DISTINCT FROM source."host_id"
        OR NEW."artist_id" IS DISTINCT FROM source."target_artist_id"
        OR NEW."site_id" IS DISTINCT FROM source."site_id"
        OR NEW."start_minute" IS DISTINCT FROM source."target_start_minute"
        OR NEW."duration_minutes" IS DISTINCT FROM source."target_duration_minutes"
        OR NEW."valid_from" IS DISTINCT FROM source."effective_from"
    THEN
        RAISE EXCEPTION 'fixed rule must match an approved create or change request'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "fixed_rules_validate_source"
BEFORE INSERT ON "fixed_appointment_rules"
FOR EACH ROW EXECUTE FUNCTION validate_fixed_rule_source();

CREATE FUNCTION validate_fixed_rule_ending()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    ending "fixed_appointment_requests"%ROWTYPE;
BEGIN
    IF NEW."status" = 'ENDED' THEN
        SELECT * INTO ending FROM "fixed_appointment_requests" WHERE "id" = NEW."ended_by_request_id";
        IF NOT FOUND
            OR ending."status" <> 'APPROVED'
            OR ending."request_type" NOT IN ('CHANGE', 'CANCEL')
            OR ending."current_rule_id" IS DISTINCT FROM OLD."id"
            OR ending."host_id" IS DISTINCT FROM OLD."host_id"
            OR ending."site_id" IS DISTINCT FROM OLD."site_id"
            OR ending."effective_from" IS DISTINCT FROM NEW."valid_until"
        THEN
            RAISE EXCEPTION 'fixed rule ending must match an approved change or cancel request'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "fixed_rules_validate_ending"
BEFORE UPDATE ON "fixed_appointment_rules"
FOR EACH ROW EXECUTE FUNCTION validate_fixed_rule_ending();

CREATE OR REPLACE FUNCTION validate_fixed_rule_weekday()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent "fixed_appointment_rules"%ROWTYPE;
    source "fixed_appointment_requests"%ROWTYPE;
BEGIN
    SELECT * INTO parent FROM "fixed_appointment_rules" WHERE "id" = NEW."rule_id";
    SELECT * INTO source FROM "fixed_appointment_requests" WHERE "id" = parent."source_request_id";
    IF NOT FOUND
        OR NOT (NEW."iso_weekday" = ANY(source."target_weekdays"))
        OR NEW."host_id" IS DISTINCT FROM parent."host_id"
        OR NEW."artist_id" IS DISTINCT FROM parent."artist_id"
        OR NEW."site_id" IS DISTINCT FROM parent."site_id"
        OR NEW."start_minute" IS DISTINCT FROM parent."start_minute"
        OR NEW."end_minute" IS DISTINCT FROM parent."start_minute" + parent."duration_minutes"
        OR NEW."valid_from" IS DISTINCT FROM parent."valid_from"
        OR NEW."valid_until" IS DISTINCT FROM parent."valid_until"
    THEN
        RAISE EXCEPTION 'fixed rule weekday must match its approved request and parent rule'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
