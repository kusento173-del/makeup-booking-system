BEGIN;

DO $$
DECLARE
    user_id UUID;
    record_id UUID;
    aggregate_id UUID := uuidv7();
    suffix TEXT := txid_current()::text;
BEGIN
    INSERT INTO "app_users" ("display_name")
    VALUES ('预约可靠性-' || suffix) RETURNING "id" INTO user_id;

    INSERT INTO "idempotency_records" (
        "user_id", "scope", "idempotency_key", "request_hash", "expires_at"
    ) VALUES (
        user_id, 'APPOINTMENT_CREATE', 'key-' || suffix, repeat('a', 64), CURRENT_TIMESTAMP + INTERVAL '24 hours'
    ) RETURNING "id" INTO record_id;

    BEGIN
        INSERT INTO "idempotency_records" (
            "user_id", "scope", "idempotency_key", "request_hash", "expires_at"
        ) VALUES (
            user_id, 'APPOINTMENT_CREATE', 'key-' || suffix, repeat('b', 64), CURRENT_TIMESTAMP + INTERVAL '24 hours'
        );
        RAISE EXCEPTION 'Duplicate idempotency key was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "idempotency_records" (
            "user_id", "scope", "idempotency_key", "request_hash", "expires_at"
        ) VALUES (
            user_id, 'APPOINTMENT_CREATE', 'bad-hash-' || suffix, 'NOT-A-HASH', CURRENT_TIMESTAMP + INTERVAL '24 hours'
        );
        RAISE EXCEPTION 'Invalid request hash was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE "idempotency_records" SET "response_status" = 201 WHERE "id" = record_id;
        RAISE EXCEPTION 'Partial idempotency response was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE "idempotency_records" SET
        "response_status" = 201,
        "response_body" = jsonb_build_object('id', aggregate_id),
        "resource_type" = 'APPOINTMENT',
        "resource_id" = aggregate_id,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = record_id;

    INSERT INTO "outbox_events" (
        "event_type", "aggregate_type", "aggregate_id", "payload"
    ) VALUES (
        'APPOINTMENT_CREATED', 'APPOINTMENT', aggregate_id,
        jsonb_build_object('appointmentId', aggregate_id)
    );

    BEGIN
        INSERT INTO "outbox_events" (
            "event_type", "aggregate_type", "aggregate_id", "payload"
        ) VALUES (
            'APPOINTMENT_CREATED', 'APPOINTMENT', aggregate_id,
            jsonb_build_object('appointmentId', aggregate_id)
        );
        RAISE EXCEPTION 'Duplicate outbox event was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "outbox_events" (
            "event_type", "aggregate_type", "aggregate_id", "payload", "status"
        ) VALUES (
            'APPOINTMENT_CANCELLED', 'APPOINTMENT', aggregate_id,
            jsonb_build_object('appointmentId', aggregate_id), 'PUBLISHED'
        );
        RAISE EXCEPTION 'Published event without published_at was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "outbox_events" (
            "event_type", "aggregate_type", "aggregate_id", "payload", "attempt_count"
        ) VALUES (
            'APPOINTMENT_RETRY', 'APPOINTMENT', aggregate_id,
            jsonb_build_object('appointmentId', aggregate_id), -1
        );
        RAISE EXCEPTION 'Negative outbox attempt count was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

ROLLBACK;
