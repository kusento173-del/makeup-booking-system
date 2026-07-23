ALTER TABLE "notification_tasks"
ADD COLUMN "retry_of_task_id" UUID;

ALTER TABLE "notification_tasks"
ADD CONSTRAINT "notification_tasks_retry_of_task_id_fkey"
FOREIGN KEY ("retry_of_task_id") REFERENCES "notification_tasks"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "notification_tasks_retry_of_uq"
ON "notification_tasks"("retry_of_task_id");

ALTER TABLE "notification_tasks"
ADD CONSTRAINT "notification_tasks_retry_not_self_check"
CHECK ("retry_of_task_id" IS NULL OR "retry_of_task_id" <> "id");

CREATE OR REPLACE FUNCTION "protect_notification_task_history"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'notification task history cannot be deleted'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW."id" <> OLD."id"
        OR NEW."template_version_id" <> OLD."template_version_id"
        OR NEW."source_outbox_event_id" IS DISTINCT FROM OLD."source_outbox_event_id"
        OR NEW."appointment_id" IS DISTINCT FROM OLD."appointment_id"
        OR NEW."retry_of_task_id" IS DISTINCT FROM OLD."retry_of_task_id"
        OR NEW."recipient_user_id" IS DISTINCT FROM OLD."recipient_user_id"
        OR NEW."recipient_role_code" <> OLD."recipient_role_code"
        OR NEW."recipient_profile_id" <> OLD."recipient_profile_id"
        OR NEW."recipient_name_snapshot" <> OLD."recipient_name_snapshot"
        OR NEW."site_id" <> OLD."site_id"
        OR NEW."business_key" <> OLD."business_key"
        OR NEW."payload" <> OLD."payload"
        OR NEW."scheduled_at" <> OLD."scheduled_at"
        OR NEW."max_attempts" <> OLD."max_attempts"
        OR NEW."created_at" <> OLD."created_at"
    THEN
        RAISE EXCEPTION 'notification task request fields are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW."row_version" <> OLD."row_version" + 1 THEN
        RAISE EXCEPTION 'notification task row version must increment by one'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NOT (
        (OLD."status" = 'PENDING' AND NEW."status" IN ('PROCESSING', 'FAILED', 'CANCELLED'))
        OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('SUCCEEDED', 'RETRY_WAIT', 'FAILED'))
        OR (OLD."status" = 'RETRY_WAIT' AND NEW."status" IN ('PROCESSING', 'FAILED', 'CANCELLED'))
    ) THEN
        RAISE EXCEPTION 'invalid notification task transition'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
