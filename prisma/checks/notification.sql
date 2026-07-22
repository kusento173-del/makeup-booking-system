BEGIN;

DO $$
DECLARE
    site_id UUID;
    user_id UUID;
    template_id UUID;
    task_id UUID;
    failed_task_id UUID;
    suffix TEXT := txid_current()::text;
BEGIN
    SELECT "id" INTO site_id FROM "sites" ORDER BY "sort_order", "id" LIMIT 1;
    INSERT INTO "app_users" ("display_name")
    VALUES ('通知约束-' || suffix) RETURNING "id" INTO user_id;

    BEGIN
        INSERT INTO "notification_template_versions" (
            "template_code", "version", "channel", "status", "activated_at", "variable_keys"
        ) VALUES (
            'APPOINTMENT_CREATED', 1, 'WECHAT_MINI_PROGRAM', 'ACTIVE', CURRENT_TIMESTAMP,
            ARRAY['thing1=hostName']
        );
        RAISE EXCEPTION 'Active template without provider key was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "notification_template_versions" (
        "template_code", "version", "channel", "variable_keys"
    ) VALUES (
        'APPOINTMENT_CREATED', 1, 'WECHAT_MINI_PROGRAM',
        ARRAY['thing1=hostName', 'time2=startAt']
    ) RETURNING "id" INTO template_id;

    UPDATE "notification_template_versions" SET
        "status" = 'ACTIVE',
        "provider_template_key" = 'provider-template-1',
        "activated_at" = CURRENT_TIMESTAMP,
        "row_version" = 2
    WHERE "id" = template_id;

    BEGIN
        INSERT INTO "notification_template_versions" (
            "template_code", "version", "channel", "provider_template_key",
            "variable_keys", "status", "activated_at"
        ) VALUES (
            'APPOINTMENT_CREATED', 2, 'WECHAT_MINI_PROGRAM', 'provider-template-2',
            ARRAY['thing1=hostName'], 'ACTIVE', CURRENT_TIMESTAMP
        );
        RAISE EXCEPTION 'Two active versions for one template and channel were accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "notification_template_versions" (
            "template_code", "version", "channel", "variable_keys"
        ) VALUES (
            'INVALID_MAPPING', 1, 'WECHAT_MINI_PROGRAM', ARRAY['hostName']
        );
        RAISE EXCEPTION 'Invalid mini-program variable mapping was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "notification_template_versions" (
            "template_code", "version", "channel", "variable_keys"
        ) VALUES (
            'DUPLICATE_MAPPING', 1, 'WECHAT_MINI_PROGRAM',
            ARRAY['thing1=hostName', 'thing1=artistName']
        );
        RAISE EXCEPTION 'Duplicate mini-program provider field was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "notification_tasks" (
            "template_version_id", "recipient_role_code", "recipient_profile_id",
            "recipient_name_snapshot", "site_id", "business_key", "payload", "scheduled_at"
        ) VALUES (
            template_id, 'HOST', uuidv7(), '未绑定主播', site_id,
            'notification:unbound-pending:' || suffix, '{}'::jsonb, CURRENT_TIMESTAMP
        );
        RAISE EXCEPTION 'Pending task without a recipient account was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "notification_tasks" (
        "template_version_id", "recipient_user_id", "recipient_role_code",
        "recipient_profile_id", "recipient_name_snapshot", "site_id", "business_key",
        "payload", "scheduled_at"
    ) VALUES (
        template_id, user_id, 'HOST', uuidv7(), '小雨', site_id,
        'notification:appointment-created:' || suffix,
        jsonb_build_object('hostName', '小雨', 'startAt', '2026-07-23 09:30'),
        CURRENT_TIMESTAMP
    ) RETURNING "id" INTO task_id;

    BEGIN
        INSERT INTO "notification_tasks" (
            "template_version_id", "recipient_user_id", "recipient_role_code",
            "recipient_profile_id", "recipient_name_snapshot", "site_id", "business_key",
            "payload", "scheduled_at"
        ) VALUES (
            template_id, user_id, 'HOST', uuidv7(), '小雨', site_id,
            'notification:appointment-created:' || suffix, '{}'::jsonb, CURRENT_TIMESTAMP
        );
        RAISE EXCEPTION 'Duplicate notification business key was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        UPDATE "notification_tasks" SET
            "status" = 'SUCCEEDED',
            "attempt_count" = 1,
            "processing_started_at" = CURRENT_TIMESTAMP,
            "sent_at" = CURRENT_TIMESTAMP,
            "row_version" = 2
        WHERE "id" = task_id;
        RAISE EXCEPTION 'Pending task skipped processing';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    UPDATE "notification_tasks" SET
        "status" = 'PROCESSING',
        "attempt_count" = 1,
        "processing_started_at" = CURRENT_TIMESTAMP,
        "row_version" = 2
    WHERE "id" = task_id;
    UPDATE "notification_tasks" SET
        "status" = 'RETRY_WAIT',
        "next_attempt_at" = CURRENT_TIMESTAMP + INTERVAL '1 minute',
        "last_error_code" = 'PROVIDER_BUSY',
        "last_error_summary" = '服务暂不可用',
        "row_version" = 3
    WHERE "id" = task_id;
    INSERT INTO "notification_delivery_attempts" (
        "notification_task_id", "attempt_number", "outcome", "error_code", "error_summary",
        "started_at", "completed_at"
    ) VALUES (
        task_id, 1, 'FAILED', 'PROVIDER_BUSY', '服务暂不可用',
        CURRENT_TIMESTAMP - INTERVAL '1 second', CURRENT_TIMESTAMP
    );

    UPDATE "notification_tasks" SET
        "status" = 'PROCESSING',
        "attempt_count" = 2,
        "next_attempt_at" = NULL,
        "processing_started_at" = CURRENT_TIMESTAMP,
        "last_error_code" = NULL,
        "last_error_summary" = NULL,
        "row_version" = 4
    WHERE "id" = task_id;
    UPDATE "notification_tasks" SET
        "status" = 'SUCCEEDED',
        "sent_at" = CURRENT_TIMESTAMP,
        "provider_message_id" = 'provider-message-1',
        "row_version" = 5
    WHERE "id" = task_id;
    INSERT INTO "notification_delivery_attempts" (
        "notification_task_id", "attempt_number", "outcome", "provider_message_id",
        "started_at", "completed_at"
    ) VALUES (
        task_id, 2, 'SUCCEEDED', 'provider-message-1',
        CURRENT_TIMESTAMP - INTERVAL '1 second', CURRENT_TIMESTAMP
    );

    BEGIN
        UPDATE "notification_tasks" SET "payload" = '{"changed":true}'::jsonb, "row_version" = 6
        WHERE "id" = task_id;
        RAISE EXCEPTION 'Terminal notification history was mutable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
    BEGIN
        DELETE FROM "notification_tasks" WHERE "id" = task_id;
        RAISE EXCEPTION 'Notification task history was deletable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
    BEGIN
        UPDATE "notification_delivery_attempts" SET "error_summary" = 'changed'
        WHERE "notification_task_id" = task_id AND "attempt_number" = 1;
        RAISE EXCEPTION 'Notification attempt history was mutable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    INSERT INTO "notification_tasks" (
        "template_version_id", "recipient_role_code", "recipient_profile_id",
        "recipient_name_snapshot", "site_id", "business_key", "payload", "scheduled_at",
        "status", "failed_at", "last_error_code", "last_error_summary"
    ) VALUES (
        template_id, 'HOST', uuidv7(), '未绑定主播', site_id,
        'notification:unbound-failed:' || suffix, '{}'::jsonb, CURRENT_TIMESTAMP,
        'FAILED', CURRENT_TIMESTAMP, 'RECIPIENT_UNBOUND', '接收人尚未绑定微信账号'
    ) RETURNING "id" INTO failed_task_id;

    IF NOT EXISTS (
        SELECT 1 FROM "notification_tasks"
        WHERE "id" = failed_task_id AND "status" = 'FAILED' AND "attempt_count" = 0
    ) THEN
        RAISE EXCEPTION 'Valid unbound recipient failure was rejected';
    END IF;

    UPDATE "notification_template_versions" SET
        "status" = 'RETIRED',
        "retired_at" = CURRENT_TIMESTAMP,
        "row_version" = 3
    WHERE "id" = template_id;
    BEGIN
        DELETE FROM "notification_template_versions" WHERE "id" = template_id;
        RAISE EXCEPTION 'Notification template history was deletable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
END $$;

ROLLBACK;
