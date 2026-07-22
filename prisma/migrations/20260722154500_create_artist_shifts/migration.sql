CREATE FUNCTION valid_iso_workdays(SMALLINT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(
        cardinality($1) BETWEEN 1 AND 7
        AND $1 <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::SMALLINT[]
        AND cardinality($1) = (
            SELECT count(DISTINCT workday)
            FROM unnest($1) AS workday
        ),
        FALSE
    );
$$;

CREATE FUNCTION valid_shift_times(SMALLINT, SMALLINT, SMALLINT, SMALLINT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(
        $1 >= 0
        AND $4 > $1
        AND $4 <= 1440
        AND $1 % 15 = 0
        AND $4 % 15 = 0
        AND (
            ($2 IS NULL AND $3 IS NULL)
            OR (
                $2 IS NOT NULL
                AND $3 IS NOT NULL
                AND $1 < $2
                AND $2 < $3
                AND $3 < $4
                AND $2 % 15 = 0
                AND $3 % 15 = 0
            )
        ),
        FALSE
    );
$$;

CREATE TABLE "artist_shift_templates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "artist_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "workdays" SMALLINT[] NOT NULL,
    "work_start_minute" SMALLINT NOT NULL,
    "break_start_minute" SMALLINT,
    "break_end_minute" SMALLINT,
    "work_end_minute" SMALLINT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "created_by_user_id" UUID,
    "source_request_id" UUID,
    "active_range" DATERANGE GENERATED ALWAYS AS (daterange("valid_from", "valid_until", '[)')) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_shift_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_shift_templates_version_check" CHECK ("version_no" > 0),
    CONSTRAINT "artist_shift_templates_workdays_check" CHECK (valid_iso_workdays("workdays")),
    CONSTRAINT "artist_shift_templates_times_check" CHECK (
        valid_shift_times(
            "work_start_minute",
            "break_start_minute",
            "break_end_minute",
            "work_end_minute"
        )
    ),
    CONSTRAINT "artist_shift_templates_validity_check" CHECK (
        "valid_until" IS NULL OR "valid_until" > "valid_from"
    ),
    CONSTRAINT "artist_shift_templates_artist_version_uq" UNIQUE ("artist_id", "version_no"),
    CONSTRAINT "artist_shift_templates_id_artist_uq" UNIQUE ("id", "artist_id"),
    CONSTRAINT "artist_shift_templates_source_request_artist_uq" UNIQUE (
        "source_request_id",
        "artist_id"
    )
);

CREATE TABLE "artist_shift_change_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "artist_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "current_shift_id" UUID NOT NULL,
    "proposed_workdays" SMALLINT[] NOT NULL,
    "proposed_work_start_minute" SMALLINT NOT NULL,
    "proposed_break_start_minute" SMALLINT,
    "proposed_break_end_minute" SMALLINT,
    "proposed_work_end_minute" SMALLINT NOT NULL,
    "effective_from" DATE NOT NULL,
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

    CONSTRAINT "artist_shift_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_shift_change_requests_id_artist_uq" UNIQUE ("id", "artist_id"),
    CONSTRAINT "artist_shift_change_requests_workdays_check" CHECK (
        valid_iso_workdays("proposed_workdays")
    ),
    CONSTRAINT "artist_shift_change_requests_times_check" CHECK (
        valid_shift_times(
            "proposed_work_start_minute",
            "proposed_break_start_minute",
            "proposed_break_end_minute",
            "proposed_work_end_minute"
        )
    ),
    CONSTRAINT "artist_shift_change_requests_reason_check" CHECK (
        "reason" = btrim("reason") AND "reason" <> ''
    ),
    CONSTRAINT "artist_shift_change_requests_status_check" CHECK (
        "status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')
    ),
    CONSTRAINT "artist_shift_change_requests_review_state_check" CHECK (
        (
            "status" IN ('PENDING', 'WITHDRAWN')
            AND "reviewed_by_user_id" IS NULL
            AND "reviewed_at" IS NULL
            AND "review_comment" IS NULL
        )
        OR (
            "status" IN ('APPROVED', 'REJECTED')
            AND "reviewed_by_user_id" IS NOT NULL
            AND "reviewed_at" IS NOT NULL
        )
    ),
    CONSTRAINT "artist_shift_change_requests_review_comment_check" CHECK (
        "review_comment" IS NULL
        OR ("review_comment" = btrim("review_comment") AND "review_comment" <> '')
    ),
    CONSTRAINT "artist_shift_change_requests_affected_count_check" CHECK (
        "affected_appointment_count" >= 0
    ),
    CONSTRAINT "artist_shift_change_requests_row_version_check" CHECK ("row_version" > 0)
);

CREATE INDEX "artist_shift_templates_artist_valid_from_idx"
ON "artist_shift_templates"("artist_id", "valid_from" DESC);

CREATE INDEX "artist_shift_templates_created_by_idx"
ON "artist_shift_templates"("created_by_user_id");

CREATE UNIQUE INDEX "artist_shift_change_requests_pending_artist_uq"
ON "artist_shift_change_requests"("artist_id")
WHERE "status" = 'PENDING';

CREATE INDEX "artist_shift_change_requests_site_status_submitted_idx"
ON "artist_shift_change_requests"("site_id", "status", "submitted_at");

CREATE INDEX "artist_shift_change_requests_submitted_by_idx"
ON "artist_shift_change_requests"("submitted_by_user_id");

CREATE INDEX "artist_shift_change_requests_reviewed_by_idx"
ON "artist_shift_change_requests"("reviewed_by_user_id");

ALTER TABLE "artist_shift_templates"
ADD CONSTRAINT "artist_shift_templates_artist_id_fkey"
FOREIGN KEY ("artist_id") REFERENCES "artist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_shift_templates"
ADD CONSTRAINT "artist_shift_templates_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_shift_change_requests"
ADD CONSTRAINT "artist_shift_change_requests_artist_id_fkey"
FOREIGN KEY ("artist_id") REFERENCES "artist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_shift_change_requests"
ADD CONSTRAINT "artist_shift_change_requests_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_shift_change_requests"
ADD CONSTRAINT "artist_shift_change_requests_current_shift_artist_fkey"
FOREIGN KEY ("current_shift_id", "artist_id")
REFERENCES "artist_shift_templates"("id", "artist_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_shift_change_requests"
ADD CONSTRAINT "artist_shift_change_requests_submitted_by_user_id_fkey"
FOREIGN KEY ("submitted_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_shift_change_requests"
ADD CONSTRAINT "artist_shift_change_requests_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_shift_templates"
ADD CONSTRAINT "artist_shift_templates_source_request_artist_fkey"
FOREIGN KEY ("source_request_id", "artist_id")
REFERENCES "artist_shift_change_requests"("id", "artist_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_shift_templates"
ADD CONSTRAINT "artist_shift_templates_date_excl"
EXCLUDE USING gist (
    "artist_id" WITH =,
    "active_range" WITH &&
);

CREATE FUNCTION protect_artist_shift_template()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'artist_shift_templates cannot be deleted'
            USING ERRCODE = '55000';
    END IF;

    IF OLD."valid_until" IS NOT NULL
        OR NEW."valid_until" IS NULL
        OR NEW."valid_until" <= OLD."valid_from"
        OR NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."artist_id" IS DISTINCT FROM OLD."artist_id"
        OR NEW."version_no" IS DISTINCT FROM OLD."version_no"
        OR NEW."workdays" IS DISTINCT FROM OLD."workdays"
        OR NEW."work_start_minute" IS DISTINCT FROM OLD."work_start_minute"
        OR NEW."break_start_minute" IS DISTINCT FROM OLD."break_start_minute"
        OR NEW."break_end_minute" IS DISTINCT FROM OLD."break_end_minute"
        OR NEW."work_end_minute" IS DISTINCT FROM OLD."work_end_minute"
        OR NEW."valid_from" IS DISTINCT FROM OLD."valid_from"
        OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
        OR NEW."source_request_id" IS DISTINCT FROM OLD."source_request_id"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'artist_shift_templates are immutable except for first closure'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "artist_shift_templates_protect_history"
BEFORE UPDATE OR DELETE ON "artist_shift_templates"
FOR EACH ROW
EXECUTE FUNCTION protect_artist_shift_template();
