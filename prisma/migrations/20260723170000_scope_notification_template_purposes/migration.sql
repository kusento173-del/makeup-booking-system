ALTER TABLE "notification_template_versions"
ADD CONSTRAINT "notification_template_versions_purpose_role_check"
CHECK (
    ("template_code" = 'APPOINTMENT_NOTICE'
        AND "recipient_role_code" IN ('HOST', 'ARTIST', 'OPERATOR'))
    OR ("template_code" = 'APPOINTMENT_REMINDER'
        AND "recipient_role_code" = 'HOST')
    OR ("template_code" = 'DAILY_SCHEDULE_SUMMARY'
        AND "recipient_role_code" IN ('ARTIST', 'OPERATOR'))
);
