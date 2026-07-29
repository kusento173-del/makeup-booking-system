ALTER TABLE "fixed_appointment_requests"
  DROP CONSTRAINT "fixed_requests_operator_site_fkey";

ALTER TABLE "fixed_appointment_requests"
  ALTER COLUMN "submitted_by_operator_id" DROP NOT NULL;

ALTER TABLE "fixed_appointment_requests"
  ADD CONSTRAINT "fixed_requests_operator_site_fkey"
  FOREIGN KEY ("submitted_by_operator_id", "site_id")
  REFERENCES "operator_profiles" ("id", "site_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
