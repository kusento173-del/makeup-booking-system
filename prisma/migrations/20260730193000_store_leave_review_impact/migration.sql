ALTER TABLE "leave_records"
ADD COLUMN "review_impact_snapshot" JSONB;

ALTER TABLE "artist_unavailable_periods"
ADD COLUMN "review_impact_snapshot" JSONB;

ALTER TABLE "leave_records"
ADD CONSTRAINT "leave_records_review_impact_snapshot_check"
CHECK (
    "review_impact_snapshot" IS NULL
    OR jsonb_typeof("review_impact_snapshot") = 'array'
);

ALTER TABLE "artist_unavailable_periods"
ADD CONSTRAINT "artist_unavailable_periods_review_impact_snapshot_check"
CHECK (
    "review_impact_snapshot" IS NULL
    OR jsonb_typeof("review_impact_snapshot") = 'array'
);

UPDATE "leave_records" AS leave_record
SET "review_impact_snapshot" = COALESCE(
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'appointmentDate', to_char(appointment."appointment_date", 'YYYY-MM-DD'),
                'appointmentType', appointment."appointment_type",
                'endAt', appointment."end_at",
                'hostCode', appointment."host_code_snapshot",
                'hostId', appointment."host_id",
                'hostName', appointment."host_name_snapshot",
                'id', appointment."id",
                'startAt', appointment."start_at"
            )
            ORDER BY appointment."appointment_date", appointment."start_at"
        )
        FROM "appointments" AS appointment
        WHERE appointment."cancellation_source_type" = 'LEAVE_RECORD'
          AND appointment."cancellation_source_id" = leave_record."id"
    ),
    '[]'::JSONB
)
WHERE leave_record."reviewed_at" IS NOT NULL;

UPDATE "artist_unavailable_periods" AS period
SET "review_impact_snapshot" = COALESCE(
    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'appointmentDate', to_char(appointment."appointment_date", 'YYYY-MM-DD'),
                'appointmentType', appointment."appointment_type",
                'endAt', appointment."end_at",
                'hostCode', appointment."host_code_snapshot",
                'hostId', appointment."host_id",
                'hostName', appointment."host_name_snapshot",
                'id', appointment."id",
                'startAt', appointment."start_at"
            )
            ORDER BY appointment."appointment_date", appointment."start_at"
        )
        FROM "appointments" AS appointment
        WHERE appointment."cancellation_source_type" = 'ARTIST_UNAVAILABLE_PERIOD'
          AND appointment."cancellation_source_id" = period."id"
    ),
    '[]'::JSONB
)
WHERE period."reviewed_at" IS NOT NULL;
