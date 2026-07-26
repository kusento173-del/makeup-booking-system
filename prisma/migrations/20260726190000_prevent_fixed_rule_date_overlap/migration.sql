ALTER TABLE "fixed_appointment_rules"
ADD COLUMN "active_range" DATERANGE
GENERATED ALWAYS AS (daterange("valid_from", "valid_until", '[)')) STORED;

ALTER TABLE "fixed_appointment_rules"
ADD CONSTRAINT "fixed_rules_host_date_excl"
EXCLUDE USING gist (
    "host_id" WITH =,
    "active_range" WITH &&
);
