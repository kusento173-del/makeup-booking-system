CREATE TABLE "artist_unavailable_periods" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "artist_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "unavailable_date" DATE NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "minute_range" INT4RANGE GENERATED ALWAYS AS (
        int4range("start_minute"::INTEGER, "end_minute"::INTEGER, '[)')
    ) STORED,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" VARCHAR(500),
    "affected_appointment_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "artist_unavailable_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_unavailable_periods_time_check" CHECK (
        "start_minute" >= 0
        AND "end_minute" <= 1440
        AND "end_minute" > "start_minute"
        AND "start_minute" % 15 = 0
        AND "end_minute" % 15 = 0
    ),
    CONSTRAINT "artist_unavailable_periods_reason_check" CHECK (
        "reason" = btrim("reason") AND "reason" <> ''
    ),
    CONSTRAINT "artist_unavailable_periods_status_check" CHECK (
        "status" IN ('ACTIVE', 'CANCELLED')
    ),
    CONSTRAINT "artist_unavailable_periods_state_check" CHECK (
        (
            "status" = 'ACTIVE'
            AND "cancelled_by_user_id" IS NULL
            AND "cancelled_at" IS NULL
            AND "cancellation_reason" IS NULL
        )
        OR (
            "status" = 'CANCELLED'
            AND "cancelled_by_user_id" IS NOT NULL
            AND "cancelled_at" IS NOT NULL
        )
    ),
    CONSTRAINT "artist_unavailable_periods_cancellation_reason_check" CHECK (
        "cancellation_reason" IS NULL
        OR (
            "cancellation_reason" = btrim("cancellation_reason")
            AND "cancellation_reason" <> ''
        )
    ),
    CONSTRAINT "artist_unavailable_periods_affected_count_check" CHECK (
        "affected_appointment_count" >= 0
    ),
    CONSTRAINT "artist_unavailable_periods_row_version_check" CHECK ("row_version" > 0)
);

CREATE INDEX "artist_unavailable_periods_artist_date_status_idx"
ON "artist_unavailable_periods"("artist_id", "unavailable_date", "status");

CREATE INDEX "artist_unavailable_periods_site_date_status_idx"
ON "artist_unavailable_periods"("site_id", "unavailable_date", "status");

CREATE INDEX "artist_unavailable_periods_created_by_idx"
ON "artist_unavailable_periods"("created_by_user_id");

CREATE INDEX "artist_unavailable_periods_cancelled_by_idx"
ON "artist_unavailable_periods"("cancelled_by_user_id");

ALTER TABLE "artist_unavailable_periods"
ADD CONSTRAINT "artist_unavailable_periods_artist_site_fkey"
FOREIGN KEY ("artist_id", "site_id")
REFERENCES "artist_profiles"("id", "site_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_unavailable_periods"
ADD CONSTRAINT "artist_unavailable_periods_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_unavailable_periods"
ADD CONSTRAINT "artist_unavailable_periods_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_unavailable_periods"
ADD CONSTRAINT "artist_unavailable_periods_cancelled_by_user_id_fkey"
FOREIGN KEY ("cancelled_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_unavailable_periods"
ADD CONSTRAINT "artist_unavailable_periods_active_time_excl"
EXCLUDE USING gist (
    "artist_id" WITH =,
    "unavailable_date" WITH =,
    "minute_range" WITH &&
)
WHERE ("status" = 'ACTIVE');
