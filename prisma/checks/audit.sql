BEGIN;

DO $$
DECLARE
    original_search_path TEXT;
BEGIN
    original_search_path := current_setting('search_path');
    PERFORM set_config('search_path', '', true);

    IF NOT public.audit_snapshot_has_sensitive_key(
        '{"nested":[{"passwordHash":"secret"}]}'::jsonb
    ) THEN
        RAISE EXCEPTION 'Sensitive audit recursion failed with an empty search_path';
    END IF;

    PERFORM set_config('search_path', original_search_path, true);
END $$;

DO $$
DECLARE
    site_id UUID;
    actor_user_id UUID;
    log_id UUID;
BEGIN
    SELECT "id" INTO site_id FROM "sites" WHERE "code" = 'SONGJIANG';

    INSERT INTO "app_users" ("display_name")
    VALUES ('audit-check-actor')
    RETURNING "id" INTO actor_user_id;

    INSERT INTO "operation_logs" (
        "site_id",
        "object_type",
        "object_id",
        "action",
        "actor_user_id",
        "actor_name_snapshot",
        "actor_role",
        "before_data",
        "after_data",
        "request_id",
        "client_type"
    ) VALUES (
        site_id,
        'HOST',
        uuidv7(),
        'HOST_UPDATED',
        actor_user_id,
        'Audit Check Actor',
        'ADMIN',
        '{"displayName":"before"}'::jsonb,
        '{"displayName":"after","mobileLast4":"1234"}'::jsonb,
        'audit-check-request',
        'ADMIN_WEB'
    ) RETURNING "id" INTO log_id;

    IF uuid_extract_version(log_id) <> 7 THEN
        RAISE EXCEPTION 'Operation log IDs must use UUIDv7';
    END IF;

    BEGIN
        INSERT INTO "operation_logs" (
            "object_type",
            "object_id",
            "action",
            "actor_user_id",
            "actor_name_snapshot",
            "actor_role",
            "after_data"
        ) VALUES (
            'HOST',
            uuidv7(),
            'SENSITIVE_DATA_CHECK',
            actor_user_id,
            'Audit Check Actor',
            'ADMIN',
            '{"profile":{"passwordHash":"secret"}}'::jsonb
        );
        RAISE EXCEPTION 'Sensitive nested audit data was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "operation_logs" (
            "object_type",
            "object_id",
            "action",
            "actor_user_id",
            "actor_name_snapshot",
            "actor_role",
            "after_data"
        ) VALUES (
            'IMPORT',
            uuidv7(),
            'SYSTEM_ACTOR_CHECK',
            actor_user_id,
            'System',
            'SYSTEM',
            '{}'::jsonb
        );
        RAISE EXCEPTION 'System audit entry with a user was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "operation_logs" (
            "object_type",
            "object_id",
            "action",
            "actor_name_snapshot",
            "actor_role"
        ) VALUES ('IMPORT', uuidv7(), 'MISSING_SNAPSHOT_CHECK', 'System', 'SYSTEM');
        RAISE EXCEPTION 'Audit entry without a snapshot was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    INSERT INTO "operation_logs" (
        "object_type",
        "object_id",
        "action",
        "actor_name_snapshot",
        "actor_role",
        "after_data"
    ) VALUES ('IMPORT', uuidv7(), 'IMPORT_COMPLETED', 'System', 'SYSTEM', '{"rows":10}'::jsonb);

    BEGIN
        UPDATE "operation_logs" SET "reason" = 'changed' WHERE "id" = log_id;
        RAISE EXCEPTION 'Operation log update was accepted';
    EXCEPTION
        WHEN object_not_in_prerequisite_state THEN NULL;
    END;

    BEGIN
        DELETE FROM "operation_logs" WHERE "id" = log_id;
        RAISE EXCEPTION 'Operation log delete was accepted';
    EXCEPTION
        WHEN object_not_in_prerequisite_state THEN NULL;
    END;

    BEGIN
        DELETE FROM "app_users" WHERE "id" = actor_user_id;
        RAISE EXCEPTION 'Audit actor with history was deleted';
    EXCEPTION
        WHEN restrict_violation THEN NULL;
    END;
END $$;

ROLLBACK;
