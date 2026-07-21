CREATE FUNCTION audit_snapshot_has_sensitive_key(snapshot JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
DECLARE
    item RECORD;
    normalized_key TEXT;
BEGIN
    IF jsonb_typeof(snapshot) = 'object' THEN
        FOR item IN SELECT "key", "value" FROM jsonb_each(snapshot) LOOP
            normalized_key := regexp_replace(lower(item."key"), '[-_]', '', 'g');

            IF normalized_key = ANY (ARRAY[
                'password',
                'passwordhash',
                'accesstoken',
                'refreshtoken',
                'token',
                'authorization',
                'cookie',
                'mobile',
                'mobilenumber',
                'mobileciphertext',
                'mobilehash',
                'phone',
                'phonenumber',
                'externalsubject',
                'openid',
                'unionid'
            ]) THEN
                RETURN TRUE;
            END IF;

            IF jsonb_typeof(item."value") IN ('object', 'array')
                AND audit_snapshot_has_sensitive_key(item."value") THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(snapshot) = 'array' THEN
        FOR item IN SELECT "value" FROM jsonb_array_elements(snapshot) LOOP
            IF jsonb_typeof(item."value") IN ('object', 'array')
                AND audit_snapshot_has_sensitive_key(item."value") THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    END IF;

    RETURN FALSE;
END;
$$;

CREATE TABLE "operation_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "site_id" UUID,
    "object_type" VARCHAR(32) NOT NULL,
    "object_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "actor_user_id" UUID,
    "actor_name_snapshot" VARCHAR(64) NOT NULL,
    "actor_role" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(500),
    "before_data" JSONB,
    "after_data" JSONB,
    "request_id" VARCHAR(64),
    "client_type" VARCHAR(32),
    "ip_address" INET,
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operation_logs_object_type_check" CHECK (
        "object_type" = btrim("object_type") AND "object_type" <> ''
    ),
    CONSTRAINT "operation_logs_action_check" CHECK (
        "action" = btrim("action") AND "action" <> ''
    ),
    CONSTRAINT "operation_logs_actor_name_check" CHECK (
        "actor_name_snapshot" = btrim("actor_name_snapshot") AND "actor_name_snapshot" <> ''
    ),
    CONSTRAINT "operation_logs_actor_role_check" CHECK (
        "actor_role" IN ('HOST', 'OPERATOR', 'ARTIST', 'CUSTOMER_SERVICE', 'ADMIN', 'SYSTEM')
    ),
    CONSTRAINT "operation_logs_actor_identity_check" CHECK (
        ("actor_role" = 'SYSTEM' AND "actor_user_id" IS NULL)
        OR
        ("actor_role" <> 'SYSTEM' AND "actor_user_id" IS NOT NULL)
    ),
    CONSTRAINT "operation_logs_reason_check" CHECK (
        "reason" IS NULL OR ("reason" = btrim("reason") AND "reason" <> '')
    ),
    CONSTRAINT "operation_logs_snapshot_check" CHECK (
        ("before_data" IS NOT NULL OR "after_data" IS NOT NULL)
        AND ("before_data" IS NULL OR jsonb_typeof("before_data") = 'object')
        AND ("after_data" IS NULL OR jsonb_typeof("after_data") = 'object')
    ),
    CONSTRAINT "operation_logs_sensitive_data_check" CHECK (
        NOT audit_snapshot_has_sensitive_key("before_data")
        AND NOT audit_snapshot_has_sensitive_key("after_data")
    ),
    CONSTRAINT "operation_logs_request_id_check" CHECK (
        "request_id" IS NULL OR ("request_id" = btrim("request_id") AND "request_id" <> '')
    ),
    CONSTRAINT "operation_logs_client_type_check" CHECK (
        "client_type" IS NULL OR ("client_type" = btrim("client_type") AND "client_type" <> '')
    )
);

CREATE INDEX "operation_logs_object_created_idx"
ON "operation_logs"("object_type", "object_id", "created_at" DESC);

CREATE INDEX "operation_logs_site_created_idx"
ON "operation_logs"("site_id", "created_at" DESC);

CREATE INDEX "operation_logs_actor_created_idx"
ON "operation_logs"("actor_user_id", "created_at" DESC);

ALTER TABLE "operation_logs"
ADD CONSTRAINT "operation_logs_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operation_logs"
ADD CONSTRAINT "operation_logs_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_operation_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'operation_logs is append-only'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "operation_logs_append_only"
BEFORE UPDATE OR DELETE ON "operation_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_operation_log_mutation();
