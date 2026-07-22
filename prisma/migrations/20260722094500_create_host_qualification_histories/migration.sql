CREATE TABLE "host_qualification_histories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "host_id" UUID NOT NULL,
    "from_status" VARCHAR(16),
    "to_status" VARCHAR(16) NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "changed_by_user_id" UUID,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "host_qualification_histories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "host_qualification_histories_from_status_check" CHECK (
        "from_status" IS NULL OR "from_status" IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')
    ),
    CONSTRAINT "host_qualification_histories_to_status_check" CHECK (
        "to_status" IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')
    ),
    CONSTRAINT "host_qualification_histories_transition_check" CHECK (
        "from_status" IS NULL OR "from_status" <> "to_status"
    ),
    CONSTRAINT "host_qualification_histories_reason_check" CHECK (
        "reason" IS NULL OR ("reason" = btrim("reason") AND "reason" <> '')
    )
);

CREATE INDEX "host_qualification_histories_host_effective_idx"
ON "host_qualification_histories"("host_id", "effective_at" DESC);

CREATE INDEX "host_qualification_histories_actor_created_idx"
ON "host_qualification_histories"("changed_by_user_id", "created_at" DESC);

ALTER TABLE "host_qualification_histories"
ADD CONSTRAINT "host_qualification_histories_host_id_fkey"
FOREIGN KEY ("host_id") REFERENCES "host_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "host_qualification_histories"
ADD CONSTRAINT "host_qualification_histories_changed_by_user_id_fkey"
FOREIGN KEY ("changed_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_host_qualification_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'host_qualification_histories is append-only'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "host_qualification_histories_append_only"
BEFORE UPDATE OR DELETE ON "host_qualification_histories"
FOR EACH ROW
EXECUTE FUNCTION prevent_host_qualification_history_mutation();
