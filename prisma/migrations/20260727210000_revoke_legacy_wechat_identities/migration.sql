UPDATE "user_identities"
SET
    "status" = 'REVOKED',
    "row_version" = "row_version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'ACTIVE'
  AND (
      "provider" <> 'PASSWORD'
      OR "provider_app_id" <> 'BACKOFFICE'
  );

ALTER TABLE "user_identities"
ADD CONSTRAINT "user_identities_active_password_only_check"
CHECK (
    "status" <> 'ACTIVE'
    OR (
        "provider" = 'PASSWORD'
        AND "provider_app_id" = 'BACKOFFICE'
    )
);
