ALTER TABLE "leave_records"
ADD COLUMN "reviewed_by_user_id" UUID,
ADD COLUMN "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN "review_comment" VARCHAR(500);

ALTER TABLE "artist_unavailable_periods"
ADD COLUMN "reviewed_by_user_id" UUID,
ADD COLUMN "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN "review_comment" VARCHAR(500);

ALTER TABLE "leave_records" DROP CONSTRAINT "leave_records_status_check";
ALTER TABLE "leave_records" DROP CONSTRAINT "leave_records_state_check";
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_status_check"
CHECK ("status" IN ('ACTIVE', 'PENDING', 'REJECTED', 'CANCELLED'));
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_state_check" CHECK (
    (
        "status" = 'PENDING'
        AND "reviewed_by_user_id" IS NULL
        AND "reviewed_at" IS NULL
        AND "review_comment" IS NULL
        AND "cancelled_by_user_id" IS NULL
        AND "cancelled_at" IS NULL
        AND "cancellation_reason" IS NULL
    )
    OR (
        "status" = 'ACTIVE'
        AND "cancelled_by_user_id" IS NULL
        AND "cancelled_at" IS NULL
        AND "cancellation_reason" IS NULL
    )
    OR (
        "status" = 'REJECTED'
        AND "reviewed_by_user_id" IS NOT NULL
        AND "reviewed_at" IS NOT NULL
        AND "cancelled_by_user_id" IS NULL
        AND "cancelled_at" IS NULL
        AND "cancellation_reason" IS NULL
    )
    OR (
        "status" = 'CANCELLED'
        AND "cancelled_by_user_id" IS NOT NULL
        AND "cancelled_at" IS NOT NULL
    )
);
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_review_comment_check"
CHECK ("review_comment" IS NULL OR ("review_comment" = btrim("review_comment") AND "review_comment" <> ''));

ALTER TABLE "artist_unavailable_periods" DROP CONSTRAINT "artist_unavailable_periods_status_check";
ALTER TABLE "artist_unavailable_periods" DROP CONSTRAINT "artist_unavailable_periods_state_check";
ALTER TABLE "artist_unavailable_periods" ADD CONSTRAINT "artist_unavailable_periods_status_check"
CHECK ("status" IN ('ACTIVE', 'PENDING', 'REJECTED', 'CANCELLED'));
ALTER TABLE "artist_unavailable_periods" ADD CONSTRAINT "artist_unavailable_periods_state_check" CHECK (
    (
        "status" = 'PENDING'
        AND "reviewed_by_user_id" IS NULL
        AND "reviewed_at" IS NULL
        AND "review_comment" IS NULL
        AND "cancelled_by_user_id" IS NULL
        AND "cancelled_at" IS NULL
        AND "cancellation_reason" IS NULL
    )
    OR (
        "status" = 'ACTIVE'
        AND "cancelled_by_user_id" IS NULL
        AND "cancelled_at" IS NULL
        AND "cancellation_reason" IS NULL
    )
    OR (
        "status" = 'REJECTED'
        AND "reviewed_by_user_id" IS NOT NULL
        AND "reviewed_at" IS NOT NULL
        AND "cancelled_by_user_id" IS NULL
        AND "cancelled_at" IS NULL
        AND "cancellation_reason" IS NULL
    )
    OR (
        "status" = 'CANCELLED'
        AND "cancelled_by_user_id" IS NOT NULL
        AND "cancelled_at" IS NOT NULL
    )
);
ALTER TABLE "artist_unavailable_periods" ADD CONSTRAINT "artist_unavailable_periods_review_comment_check"
CHECK ("review_comment" IS NULL OR ("review_comment" = btrim("review_comment") AND "review_comment" <> ''));

ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artist_unavailable_periods"
ADD CONSTRAINT "artist_unavailable_periods_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "leave_records_reviewed_by_idx" ON "leave_records"("reviewed_by_user_id");
CREATE INDEX "artist_unavailable_periods_reviewed_by_idx"
ON "artist_unavailable_periods"("reviewed_by_user_id");

ALTER TABLE "leave_records" DROP CONSTRAINT "leave_records_active_artist_date_excl";
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_active_artist_date_excl"
EXCLUDE USING gist ("artist_id" WITH =, "leave_range" WITH &&)
WHERE ("subject_type" = 'ARTIST' AND "status" IN ('PENDING', 'ACTIVE'));

ALTER TABLE "artist_unavailable_periods"
DROP CONSTRAINT "artist_unavailable_periods_active_time_excl";
ALTER TABLE "artist_unavailable_periods"
ADD CONSTRAINT "artist_unavailable_periods_active_time_excl"
EXCLUDE USING gist (
    "artist_id" WITH =,
    "unavailable_date" WITH =,
    "minute_range" WITH &&
)
WHERE ("status" IN ('PENDING', 'ACTIVE'));
