CREATE TABLE "auth_role_selection_challenges" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_role_selection_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_role_selection_challenges_token_hash_check" CHECK (
        "token_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "auth_role_selection_challenges_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "auth_role_selection_challenges_consumed_check" CHECK (
        "consumed_at" IS NULL OR "consumed_at" >= "created_at"
    ),
    CONSTRAINT "auth_role_selection_challenges_revoked_check" CHECK (
        "revoked_at" IS NULL OR "revoked_at" >= "created_at"
    ),
    CONSTRAINT "auth_role_selection_challenges_terminal_state_check" CHECK (
        "consumed_at" IS NULL OR "revoked_at" IS NULL
    )
);

CREATE UNIQUE INDEX "auth_role_selection_challenges_token_hash_uq"
ON "auth_role_selection_challenges"("token_hash");

CREATE UNIQUE INDEX "auth_role_selection_challenges_active_user_uq"
ON "auth_role_selection_challenges"("user_id")
WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL;

CREATE INDEX "auth_role_selection_challenges_expires_idx"
ON "auth_role_selection_challenges"("expires_at");

ALTER TABLE "auth_role_selection_challenges"
ADD CONSTRAINT "auth_role_selection_challenges_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_auth_role_selection_challenge_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'auth_role_selection_challenges cannot be deleted'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "auth_role_selection_challenges_prevent_delete"
BEFORE DELETE ON "auth_role_selection_challenges"
FOR EACH ROW
EXECUTE FUNCTION prevent_auth_role_selection_challenge_delete();
