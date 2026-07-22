ALTER TABLE "notification_template_versions"
ADD COLUMN "subscription_type" VARCHAR(16) NOT NULL DEFAULT 'ONE_TIME';

ALTER TABLE "notification_template_versions"
ADD CONSTRAINT "notification_template_versions_subscription_type_check"
CHECK (
    ("channel" = 'WECHAT_MINI_PROGRAM' AND "subscription_type" IN ('ONE_TIME', 'PERMANENT'))
    OR ("channel" <> 'WECHAT_MINI_PROGRAM' AND "subscription_type" = 'ONE_TIME')
);

CREATE OR REPLACE FUNCTION "protect_notification_template_history"()
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
