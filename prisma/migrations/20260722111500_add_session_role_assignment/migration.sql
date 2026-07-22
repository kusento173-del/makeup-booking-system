ALTER TABLE "auth_sessions"
ADD COLUMN "role_assignment_id" UUID;

UPDATE "auth_sessions"
SET
    "revoked_at" = CURRENT_TIMESTAMP,
    "revoke_reason" = 'SESSION_SCHEMA_UPGRADED',
    "row_version" = "row_version" + 1
WHERE "revoked_at" IS NULL;

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_active_role_check"
CHECK ("role_assignment_id" IS NOT NULL OR "revoked_at" IS NOT NULL);

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_role_assignment_id_fkey"
FOREIGN KEY ("role_assignment_id") REFERENCES "user_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "auth_sessions_role_revoked_idx"
ON "auth_sessions"("role_assignment_id", "revoked_at");

CREATE FUNCTION validate_auth_session_role_owner()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."role_assignment_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM "user_roles"
        WHERE "id" = NEW."role_assignment_id"
          AND "user_id" = NEW."user_id"
    ) THEN
        RAISE EXCEPTION 'Session role assignment must belong to the session user'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "auth_sessions_validate_role_owner"
BEFORE INSERT OR UPDATE OF "user_id", "role_assignment_id"
ON "auth_sessions"
FOR EACH ROW
EXECUTE FUNCTION validate_auth_session_role_owner();
