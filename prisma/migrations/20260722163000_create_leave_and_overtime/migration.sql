CREATE TABLE "artist_overtimes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "artist_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "overtime_date" DATE NOT NULL,
    "work_start_minute" SMALLINT NOT NULL,
    "break_start_minute" SMALLINT,
    "break_end_minute" SMALLINT,
    "work_end_minute" SMALLINT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "submitted_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_comment" VARCHAR(500),
    "affected_appointment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "artist_overtimes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_overtimes_times_check" CHECK (
        valid_shift_times("work_start_minute", "break_start_minute", "break_end_minute", "work_end_minute")
    ),
    CONSTRAINT "artist_overtimes_reason_check" CHECK ("reason" = btrim("reason") AND "reason" <> ''),
    CONSTRAINT "artist_overtimes_status_check" CHECK (
        "status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')
    ),
    CONSTRAINT "artist_overtimes_review_state_check" CHECK (
        ("status" IN ('PENDING', 'WITHDRAWN') AND "reviewed_by_user_id" IS NULL AND "reviewed_at" IS NULL AND "review_comment" IS NULL)
        OR ("status" IN ('APPROVED', 'REJECTED') AND "reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
    ),
    CONSTRAINT "artist_overtimes_review_comment_check" CHECK (
        "review_comment" IS NULL OR ("review_comment" = btrim("review_comment") AND "review_comment" <> '')
    ),
    CONSTRAINT "artist_overtimes_affected_count_check" CHECK ("affected_appointment_count" >= 0),
    CONSTRAINT "artist_overtimes_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "leave_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "subject_type" VARCHAR(16) NOT NULL,
    "host_id" UUID,
    "artist_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "leave_range" DATERANGE GENERATED ALWAYS AS (daterange("start_date", "end_date" + 1, '[)')) STORED,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "reason" VARCHAR(500),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" VARCHAR(500),
    "affected_appointment_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "leave_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_records_subject_check" CHECK (
        ("subject_type" = 'HOST' AND "host_id" IS NOT NULL AND "artist_id" IS NULL)
        OR ("subject_type" = 'ARTIST' AND "artist_id" IS NOT NULL AND "host_id" IS NULL)
    ),
    CONSTRAINT "leave_records_date_range_check" CHECK (
        "end_date" >= "start_date" AND "end_date" - "start_date" BETWEEN 0 AND 6
    ),
    CONSTRAINT "leave_records_status_check" CHECK ("status" IN ('ACTIVE', 'CANCELLED')),
    CONSTRAINT "leave_records_state_check" CHECK (
        ("status" = 'ACTIVE' AND "cancelled_by_user_id" IS NULL AND "cancelled_at" IS NULL AND "cancellation_reason" IS NULL)
        OR ("status" = 'CANCELLED' AND "cancelled_by_user_id" IS NOT NULL AND "cancelled_at" IS NOT NULL)
    ),
    CONSTRAINT "leave_records_reason_check" CHECK (
        "reason" IS NULL OR ("reason" = btrim("reason") AND "reason" <> '')
    ),
    CONSTRAINT "leave_records_cancellation_reason_check" CHECK (
        "cancellation_reason" IS NULL OR ("cancellation_reason" = btrim("cancellation_reason") AND "cancellation_reason" <> '')
    ),
    CONSTRAINT "leave_records_affected_count_check" CHECK ("affected_appointment_count" >= 0),
    CONSTRAINT "leave_records_row_version_check" CHECK ("row_version" > 0)
);

CREATE UNIQUE INDEX "artist_overtimes_active_artist_date_uq"
ON "artist_overtimes"("artist_id", "overtime_date")
WHERE "status" IN ('PENDING', 'APPROVED');

CREATE INDEX "artist_overtimes_site_status_date_idx" ON "artist_overtimes"("site_id", "status", "overtime_date");
CREATE INDEX "artist_overtimes_submitted_by_idx" ON "artist_overtimes"("submitted_by_user_id");
CREATE INDEX "artist_overtimes_reviewed_by_idx" ON "artist_overtimes"("reviewed_by_user_id");
CREATE INDEX "leave_records_host_dates_idx" ON "leave_records"("host_id", "start_date", "end_date");
CREATE INDEX "leave_records_artist_dates_idx" ON "leave_records"("artist_id", "start_date", "end_date");
CREATE INDEX "leave_records_created_by_idx" ON "leave_records"("created_by_user_id");
CREATE INDEX "leave_records_cancelled_by_idx" ON "leave_records"("cancelled_by_user_id");

ALTER TABLE "artist_overtimes" ADD CONSTRAINT "artist_overtimes_artist_id_fkey"
FOREIGN KEY ("artist_id") REFERENCES "artist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_overtimes" ADD CONSTRAINT "artist_overtimes_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_overtimes" ADD CONSTRAINT "artist_overtimes_submitted_by_user_id_fkey"
FOREIGN KEY ("submitted_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_overtimes" ADD CONSTRAINT "artist_overtimes_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_host_id_fkey"
FOREIGN KEY ("host_id") REFERENCES "host_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_artist_id_fkey"
FOREIGN KEY ("artist_id") REFERENCES "artist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_cancelled_by_user_id_fkey"
FOREIGN KEY ("cancelled_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_active_host_date_excl"
EXCLUDE USING gist ("host_id" WITH =, "leave_range" WITH &&)
WHERE ("subject_type" = 'HOST' AND "status" = 'ACTIVE');
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_active_artist_date_excl"
EXCLUDE USING gist ("artist_id" WITH =, "leave_range" WITH &&)
WHERE ("subject_type" = 'ARTIST' AND "status" = 'ACTIVE');
