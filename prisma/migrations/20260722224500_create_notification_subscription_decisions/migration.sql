CREATE TABLE "notification_subscription_decisions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "role_code" VARCHAR(32) NOT NULL,
    "site_id" UUID,
    "template_version_id" UUID NOT NULL,
    "provider_template_key_snapshot" VARCHAR(128) NOT NULL,
    "subscription_type_snapshot" VARCHAR(16) NOT NULL,
    "decision" VARCHAR(16) NOT NULL,
    "client_request_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_subscription_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_subscription_decisions_values_check" CHECK (
        "role_code" IN ('HOST', 'OPERATOR', 'ARTIST')
        AND "provider_template_key_snapshot" = btrim("provider_template_key_snapshot")
        AND "provider_template_key_snapshot" <> ''
        AND "subscription_type_snapshot" IN ('ONE_TIME', 'PERMANENT')
        AND "decision" IN ('ACCEPT', 'REJECT', 'BAN', 'FILTER')
    ),
    CONSTRAINT "notification_subscription_decisions_user_fkey" FOREIGN KEY ("user_id")
        REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_subscription_decisions_site_fkey" FOREIGN KEY ("site_id")
        REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_subscription_decisions_template_fkey" FOREIGN KEY ("template_version_id")
        REFERENCES "notification_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_subscription_decisions_request_template_uq"
ON "notification_subscription_decisions"("user_id", "client_request_id", "template_version_id");
CREATE INDEX "notification_subscription_decisions_user_created_idx"
ON "notification_subscription_decisions"("user_id", "created_at" DESC);
CREATE INDEX "notification_subscription_decisions_template_result_idx"
ON "notification_subscription_decisions"("template_version_id", "decision", "created_at" DESC);

CREATE FUNCTION "protect_notification_subscription_decision_history"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'notification subscription decision history is immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notification_subscription_decision_history_guard"
BEFORE UPDATE OR DELETE ON "notification_subscription_decisions"
FOR EACH ROW EXECUTE FUNCTION "protect_notification_subscription_decision_history"();
