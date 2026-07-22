ALTER TABLE "host_profiles"
ADD CONSTRAINT "host_profiles_id_site_uq" UNIQUE ("id", "site_id");

ALTER TABLE "artist_profiles"
ADD CONSTRAINT "artist_profiles_id_site_uq" UNIQUE ("id", "site_id");

ALTER TABLE "operator_profiles"
ADD CONSTRAINT "operator_profiles_id_site_uq" UNIQUE ("id", "site_id");

CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "host_id" UUID NOT NULL,
    "host_code_snapshot" VARCHAR(32) NOT NULL,
    "host_name_snapshot" VARCHAR(64) NOT NULL,
    "artist_id" UUID NOT NULL,
    "artist_nickname_snapshot" VARCHAR(64) NOT NULL,
    "site_id" UUID NOT NULL,
    "site_name_snapshot" VARCHAR(64) NOT NULL,
    "operator_id_at_booking" UUID,
    "operator_name_snapshot" VARCHAR(64),
    "appointment_date" DATE NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "time_range" TSTZRANGE GENERATED ALWAYS AS (tstzrange("start_at", "end_at", '[)')) STORED,
    "appointment_type" VARCHAR(16) NOT NULL DEFAULT 'SINGLE',
    "status" VARCHAR(16) NOT NULL DEFAULT 'BOOKED',
    "daily_sequence" SMALLINT NOT NULL,
    "rescheduled_from_appointment_id" UUID,
    "created_by_user_id" UUID,
    "created_by_role" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_user_id" UUID,
    "cancellation_reason_code" VARCHAR(64),
    "cancellation_reason_text" VARCHAR(500),
    "cancellation_source_type" VARCHAR(32),
    "cancellation_source_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_duration_check" CHECK ("duration_minutes" IN (15, 30, 45, 60)),
    CONSTRAINT "appointments_time_check" CHECK (
        "end_at" = "start_at" + "duration_minutes" * INTERVAL '1 minute'
        AND EXTRACT(SECOND FROM "start_at") = 0
        AND MOD(EXTRACT(MINUTE FROM "start_at")::INTEGER, 15) = 0
    ),
    CONSTRAINT "appointments_business_date_check" CHECK (
        "appointment_date" = ("start_at" AT TIME ZONE 'Asia/Shanghai')::DATE
    ),
    CONSTRAINT "appointments_type_check" CHECK ("appointment_type" = 'SINGLE'),
    CONSTRAINT "appointments_status_check" CHECK ("status" IN ('BOOKED', 'CANCELLED', 'COMPLETED')),
    CONSTRAINT "appointments_daily_sequence_check" CHECK ("daily_sequence" IN (1, 2)),
    CONSTRAINT "appointments_operator_snapshot_check" CHECK (
        ("operator_id_at_booking" IS NULL AND "operator_name_snapshot" IS NULL)
        OR ("operator_id_at_booking" IS NOT NULL AND "operator_name_snapshot" IS NOT NULL)
    ),
    CONSTRAINT "appointments_creator_check" CHECK (
        ("created_by_role" = 'SYSTEM' AND "created_by_user_id" IS NULL)
        OR (
            "created_by_role" IN ('HOST', 'OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN')
            AND "created_by_user_id" IS NOT NULL
        )
    ),
    CONSTRAINT "appointments_state_check" CHECK (
        (
            "status" = 'BOOKED'
            AND "cancelled_at" IS NULL
            AND "cancelled_by_user_id" IS NULL
            AND "cancellation_reason_code" IS NULL
            AND "cancellation_reason_text" IS NULL
            AND "cancellation_source_type" IS NULL
            AND "cancellation_source_id" IS NULL
            AND "completed_at" IS NULL
        )
        OR (
            "status" = 'CANCELLED'
            AND "cancelled_at" IS NOT NULL
            AND "cancellation_reason_code" IS NOT NULL
            AND "completed_at" IS NULL
        )
        OR (
            "status" = 'COMPLETED'
            AND "cancelled_at" IS NULL
            AND "cancelled_by_user_id" IS NULL
            AND "cancellation_reason_code" IS NULL
            AND "cancellation_reason_text" IS NULL
            AND "cancellation_source_type" IS NULL
            AND "cancellation_source_id" IS NULL
            AND "completed_at" IS NOT NULL
        )
    ),
    CONSTRAINT "appointments_cancellation_source_check" CHECK (
        ("cancellation_source_type" IS NULL) = ("cancellation_source_id" IS NULL)
    ),
    CONSTRAINT "appointments_snapshot_text_check" CHECK (
        "host_code_snapshot" = btrim("host_code_snapshot") AND "host_code_snapshot" <> ''
        AND "host_name_snapshot" = btrim("host_name_snapshot") AND "host_name_snapshot" <> ''
        AND "artist_nickname_snapshot" = btrim("artist_nickname_snapshot") AND "artist_nickname_snapshot" <> ''
        AND "site_name_snapshot" = btrim("site_name_snapshot") AND "site_name_snapshot" <> ''
        AND ("operator_name_snapshot" IS NULL OR ("operator_name_snapshot" = btrim("operator_name_snapshot") AND "operator_name_snapshot" <> ''))
    ),
    CONSTRAINT "appointments_cancellation_text_check" CHECK (
        ("cancellation_reason_code" IS NULL OR ("cancellation_reason_code" = btrim("cancellation_reason_code") AND "cancellation_reason_code" <> ''))
        AND ("cancellation_reason_text" IS NULL OR ("cancellation_reason_text" = btrim("cancellation_reason_text") AND "cancellation_reason_text" <> ''))
        AND ("cancellation_source_type" IS NULL OR ("cancellation_source_type" = btrim("cancellation_source_type") AND "cancellation_source_type" <> ''))
    ),
    CONSTRAINT "appointments_row_version_check" CHECK ("row_version" > 0),
    CONSTRAINT "appointments_reschedule_self_check" CHECK (
        "rescheduled_from_appointment_id" IS NULL OR "rescheduled_from_appointment_id" <> "id"
    )
);

CREATE UNIQUE INDEX "appointments_rescheduled_from_uq"
ON "appointments"("rescheduled_from_appointment_id");

CREATE UNIQUE INDEX "appointments_active_host_daily_sequence_uq"
ON "appointments"("host_id", "appointment_date", "daily_sequence")
WHERE "status" IN ('BOOKED', 'COMPLETED');

CREATE INDEX "appointments_site_date_start_idx" ON "appointments"("site_id", "appointment_date", "start_at");
CREATE INDEX "appointments_host_date_status_idx" ON "appointments"("host_id", "appointment_date", "status");
CREATE INDEX "appointments_artist_date_status_idx" ON "appointments"("artist_id", "appointment_date", "status");
CREATE INDEX "appointments_operator_date_idx" ON "appointments"("operator_id_at_booking", "appointment_date");
CREATE INDEX "appointments_status_start_idx" ON "appointments"("status", "start_at");
CREATE INDEX "appointments_created_by_idx" ON "appointments"("created_by_user_id", "created_at" DESC);
CREATE INDEX "appointments_cancelled_by_idx" ON "appointments"("cancelled_by_user_id", "cancelled_at" DESC);

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_host_site_fkey"
FOREIGN KEY ("host_id", "site_id") REFERENCES "host_profiles"("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_artist_site_fkey"
FOREIGN KEY ("artist_id", "site_id") REFERENCES "artist_profiles"("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_operator_site_fkey"
FOREIGN KEY ("operator_id_at_booking", "site_id") REFERENCES "operator_profiles"("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelled_by_user_id_fkey"
FOREIGN KEY ("cancelled_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduled_from_appointment_id_fkey"
FOREIGN KEY ("rescheduled_from_appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_artist_time_excl"
EXCLUDE USING gist ("artist_id" WITH =, "time_range" WITH &&)
WHERE ("status" IN ('BOOKED', 'COMPLETED'));

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_host_time_excl"
EXCLUDE USING gist ("host_id" WITH =, "time_range" WITH &&)
WHERE ("status" IN ('BOOKED', 'COMPLETED'));
