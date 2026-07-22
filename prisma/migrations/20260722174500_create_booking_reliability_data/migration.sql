CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "resource_type" VARCHAR(32),
    "resource_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_records_text_check" CHECK (
        "scope" = btrim("scope") AND "scope" <> ''
        AND "idempotency_key" = btrim("idempotency_key") AND "idempotency_key" <> ''
        AND "request_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "idempotency_records_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "idempotency_records_resource_check" CHECK (
        ("resource_type" IS NULL) = ("resource_id" IS NULL)
        AND ("resource_type" IS NULL OR ("resource_type" = btrim("resource_type") AND "resource_type" <> ''))
    ),
    CONSTRAINT "idempotency_records_response_check" CHECK (
        (
            "response_status" IS NULL
            AND "response_body" IS NULL
            AND "resource_type" IS NULL
            AND "resource_id" IS NULL
        )
        OR (
            "response_status" BETWEEN 200 AND 599
            AND "response_body" IS NOT NULL
        )
    )
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_type" VARCHAR(64) NOT NULL,
    "aggregate_type" VARCHAR(32) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_text_check" CHECK (
        "event_type" = btrim("event_type") AND "event_type" <> ''
        AND "aggregate_type" = btrim("aggregate_type") AND "aggregate_type" <> ''
    ),
    CONSTRAINT "outbox_events_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "outbox_events_status_check" CHECK ("status" IN ('PENDING', 'PUBLISHED', 'FAILED')),
    CONSTRAINT "outbox_events_attempt_count_check" CHECK ("attempt_count" >= 0),
    CONSTRAINT "outbox_events_state_check" CHECK (
        ("status" = 'PENDING' AND "published_at" IS NULL)
        OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
        OR ("status" = 'FAILED' AND "published_at" IS NULL AND "attempt_count" > 0)
    )
);

ALTER TABLE "idempotency_records"
ADD CONSTRAINT "idempotency_records_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "idempotency_records_user_scope_key_uq"
ON "idempotency_records"("user_id", "scope", "idempotency_key");
CREATE INDEX "idempotency_records_expires_idx" ON "idempotency_records"("expires_at");
CREATE INDEX "idempotency_records_resource_idx" ON "idempotency_records"("resource_type", "resource_id");

CREATE UNIQUE INDEX "outbox_events_type_aggregate_uq"
ON "outbox_events"("event_type", "aggregate_id");
CREATE INDEX "outbox_events_status_available_idx"
ON "outbox_events"("status", "available_at", "created_at");
CREATE INDEX "outbox_events_aggregate_idx"
ON "outbox_events"("aggregate_type", "aggregate_id");
