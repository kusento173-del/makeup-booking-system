CREATE FUNCTION valid_iso_weekdays(value SMALLINT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT cardinality(value) BETWEEN 1 AND 7
       AND value <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::SMALLINT[]
       AND cardinality(value) = (SELECT count(DISTINCT day) FROM unnest(value) AS day)
$$;

CREATE TABLE "fixed_appointment_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "request_type" VARCHAR(16) NOT NULL,
    "host_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "current_rule_id" UUID,
    "target_artist_id" UUID,
    "target_weekdays" SMALLINT[] NOT NULL,
    "target_start_minute" SMALLINT,
    "target_duration_minutes" SMALLINT,
    "effective_from" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "submitted_by_operator_id" UUID NOT NULL,
    "submitted_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fixed_appointment_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fixed_requests_type_check" CHECK ("request_type" IN ('CREATE', 'CHANGE', 'CANCEL')),
    CONSTRAINT "fixed_requests_target_check" CHECK (
        (
            "request_type" = 'CREATE'
            AND "current_rule_id" IS NULL
            AND "target_artist_id" IS NOT NULL
            AND valid_iso_weekdays("target_weekdays")
            AND "target_start_minute" IS NOT NULL
            AND "target_duration_minutes" IS NOT NULL
        )
        OR (
            "request_type" = 'CHANGE'
            AND "current_rule_id" IS NOT NULL
            AND "target_artist_id" IS NOT NULL
            AND valid_iso_weekdays("target_weekdays")
            AND "target_start_minute" IS NOT NULL
            AND "target_duration_minutes" IS NOT NULL
        )
        OR (
            "request_type" = 'CANCEL'
            AND "current_rule_id" IS NOT NULL
            AND "target_artist_id" IS NULL
            AND cardinality("target_weekdays") = 0
            AND "target_start_minute" IS NULL
            AND "target_duration_minutes" IS NULL
        )
    ),
    CONSTRAINT "fixed_requests_time_check" CHECK (
        "target_start_minute" IS NULL OR (
            "target_start_minute" BETWEEN 0 AND 1425
            AND MOD("target_start_minute", 15) = 0
            AND "target_duration_minutes" IN (15, 30, 45, 60)
            AND "target_start_minute" + "target_duration_minutes" <= 1440
        )
    ),
    CONSTRAINT "fixed_requests_status_check" CHECK (
        ("status" IN ('PENDING', 'WITHDRAWN') AND "reviewed_by_user_id" IS NULL AND "reviewed_at" IS NULL)
        OR ("status" IN ('APPROVED', 'REJECTED') AND "reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
    ),
    CONSTRAINT "fixed_requests_text_check" CHECK (
        "reason" = btrim("reason") AND "reason" <> ''
        AND ("review_comment" IS NULL OR ("review_comment" = btrim("review_comment") AND "review_comment" <> ''))
    ),
    CONSTRAINT "fixed_requests_row_version_check" CHECK ("row_version" > 0)
);

CREATE UNIQUE INDEX "fixed_requests_pending_host_uq"
ON "fixed_appointment_requests" ("host_id") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "fixed_requests_id_site_uq"
ON "fixed_appointment_requests" ("id", "site_id");
CREATE INDEX "fixed_requests_site_status_submitted_idx"
ON "fixed_appointment_requests" ("site_id", "status", "submitted_at");
CREATE INDEX "fixed_requests_operator_submitted_idx"
ON "fixed_appointment_requests" ("submitted_by_operator_id", "submitted_at" DESC);
CREATE INDEX "fixed_requests_current_rule_idx"
ON "fixed_appointment_requests" ("current_rule_id");

CREATE TABLE "fixed_appointment_rules" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "source_request_id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "ended_by_request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fixed_appointment_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fixed_rules_time_check" CHECK (
        "start_minute" BETWEEN 0 AND 1425
        AND MOD("start_minute", 15) = 0
        AND "duration_minutes" IN (15, 30, 45, 60)
        AND "start_minute" + "duration_minutes" <= 1440
    ),
    CONSTRAINT "fixed_rules_state_check" CHECK (
        ("status" = 'ACTIVE' AND "valid_until" IS NULL AND "ended_by_request_id" IS NULL)
        OR (
            "status" = 'ENDED' AND "valid_until" IS NOT NULL
            AND "valid_until" > "valid_from" AND "ended_by_request_id" IS NOT NULL
        )
    ),
    CONSTRAINT "fixed_rules_row_version_check" CHECK ("row_version" > 0)
);

CREATE UNIQUE INDEX "fixed_rules_source_request_uq" ON "fixed_appointment_rules" ("source_request_id");
CREATE UNIQUE INDEX "fixed_rules_ended_by_request_uq" ON "fixed_appointment_rules" ("ended_by_request_id");
CREATE UNIQUE INDEX "fixed_rules_id_site_uq" ON "fixed_appointment_rules" ("id", "site_id");
CREATE UNIQUE INDEX "fixed_rules_source_request_site_uq" ON "fixed_appointment_rules" ("source_request_id", "site_id");
CREATE UNIQUE INDEX "fixed_rules_ended_by_request_site_uq" ON "fixed_appointment_rules" ("ended_by_request_id", "site_id");
CREATE UNIQUE INDEX "fixed_rules_active_host_uq"
ON "fixed_appointment_rules" ("host_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "fixed_rules_artist_status_valid_idx"
ON "fixed_appointment_rules" ("artist_id", "status", "valid_from");
CREATE INDEX "fixed_rules_site_status_valid_idx"
ON "fixed_appointment_rules" ("site_id", "status", "valid_from");

CREATE TABLE "fixed_appointment_rule_weekdays" (
    "rule_id" UUID NOT NULL,
    "iso_weekday" SMALLINT NOT NULL,
    "host_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "minute_range" INT4RANGE GENERATED ALWAYS AS (int4range("start_minute", "end_minute", '[)')) STORED,
    "active_range" DATERANGE GENERATED ALWAYS AS (daterange("valid_from", "valid_until", '[)')) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_rule_weekdays_pkey" PRIMARY KEY ("rule_id", "iso_weekday"),
    CONSTRAINT "fixed_rule_weekdays_day_check" CHECK ("iso_weekday" BETWEEN 1 AND 7),
    CONSTRAINT "fixed_rule_weekdays_time_check" CHECK (
        "start_minute" BETWEEN 0 AND 1425 AND MOD("start_minute", 15) = 0
        AND "end_minute" > "start_minute" AND "end_minute" <= 1440
        AND "end_minute" - "start_minute" IN (15, 30, 45, 60)
    ),
    CONSTRAINT "fixed_rule_weekdays_dates_check" CHECK (
        "valid_until" IS NULL OR "valid_until" > "valid_from"
    )
);

CREATE INDEX "fixed_rule_weekdays_artist_day_valid_idx"
ON "fixed_appointment_rule_weekdays" ("artist_id", "iso_weekday", "valid_from");
CREATE INDEX "fixed_rule_weekdays_host_day_valid_idx"
ON "fixed_appointment_rule_weekdays" ("host_id", "iso_weekday", "valid_from");

ALTER TABLE "fixed_appointment_rule_weekdays"
ADD CONSTRAINT "fixed_rule_weekdays_artist_time_excl"
EXCLUDE USING gist (
    "artist_id" WITH =, "iso_weekday" WITH =,
    "minute_range" WITH &&, "active_range" WITH &&
);
ALTER TABLE "fixed_appointment_rule_weekdays"
ADD CONSTRAINT "fixed_rule_weekdays_host_time_excl"
EXCLUDE USING gist (
    "host_id" WITH =, "iso_weekday" WITH =,
    "minute_range" WITH &&, "active_range" WITH &&
);

ALTER TABLE "fixed_appointment_requests"
ADD CONSTRAINT "fixed_requests_host_site_fkey"
FOREIGN KEY ("host_id", "site_id") REFERENCES "host_profiles" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_requests"
ADD CONSTRAINT "fixed_requests_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_requests"
ADD CONSTRAINT "fixed_requests_target_artist_site_fkey"
FOREIGN KEY ("target_artist_id", "site_id") REFERENCES "artist_profiles" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_requests"
ADD CONSTRAINT "fixed_requests_operator_site_fkey"
FOREIGN KEY ("submitted_by_operator_id", "site_id") REFERENCES "operator_profiles" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_requests"
ADD CONSTRAINT "fixed_appointment_requests_submitted_by_user_id_fkey"
FOREIGN KEY ("submitted_by_user_id") REFERENCES "app_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_requests"
ADD CONSTRAINT "fixed_appointment_requests_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fixed_appointment_rules"
ADD CONSTRAINT "fixed_rules_source_request_site_fkey"
FOREIGN KEY ("source_request_id", "site_id") REFERENCES "fixed_appointment_requests" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_rules"
ADD CONSTRAINT "fixed_rules_ended_by_request_site_fkey"
FOREIGN KEY ("ended_by_request_id", "site_id") REFERENCES "fixed_appointment_requests" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_rules"
ADD CONSTRAINT "fixed_rules_host_site_fkey"
FOREIGN KEY ("host_id", "site_id") REFERENCES "host_profiles" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_rules"
ADD CONSTRAINT "fixed_rules_artist_site_fkey"
FOREIGN KEY ("artist_id", "site_id") REFERENCES "artist_profiles" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_rules"
ADD CONSTRAINT "fixed_appointment_rules_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fixed_appointment_requests"
ADD CONSTRAINT "fixed_requests_current_rule_site_fkey"
FOREIGN KEY ("current_rule_id", "site_id") REFERENCES "fixed_appointment_rules" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fixed_appointment_rule_weekdays"
ADD CONSTRAINT "fixed_appointment_rule_weekdays_rule_id_fkey"
FOREIGN KEY ("rule_id") REFERENCES "fixed_appointment_rules" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_fixed_rule_weekday()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    parent "fixed_appointment_rules"%ROWTYPE;
BEGIN
    SELECT * INTO parent FROM "fixed_appointment_rules" WHERE "id" = NEW."rule_id";
    IF NOT FOUND
        OR NEW."host_id" IS DISTINCT FROM parent."host_id"
        OR NEW."artist_id" IS DISTINCT FROM parent."artist_id"
        OR NEW."site_id" IS DISTINCT FROM parent."site_id"
        OR NEW."start_minute" IS DISTINCT FROM parent."start_minute"
        OR NEW."end_minute" IS DISTINCT FROM parent."start_minute" + parent."duration_minutes"
        OR NEW."valid_from" IS DISTINCT FROM parent."valid_from"
        OR NEW."valid_until" IS DISTINCT FROM parent."valid_until"
    THEN
        RAISE EXCEPTION 'fixed rule weekday must match its parent rule' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "fixed_rule_weekdays_validate_parent"
BEFORE INSERT OR UPDATE ON "fixed_appointment_rule_weekdays"
FOR EACH ROW EXECUTE FUNCTION validate_fixed_rule_weekday();

CREATE FUNCTION protect_fixed_request_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'fixed appointment requests cannot be deleted' USING ERRCODE = '55000';
    END IF;
    IF OLD."status" <> 'PENDING'
        OR NEW."status" NOT IN ('APPROVED', 'REJECTED', 'WITHDRAWN')
        OR NEW."row_version" <> OLD."row_version" + 1
        OR NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."request_type" IS DISTINCT FROM OLD."request_type"
        OR NEW."host_id" IS DISTINCT FROM OLD."host_id"
        OR NEW."site_id" IS DISTINCT FROM OLD."site_id"
        OR NEW."current_rule_id" IS DISTINCT FROM OLD."current_rule_id"
        OR NEW."target_artist_id" IS DISTINCT FROM OLD."target_artist_id"
        OR NEW."target_weekdays" IS DISTINCT FROM OLD."target_weekdays"
        OR NEW."target_start_minute" IS DISTINCT FROM OLD."target_start_minute"
        OR NEW."target_duration_minutes" IS DISTINCT FROM OLD."target_duration_minutes"
        OR NEW."effective_from" IS DISTINCT FROM OLD."effective_from"
        OR NEW."reason" IS DISTINCT FROM OLD."reason"
        OR NEW."submitted_by_operator_id" IS DISTINCT FROM OLD."submitted_by_operator_id"
        OR NEW."submitted_by_user_id" IS DISTINCT FROM OLD."submitted_by_user_id"
        OR NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'fixed appointment request history is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "fixed_requests_protect_history"
BEFORE UPDATE OR DELETE ON "fixed_appointment_requests"
FOR EACH ROW EXECUTE FUNCTION protect_fixed_request_history();

CREATE FUNCTION protect_fixed_rule_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'fixed appointment rules cannot be deleted' USING ERRCODE = '55000';
    END IF;
    IF OLD."status" <> 'ACTIVE' OR NEW."status" <> 'ENDED'
        OR NEW."row_version" <> OLD."row_version" + 1
        OR NEW."valid_until" IS NULL OR NEW."ended_by_request_id" IS NULL
        OR NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."source_request_id" IS DISTINCT FROM OLD."source_request_id"
        OR NEW."host_id" IS DISTINCT FROM OLD."host_id"
        OR NEW."artist_id" IS DISTINCT FROM OLD."artist_id"
        OR NEW."site_id" IS DISTINCT FROM OLD."site_id"
        OR NEW."start_minute" IS DISTINCT FROM OLD."start_minute"
        OR NEW."duration_minutes" IS DISTINCT FROM OLD."duration_minutes"
        OR NEW."valid_from" IS DISTINCT FROM OLD."valid_from"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'fixed appointment rule history is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "fixed_rules_protect_history"
BEFORE UPDATE OR DELETE ON "fixed_appointment_rules"
FOR EACH ROW EXECUTE FUNCTION protect_fixed_rule_history();

CREATE FUNCTION protect_fixed_rule_weekday_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'fixed appointment weekdays cannot be deleted' USING ERRCODE = '55000';
    END IF;
    IF OLD."valid_until" IS NOT NULL OR NEW."valid_until" IS NULL
        OR NEW."rule_id" IS DISTINCT FROM OLD."rule_id"
        OR NEW."iso_weekday" IS DISTINCT FROM OLD."iso_weekday"
        OR NEW."host_id" IS DISTINCT FROM OLD."host_id"
        OR NEW."artist_id" IS DISTINCT FROM OLD."artist_id"
        OR NEW."site_id" IS DISTINCT FROM OLD."site_id"
        OR NEW."start_minute" IS DISTINCT FROM OLD."start_minute"
        OR NEW."end_minute" IS DISTINCT FROM OLD."end_minute"
        OR NEW."valid_from" IS DISTINCT FROM OLD."valid_from"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'fixed appointment weekday history is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "fixed_rule_weekdays_protect_history"
BEFORE UPDATE OR DELETE ON "fixed_appointment_rule_weekdays"
FOR EACH ROW EXECUTE FUNCTION protect_fixed_rule_weekday_history();

ALTER TABLE "appointments" ADD COLUMN "fixed_rule_id" UUID;
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_type_check";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_type_check" CHECK (
    ("appointment_type" = 'SINGLE' AND "fixed_rule_id" IS NULL)
    OR ("appointment_type" = 'FIXED' AND "fixed_rule_id" IS NOT NULL)
);
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_fixed_rule_site_fkey"
FOREIGN KEY ("fixed_rule_id", "site_id") REFERENCES "fixed_appointment_rules" ("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "appointments_fixed_rule_date_idx" ON "appointments" ("fixed_rule_id", "appointment_date");

CREATE OR REPLACE FUNCTION protect_appointment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'appointments cannot be deleted' USING ERRCODE = '55000';
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
        OR NEW."fixed_rule_id" IS DISTINCT FROM OLD."fixed_rule_id"
        OR NEW."daily_sequence" IS DISTINCT FROM OLD."daily_sequence"
        OR NEW."rescheduled_from_appointment_id" IS DISTINCT FROM OLD."rescheduled_from_appointment_id"
        OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
        OR NEW."created_by_role" IS DISTINCT FROM OLD."created_by_role"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'appointment identity and history are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;
