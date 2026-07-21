CREATE TABLE "app_users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "display_name" VARCHAR(64) NOT NULL,
    "mobile_ciphertext" TEXT,
    "mobile_hash" CHAR(64),
    "mobile_last4" CHAR(4),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "app_users_display_name_check" CHECK ("display_name" = btrim("display_name") AND "display_name" <> ''),
    CONSTRAINT "app_users_mobile_group_check" CHECK (
        ("mobile_ciphertext" IS NULL AND "mobile_hash" IS NULL AND "mobile_last4" IS NULL)
        OR
        ("mobile_ciphertext" IS NOT NULL AND "mobile_hash" IS NOT NULL AND "mobile_last4" IS NOT NULL)
    ),
    CONSTRAINT "app_users_mobile_hash_check" CHECK ("mobile_hash" IS NULL OR "mobile_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "app_users_mobile_last4_check" CHECK ("mobile_last4" IS NULL OR "mobile_last4" ~ '^[0-9]{4}$'),
    CONSTRAINT "app_users_status_check" CHECK ("status" IN ('ACTIVE', 'DISABLED')),
    CONSTRAINT "app_users_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "user_identities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_app_id" VARCHAR(128) NOT NULL,
    "external_subject" VARCHAR(256) NOT NULL,
    "union_id" VARCHAR(256),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "bound_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_identities_provider_check" CHECK ("provider" = btrim("provider") AND "provider" <> ''),
    CONSTRAINT "user_identities_provider_app_id_check" CHECK ("provider_app_id" = btrim("provider_app_id") AND "provider_app_id" <> ''),
    CONSTRAINT "user_identities_external_subject_check" CHECK ("external_subject" = btrim("external_subject") AND "external_subject" <> ''),
    CONSTRAINT "user_identities_union_id_check" CHECK ("union_id" IS NULL OR ("union_id" = btrim("union_id") AND "union_id" <> '')),
    CONSTRAINT "user_identities_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED')),
    CONSTRAINT "user_identities_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "password_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failed_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "password_credentials_password_hash_check" CHECK ("password_hash" = btrim("password_hash") AND "password_hash" <> ''),
    CONSTRAINT "password_credentials_failed_attempt_count_check" CHECK ("failed_attempt_count" >= 0)
);

CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "role_code" VARCHAR(32) NOT NULL,
    "site_id" UUID,
    "assigned_by_user_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_roles_role_code_check" CHECK (
        "role_code" IN ('HOST', 'OPERATOR', 'ARTIST', 'CUSTOMER_SERVICE', 'ADMIN')
    ),
    CONSTRAINT "user_roles_site_scope_check" CHECK (
        ("role_code" = 'CUSTOMER_SERVICE' AND "site_id" IS NOT NULL)
        OR
        ("role_code" <> 'CUSTOMER_SERVICE' AND "site_id" IS NULL)
    ),
    CONSTRAINT "user_roles_revoked_at_check" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "assigned_at"),
    CONSTRAINT "user_roles_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_sessions_refresh_token_hash_check" CHECK ("refresh_token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "auth_sessions_expires_at_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "auth_sessions_last_seen_at_check" CHECK ("last_seen_at" IS NULL OR "last_seen_at" >= "created_at"),
    CONSTRAINT "auth_sessions_revocation_check" CHECK (
        ("revoked_at" IS NULL AND "revoke_reason" IS NULL)
        OR
        ("revoked_at" IS NOT NULL AND "revoked_at" >= "created_at" AND "revoke_reason" IS NOT NULL AND "revoke_reason" = btrim("revoke_reason") AND "revoke_reason" <> '')
    ),
    CONSTRAINT "auth_sessions_row_version_check" CHECK ("row_version" > 0)
);

ALTER TABLE "host_profiles" ADD COLUMN "user_id" UUID;
ALTER TABLE "artist_profiles" ADD COLUMN "user_id" UUID;
ALTER TABLE "operator_profiles" ADD COLUMN "user_id" UUID;

CREATE UNIQUE INDEX "app_users_mobile_hash_uq" ON "app_users"("mobile_hash");
CREATE INDEX "app_users_status_idx" ON "app_users"("status");

CREATE UNIQUE INDEX "user_identities_provider_subject_uq"
ON "user_identities"("provider", "provider_app_id", "external_subject");
CREATE INDEX "user_identities_user_status_idx" ON "user_identities"("user_id", "status");
CREATE INDEX "user_identities_union_id_idx" ON "user_identities"("union_id");

CREATE UNIQUE INDEX "user_roles_active_role_uq"
ON "user_roles"("user_id", "role_code")
WHERE ("revoked_at" IS NULL);
CREATE INDEX "user_roles_site_role_revoked_idx" ON "user_roles"("site_id", "role_code", "revoked_at");
CREATE INDEX "user_roles_assigned_by_idx" ON "user_roles"("assigned_by_user_id");

CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_uq" ON "auth_sessions"("refresh_token_hash");
CREATE INDEX "auth_sessions_user_validity_idx" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

CREATE UNIQUE INDEX "host_profiles_user_id_uq" ON "host_profiles"("user_id");
CREATE UNIQUE INDEX "artist_profiles_user_id_uq" ON "artist_profiles"("user_id");
CREATE UNIQUE INDEX "operator_profiles_user_id_uq" ON "operator_profiles"("user_id");

ALTER TABLE "user_identities"
ADD CONSTRAINT "user_identities_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "password_credentials"
ADD CONSTRAINT "password_credentials_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_roles"
ADD CONSTRAINT "user_roles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_roles"
ADD CONSTRAINT "user_roles_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_roles"
ADD CONSTRAINT "user_roles_assigned_by_user_id_fkey"
FOREIGN KEY ("assigned_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "host_profiles"
ADD CONSTRAINT "host_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_profiles"
ADD CONSTRAINT "artist_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_profiles"
ADD CONSTRAINT "operator_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
