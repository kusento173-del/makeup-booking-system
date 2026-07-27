ALTER TABLE "password_credentials"
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "auth_password_change_challenges" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_password_change_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_password_change_challenges_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "auth_password_change_challenges_token_hash_uq"
ON "auth_password_change_challenges"("token_hash");

CREATE UNIQUE INDEX "auth_password_change_challenges_active_user_uq"
ON "auth_password_change_challenges"("user_id")
WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL;

CREATE INDEX "auth_password_change_challenges_expires_idx"
ON "auth_password_change_challenges"("expires_at");
