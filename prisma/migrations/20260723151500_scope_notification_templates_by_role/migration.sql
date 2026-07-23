ALTER TABLE "notification_template_versions"
ADD COLUMN "recipient_role_code" VARCHAR(32) NOT NULL DEFAULT 'HOST';

ALTER TABLE "notification_template_versions"
ALTER COLUMN "recipient_role_code" DROP DEFAULT;

ALTER TABLE "notification_template_versions"
ADD CONSTRAINT "notification_template_versions_recipient_role_check"
CHECK ("recipient_role_code" IN ('HOST', 'ARTIST', 'OPERATOR'));

DROP INDEX "notification_template_versions_code_version_uq";
DROP INDEX "notification_template_versions_active_uq";
DROP INDEX "notification_template_versions_status_code_idx";

CREATE UNIQUE INDEX "notification_template_versions_code_role_version_uq"
ON "notification_template_versions"("template_code", "recipient_role_code", "version");

CREATE UNIQUE INDEX "notification_template_versions_active_uq"
ON "notification_template_versions"("template_code", "recipient_role_code", "channel")
WHERE "status" = 'ACTIVE';

CREATE INDEX "notification_template_versions_status_code_role_idx"
ON "notification_template_versions"("status", "template_code", "recipient_role_code");

CREATE OR REPLACE FUNCTION "protect_notification_template_history"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'notification template history cannot be deleted'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW."id" <> OLD."id"
        OR NEW."template_code" <> OLD."template_code"
        OR NEW."recipient_role_code" <> OLD."recipient_role_code"
        OR NEW."version" <> OLD."version"
        OR NEW."channel" <> OLD."channel"
        OR NEW."subscription_type" <> OLD."subscription_type"
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
