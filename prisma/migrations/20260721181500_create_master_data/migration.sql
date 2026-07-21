CREATE TABLE "sites" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sites_code_check" CHECK ("code" = btrim("code") AND "code" <> ''),
    CONSTRAINT "sites_name_check" CHECK ("name" = btrim("name") AND "name" <> ''),
    CONSTRAINT "sites_timezone_check" CHECK ("timezone" = btrim("timezone") AND "timezone" <> ''),
    CONSTRAINT "sites_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "sites_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "sites_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "host_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "host_code" VARCHAR(32) NOT NULL,
    "real_name" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(64),
    "site_id" UUID NOT NULL,
    "qualification_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "qualification_effective_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "host_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "host_profiles_host_code_check" CHECK ("host_code" = btrim("host_code") AND "host_code" <> ''),
    CONSTRAINT "host_profiles_real_name_check" CHECK ("real_name" = btrim("real_name") AND "real_name" <> ''),
    CONSTRAINT "host_profiles_nickname_check" CHECK ("nickname" IS NULL OR ("nickname" = btrim("nickname") AND "nickname" <> '')),
    CONSTRAINT "host_profiles_qualification_status_check" CHECK ("qualification_status" IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')),
    CONSTRAINT "host_profiles_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "artist_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "real_name" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(64) NOT NULL,
    "nickname_normalized" VARCHAR(64) NOT NULL,
    "site_id" UUID NOT NULL,
    "employment_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "initial_shift_configured_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "artist_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artist_profiles_real_name_check" CHECK ("real_name" = btrim("real_name") AND "real_name" <> ''),
    CONSTRAINT "artist_profiles_nickname_check" CHECK ("nickname" = btrim("nickname") AND "nickname" <> ''),
    CONSTRAINT "artist_profiles_nickname_normalized_check" CHECK ("nickname_normalized" = btrim("nickname_normalized") AND "nickname_normalized" <> ''),
    CONSTRAINT "artist_profiles_employment_status_check" CHECK ("employment_status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "artist_profiles_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "operator_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "real_name" VARCHAR(64) NOT NULL,
    "name_normalized" VARCHAR(64) NOT NULL,
    "site_id" UUID NOT NULL,
    "employment_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "operator_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operator_profiles_real_name_check" CHECK ("real_name" = btrim("real_name") AND "real_name" <> ''),
    CONSTRAINT "operator_profiles_name_normalized_check" CHECK ("name_normalized" = btrim("name_normalized") AND "name_normalized" <> ''),
    CONSTRAINT "operator_profiles_employment_status_check" CHECK ("employment_status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "operator_profiles_row_version_check" CHECK ("row_version" > 0)
);

CREATE TABLE "host_operator_relations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "host_id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "change_reason" VARCHAR(500),
    "active_range" DATERANGE GENERATED ALWAYS AS (daterange("valid_from", "valid_until", '[)')) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "host_operator_relations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "host_operator_relations_validity_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
    CONSTRAINT "host_operator_relations_change_reason_check" CHECK ("change_reason" IS NULL OR ("change_reason" = btrim("change_reason") AND "change_reason" <> '')),
    CONSTRAINT "host_operator_relations_row_version_check" CHECK ("row_version" > 0)
);

CREATE UNIQUE INDEX "sites_code_uq" ON "sites"("code");
CREATE UNIQUE INDEX "sites_name_uq" ON "sites"("name");
CREATE INDEX "sites_status_sort_order_idx" ON "sites"("status", "sort_order");

CREATE UNIQUE INDEX "host_profiles_host_code_uq" ON "host_profiles"("host_code");
CREATE INDEX "host_profiles_real_name_idx" ON "host_profiles"("real_name");
CREATE INDEX "host_profiles_site_status_idx" ON "host_profiles"("site_id", "qualification_status");

CREATE UNIQUE INDEX "artist_profiles_active_nickname_uq"
ON "artist_profiles"("nickname_normalized")
WHERE ("employment_status" = 'ACTIVE');
CREATE INDEX "artist_profiles_real_name_idx" ON "artist_profiles"("real_name");
CREATE INDEX "artist_profiles_site_status_idx" ON "artist_profiles"("site_id", "employment_status");

CREATE UNIQUE INDEX "operator_profiles_active_name_site_uq"
ON "operator_profiles"("site_id", "name_normalized")
WHERE ("employment_status" = 'ACTIVE');
CREATE INDEX "operator_profiles_site_status_idx" ON "operator_profiles"("site_id", "employment_status");

CREATE INDEX "host_operator_relations_host_valid_from_idx"
ON "host_operator_relations"("host_id", "valid_from" DESC);
CREATE INDEX "host_operator_relations_operator_validity_idx"
ON "host_operator_relations"("operator_id", "valid_from", "valid_until");

ALTER TABLE "host_profiles"
ADD CONSTRAINT "host_profiles_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "artist_profiles"
ADD CONSTRAINT "artist_profiles_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operator_profiles"
ADD CONSTRAINT "operator_profiles_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "host_operator_relations"
ADD CONSTRAINT "host_operator_relations_host_id_fkey"
FOREIGN KEY ("host_id") REFERENCES "host_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "host_operator_relations"
ADD CONSTRAINT "host_operator_relations_operator_id_fkey"
FOREIGN KEY ("operator_id") REFERENCES "operator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "host_operator_relations"
ADD CONSTRAINT "host_operator_relations_date_excl"
EXCLUDE USING gist (
    "host_id" WITH =,
    "active_range" WITH &&
);

INSERT INTO "sites" ("code", "name", "sort_order")
VALUES
    ('SONGJIANG', '松江', 10),
    ('XIANCHANG', '现厂', 20),
    ('WUXI', '无锡', 30);
