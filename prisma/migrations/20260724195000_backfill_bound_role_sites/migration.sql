ALTER TABLE "user_roles"
DROP CONSTRAINT "user_roles_site_scope_check";

UPDATE "user_roles" AS role
SET
  "site_id" = profile."site_id",
  "row_version" = role."row_version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
FROM "host_profiles" AS profile
WHERE
  role."role_code" = 'HOST'
  AND role."user_id" = profile."user_id"
  AND role."site_id" IS NULL;

UPDATE "user_roles" AS role
SET
  "site_id" = profile."site_id",
  "row_version" = role."row_version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
FROM "artist_profiles" AS profile
WHERE
  role."role_code" = 'ARTIST'
  AND role."user_id" = profile."user_id"
  AND role."site_id" IS NULL;

UPDATE "user_roles" AS role
SET
  "site_id" = profile."site_id",
  "row_version" = role."row_version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
FROM "operator_profiles" AS profile
WHERE
  role."role_code" = 'OPERATOR'
  AND role."user_id" = profile."user_id"
  AND role."site_id" IS NULL;

ALTER TABLE "user_roles"
ADD CONSTRAINT "user_roles_site_scope_check"
CHECK (
  (
    "role_code" = 'ADMIN'
    AND "site_id" IS NULL
  )
  OR
  (
    "role_code" IN ('ARTIST', 'CUSTOMER_SERVICE', 'HOST', 'OPERATOR')
    AND "site_id" IS NOT NULL
  )
);
