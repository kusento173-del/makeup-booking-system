CREATE UNIQUE INDEX "appointments_fixed_rule_date_uq"
ON "appointments" ("fixed_rule_id", "appointment_date")
WHERE "fixed_rule_id" IS NOT NULL;
