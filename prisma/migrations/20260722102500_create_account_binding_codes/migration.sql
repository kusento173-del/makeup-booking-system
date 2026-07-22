CREATE TABLE "account_binding_codes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "role_code" VARCHAR(32) NOT NULL,
    "site_id" UUID NOT NULL,
    "host_profile_id" UUID,
    "artist_profile_id" UUID,
    "operator_profile_id" UUID,
    "code_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "failed_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "consumed_at" TIMESTAMPTZ(3),
    "consumed_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID,
    "revoke_reason" VARCHAR(500),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "account_binding_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_binding_codes_role_check" CHECK (
        "role_code" IN ('HOST', 'OPERATOR', 'ARTIST')
    ),
    CONSTRAINT "account_binding_codes_target_check" CHECK (
        (
            "role_code" = 'HOST'
            AND "host_profile_id" IS NOT NULL
            AND "artist_profile_id" IS NULL
            AND "operator_profile_id" IS NULL
        )
        OR (
            "role_code" = 'ARTIST'
            AND "host_profile_id" IS NULL
            AND "artist_profile_id" IS NOT NULL
            AND "operator_profile_id" IS NULL
        )
        OR (
            "role_code" = 'OPERATOR'
            AND "host_profile_id" IS NULL
            AND "artist_profile_id" IS NULL
            AND "operator_profile_id" IS NOT NULL
        )
    ),
    CONSTRAINT "account_binding_codes_code_hash_check" CHECK (
        "code_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "account_binding_codes_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "account_binding_codes_attempts_check" CHECK (
        "max_attempts" BETWEEN 1 AND 10
        AND "failed_attempt_count" BETWEEN 0 AND "max_attempts"
    ),
    CONSTRAINT "account_binding_codes_consumption_check" CHECK (
        ("consumed_at" IS NULL) = ("consumed_by_user_id" IS NULL)
        AND ("consumed_at" IS NULL OR "consumed_at" >= "created_at")
    ),
    CONSTRAINT "account_binding_codes_revocation_check" CHECK (
        ("revoked_at" IS NULL) = ("revoked_by_user_id" IS NULL)
        AND ("revoked_at" IS NULL) = ("revoke_reason" IS NULL)
        AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    ),
    CONSTRAINT "account_binding_codes_terminal_state_check" CHECK (
        "consumed_at" IS NULL OR "revoked_at" IS NULL
    ),
    CONSTRAINT "account_binding_codes_revoke_reason_check" CHECK (
        "revoke_reason" IS NULL
        OR ("revoke_reason" = btrim("revoke_reason") AND "revoke_reason" <> '')
    ),
    CONSTRAINT "account_binding_codes_row_version_check" CHECK ("row_version" > 0)
);

CREATE UNIQUE INDEX "account_binding_codes_code_hash_uq"
ON "account_binding_codes"("code_hash");

CREATE UNIQUE INDEX "account_binding_codes_active_host_uq"
ON "account_binding_codes"("host_profile_id")
WHERE "host_profile_id" IS NOT NULL AND "consumed_at" IS NULL AND "revoked_at" IS NULL;

CREATE UNIQUE INDEX "account_binding_codes_active_artist_uq"
ON "account_binding_codes"("artist_profile_id")
WHERE "artist_profile_id" IS NOT NULL AND "consumed_at" IS NULL AND "revoked_at" IS NULL;

CREATE UNIQUE INDEX "account_binding_codes_active_operator_uq"
ON "account_binding_codes"("operator_profile_id")
WHERE "operator_profile_id" IS NOT NULL AND "consumed_at" IS NULL AND "revoked_at" IS NULL;

CREATE INDEX "account_binding_codes_site_role_created_idx"
ON "account_binding_codes"("site_id", "role_code", "created_at" DESC);

CREATE INDEX "account_binding_codes_expires_idx"
ON "account_binding_codes"("expires_at");

CREATE INDEX "account_binding_codes_creator_created_idx"
ON "account_binding_codes"("created_by_user_id", "created_at" DESC);

ALTER TABLE "account_binding_codes"
ADD CONSTRAINT "account_binding_codes_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_binding_codes"
ADD CONSTRAINT "account_binding_codes_host_profile_id_fkey"
FOREIGN KEY ("host_profile_id") REFERENCES "host_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_binding_codes"
ADD CONSTRAINT "account_binding_codes_artist_profile_id_fkey"
FOREIGN KEY ("artist_profile_id") REFERENCES "artist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_binding_codes"
ADD CONSTRAINT "account_binding_codes_operator_profile_id_fkey"
FOREIGN KEY ("operator_profile_id") REFERENCES "operator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_binding_codes"
ADD CONSTRAINT "account_binding_codes_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_binding_codes"
ADD CONSTRAINT "account_binding_codes_consumed_by_user_id_fkey"
FOREIGN KEY ("consumed_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_binding_codes"
ADD CONSTRAINT "account_binding_codes_revoked_by_user_id_fkey"
FOREIGN KEY ("revoked_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_account_binding_code_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'account_binding_codes cannot be deleted'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "account_binding_codes_no_delete"
BEFORE DELETE ON "account_binding_codes"
FOR EACH ROW
EXECUTE FUNCTION prevent_account_binding_code_delete();
