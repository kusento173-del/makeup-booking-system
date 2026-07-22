CREATE TABLE "notification_template_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "template_code" VARCHAR(64) NOT NULL,
    "version" SMALLINT NOT NULL,
    "channel" VARCHAR(32) NOT NULL,
    "provider_template_key" VARCHAR(128),
    "variable_keys" VARCHAR(64)[] NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "activated_at" TIMESTAMPTZ(3),
    "retired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notification_template_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_template_versions_definition_check" CHECK (
        "version" > 0
        AND "template_code" = btrim("template_code")
        AND "template_code" <> ''
        AND "channel" IN ('WECHAT_MINI_PROGRAM', 'WECHAT_OFFICIAL_ACCOUNT')
        AND cardinality("variable_keys") <= 32
        AND array_position("variable_keys", NULL) IS NULL
        AND "row_version" > 0
    ),
    CONSTRAINT "notification_template_versions_state_check" CHECK (
        ("status" = 'DRAFT' AND "activated_at" IS NULL AND "retired_at" IS NULL)
        OR (
            "status" = 'ACTIVE'
            AND "provider_template_key" IS NOT NULL
            AND "activated_at" IS NOT NULL
            AND "retired_at" IS NULL
        )
        OR (
            "status" = 'RETIRED'
            AND "provider_template_key" IS NOT NULL
            AND "activated_at" IS NOT NULL
            AND "retired_at" IS NOT NULL
            AND "retired_at" >= "activated_at"
        )
    )
);

CREATE UNIQUE INDEX "notification_template_versions_code_version_uq"
ON "notification_template_versions"("template_code", "version");
CREATE UNIQUE INDEX "notification_template_versions_active_uq"
ON "notification_template_versions"("template_code", "channel")
WHERE "status" = 'ACTIVE';
CREATE INDEX "notification_template_versions_status_code_idx"
ON "notification_template_versions"("status", "template_code");

CREATE TABLE "notification_tasks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "template_version_id" UUID NOT NULL,
    "source_outbox_event_id" UUID,
    "recipient_user_id" UUID,
    "recipient_role_code" VARCHAR(32) NOT NULL,
    "recipient_profile_id" UUID NOT NULL,
    "recipient_name_snapshot" VARCHAR(64) NOT NULL,
    "site_id" UUID NOT NULL,
    "business_key" VARCHAR(160) NOT NULL,
    "payload" JSONB NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,
    "max_attempts" SMALLINT NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMPTZ(3),
    "processing_started_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "last_error_code" VARCHAR(64),
    "last_error_summary" VARCHAR(500),
    "provider_message_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notification_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_tasks_common_check" CHECK (
        "recipient_role_code" IN ('HOST', 'ARTIST', 'OPERATOR', 'CUSTOMER_SERVICE', 'ADMIN')
        AND "recipient_name_snapshot" = btrim("recipient_name_snapshot")
        AND "recipient_name_snapshot" <> ''
        AND "business_key" = btrim("business_key")
        AND "business_key" <> ''
        AND jsonb_typeof("payload") = 'object'
        AND "attempt_count" >= 0
        AND "max_attempts" BETWEEN 1 AND 20
        AND "attempt_count" <= "max_attempts"
        AND "row_version" > 0
    ),
    CONSTRAINT "notification_tasks_state_check" CHECK (
        (
            "status" = 'PENDING'
            AND "recipient_user_id" IS NOT NULL
            AND "attempt_count" = 0
            AND "next_attempt_at" IS NULL
            AND "processing_started_at" IS NULL
            AND "sent_at" IS NULL
            AND "failed_at" IS NULL
            AND "cancelled_at" IS NULL
            AND "last_error_code" IS NULL
            AND "last_error_summary" IS NULL
            AND "provider_message_id" IS NULL
        )
        OR (
            "status" = 'PROCESSING'
            AND "recipient_user_id" IS NOT NULL
            AND "attempt_count" BETWEEN 1 AND "max_attempts"
            AND "next_attempt_at" IS NULL
            AND "processing_started_at" IS NOT NULL
            AND "sent_at" IS NULL
            AND "failed_at" IS NULL
            AND "cancelled_at" IS NULL
            AND "last_error_code" IS NULL
            AND "last_error_summary" IS NULL
            AND "provider_message_id" IS NULL
        )
        OR (
            "status" = 'RETRY_WAIT'
            AND "recipient_user_id" IS NOT NULL
            AND "attempt_count" BETWEEN 1 AND "max_attempts" - 1
            AND "next_attempt_at" IS NOT NULL
            AND "processing_started_at" IS NOT NULL
            AND "sent_at" IS NULL
            AND "failed_at" IS NULL
            AND "cancelled_at" IS NULL
            AND "last_error_code" IS NOT NULL
            AND "last_error_summary" IS NOT NULL
            AND "provider_message_id" IS NULL
        )
        OR (
            "status" = 'SUCCEEDED'
            AND "recipient_user_id" IS NOT NULL
            AND "attempt_count" BETWEEN 1 AND "max_attempts"
            AND "next_attempt_at" IS NULL
            AND "processing_started_at" IS NOT NULL
            AND "sent_at" IS NOT NULL
            AND "failed_at" IS NULL
            AND "cancelled_at" IS NULL
            AND "last_error_code" IS NULL
            AND "last_error_summary" IS NULL
        )
        OR (
            "status" = 'FAILED'
            AND "next_attempt_at" IS NULL
            AND "sent_at" IS NULL
            AND "failed_at" IS NOT NULL
            AND "cancelled_at" IS NULL
            AND "last_error_code" IS NOT NULL
            AND "last_error_summary" IS NOT NULL
            AND "provider_message_id" IS NULL
        )
        OR (
            "status" = 'CANCELLED'
            AND "next_attempt_at" IS NULL
            AND "sent_at" IS NULL
            AND "failed_at" IS NULL
            AND "cancelled_at" IS NOT NULL
            AND "provider_message_id" IS NULL
        )
    ),
    CONSTRAINT "notification_tasks_template_version_fkey" FOREIGN KEY ("template_version_id")
        REFERENCES "notification_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_tasks_source_outbox_fkey" FOREIGN KEY ("source_outbox_event_id")
        REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_tasks_recipient_user_fkey" FOREIGN KEY ("recipient_user_id")
        REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_tasks_site_fkey" FOREIGN KEY ("site_id")
        REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_tasks_business_key_uq"
ON "notification_tasks"("business_key");
CREATE INDEX "notification_tasks_dispatch_idx"
ON "notification_tasks"("status", "scheduled_at", "next_attempt_at");
CREATE INDEX "notification_tasks_site_status_created_idx"
ON "notification_tasks"("site_id", "status", "created_at" DESC);
CREATE INDEX "notification_tasks_recipient_created_idx"
ON "notification_tasks"("recipient_user_id", "created_at" DESC);
CREATE INDEX "notification_tasks_outbox_idx"
ON "notification_tasks"("source_outbox_event_id");

CREATE TABLE "notification_delivery_attempts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "notification_task_id" UUID NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "provider_message_id" VARCHAR(128),
    "error_code" VARCHAR(64),
    "error_summary" VARCHAR(500),
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_delivery_attempts_result_check" CHECK (
        "attempt_number" > 0
        AND "completed_at" >= "started_at"
        AND (
            ("outcome" = 'SUCCEEDED' AND "error_code" IS NULL AND "error_summary" IS NULL)
            OR (
                "outcome" = 'FAILED'
                AND "provider_message_id" IS NULL
                AND "error_code" IS NOT NULL
                AND "error_summary" IS NOT NULL
            )
        )
    ),
    CONSTRAINT "notification_delivery_attempts_task_fkey" FOREIGN KEY ("notification_task_id")
        REFERENCES "notification_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_delivery_attempts_task_number_uq"
ON "notification_delivery_attempts"("notification_task_id", "attempt_number");
CREATE INDEX "notification_delivery_attempts_outcome_created_idx"
ON "notification_delivery_attempts"("outcome", "created_at" DESC);

CREATE FUNCTION "protect_notification_template_history"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'notification template history cannot be deleted'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW."id" <> OLD."id"
        OR NEW."template_code" <> OLD."template_code"
        OR NEW."version" <> OLD."version"
        OR NEW."channel" <> OLD."channel"
        OR NEW."created_at" <> OLD."created_at"
    THEN
        RAISE EXCEPTION 'notification template identity is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW."row_version" <> OLD."row_version" + 1 THEN
        RAISE EXCEPTION 'notification template row version must increment by one'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'ACTIVE') THEN
        RETURN NEW;
    END IF;
    IF OLD."status" = 'ACTIVE' AND NEW."status" = 'RETIRED' THEN
        IF NEW."provider_template_key" IS DISTINCT FROM OLD."provider_template_key"
            OR NEW."variable_keys" IS DISTINCT FROM OLD."variable_keys"
            OR NEW."activated_at" IS DISTINCT FROM OLD."activated_at"
        THEN
            RAISE EXCEPTION 'active notification template content is immutable'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'invalid notification template transition'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notification_template_history_guard"
BEFORE UPDATE OR DELETE ON "notification_template_versions"
FOR EACH ROW EXECUTE FUNCTION "protect_notification_template_history"();

CREATE FUNCTION "protect_notification_task_history"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'notification task history cannot be deleted'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW."id" <> OLD."id"
        OR NEW."template_version_id" <> OLD."template_version_id"
        OR NEW."source_outbox_event_id" IS DISTINCT FROM OLD."source_outbox_event_id"
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

CREATE TRIGGER "notification_task_history_guard"
BEFORE UPDATE OR DELETE ON "notification_tasks"
FOR EACH ROW EXECUTE FUNCTION "protect_notification_task_history"();

CREATE FUNCTION "protect_notification_delivery_attempt_history"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'notification delivery attempt history is immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notification_delivery_attempt_history_guard"
BEFORE UPDATE OR DELETE ON "notification_delivery_attempts"
FOR EACH ROW EXECUTE FUNCTION "protect_notification_delivery_attempt_history"();
