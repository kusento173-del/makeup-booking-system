ALTER TABLE "host_profiles"
  ADD COLUMN "qualification_valid_until" DATE,
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "artist_profiles"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "operator_profiles"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

UPDATE "host_profiles"
SET
  "qualification_status" = 'CANCELLED',
  "qualification_valid_until" = (CURRENT_DATE + INTERVAL '1 month')::date
WHERE "qualification_status" = 'SUSPENDED';

UPDATE "host_profiles"
SET "qualification_valid_until" = (CURRENT_DATE + INTERVAL '1 month')::date
WHERE
  "qualification_status" = 'CANCELLED'
  AND "qualification_valid_until" IS NULL;

UPDATE "artist_profiles"
SET "deleted_at" = COALESCE("updated_at", NOW())
WHERE "employment_status" = 'INACTIVE';

UPDATE "operator_profiles"
SET "deleted_at" = COALESCE("updated_at", NOW())
WHERE "employment_status" = 'INACTIVE';

ALTER TABLE "host_profiles"
  ADD CONSTRAINT "host_profiles_qualification_status_ck"
  CHECK ("qualification_status" IN ('ACTIVE', 'CANCELLED')),
  ADD CONSTRAINT "host_profiles_qualification_valid_until_ck"
  CHECK (
    (
      "qualification_status" = 'ACTIVE'
      AND "qualification_valid_until" IS NULL
    )
    OR (
      "qualification_status" = 'CANCELLED'
      AND (
        "deleted_at" IS NOT NULL
        OR "qualification_valid_until" IS NOT NULL
      )
    )
  );

CREATE INDEX "host_profiles_deleted_at_idx" ON "host_profiles" ("deleted_at");
CREATE INDEX "artist_profiles_deleted_at_idx" ON "artist_profiles" ("deleted_at");
CREATE INDEX "operator_profiles_deleted_at_idx" ON "operator_profiles" ("deleted_at");
