ALTER TABLE "appointments"
DROP CONSTRAINT "appointments_business_date_check";

ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_business_date_check" CHECK (
    "appointment_date" = ("start_at" AT TIME ZONE 'Asia/Shanghai')::DATE
    AND "appointment_date" = (("end_at" - INTERVAL '1 millisecond') AT TIME ZONE 'Asia/Shanghai')::DATE
);
