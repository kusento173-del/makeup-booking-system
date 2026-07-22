BEGIN;

DO $$
DECLARE
    site_id UUID;
    operator_user_id UUID;
    reviewer_user_id UUID;
    operator_id UUID;
    host_one_id UUID;
    host_two_id UUID;
    artist_one_id UUID;
    artist_two_id UUID;
    create_request_id UUID;
    duplicate_request_id UUID;
    second_request_id UUID;
    cancel_request_id UUID;
    created_rule_id UUID;
    suffix TEXT := txid_current()::text;
BEGIN
    SELECT "id" INTO site_id FROM "sites" WHERE "code" = 'SONGJIANG';
    INSERT INTO "app_users" ("display_name") VALUES ('固定运营-' || suffix)
    RETURNING "id" INTO operator_user_id;
    INSERT INTO "app_users" ("display_name") VALUES ('固定审核-' || suffix)
    RETURNING "id" INTO reviewer_user_id;
    INSERT INTO "operator_profiles" ("user_id", "real_name", "name_normalized", "site_id")
    VALUES (operator_user_id, '固定运营', 'fixed-operator-' || suffix, site_id)
    RETURNING "id" INTO operator_id;
    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES ('FIX-H1-' || suffix, '固定主播一', site_id) RETURNING "id" INTO host_one_id;
    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES ('FIX-H2-' || suffix, '固定主播二', site_id) RETURNING "id" INTO host_two_id;
    INSERT INTO "artist_profiles" ("real_name", "nickname", "nickname_normalized", "site_id")
    VALUES ('固定化妆师一', '固定妆一-' || suffix, 'fixed-artist-one-' || suffix, site_id)
    RETURNING "id" INTO artist_one_id;
    INSERT INTO "artist_profiles" ("real_name", "nickname", "nickname_normalized", "site_id")
    VALUES ('固定化妆师二', '固定妆二-' || suffix, 'fixed-artist-two-' || suffix, site_id)
    RETURNING "id" INTO artist_two_id;

    BEGIN
        INSERT INTO "fixed_appointment_requests" (
            "request_type", "host_id", "site_id", "target_artist_id", "target_weekdays",
            "target_start_minute", "target_duration_minutes", "effective_from", "reason",
            "submitted_by_operator_id", "submitted_by_user_id"
        ) VALUES (
            'CREATE', host_one_id, site_id, artist_one_id, ARRAY[]::SMALLINT[],
            540, 30, DATE '2026-08-03', '非法星期', operator_id, operator_user_id
        );
        RAISE EXCEPTION 'Empty fixed weekdays were accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "fixed_appointment_requests" (
        "request_type", "host_id", "site_id", "target_artist_id", "target_weekdays",
        "target_start_minute", "target_duration_minutes", "effective_from", "reason",
        "submitted_by_operator_id", "submitted_by_user_id"
    ) VALUES (
        'CREATE', host_one_id, site_id, artist_one_id, ARRAY[1, 3]::SMALLINT[],
        540, 30, DATE '2026-08-03', '申请固定', operator_id, operator_user_id
    ) RETURNING "id" INTO create_request_id;

    BEGIN
        INSERT INTO "fixed_appointment_requests" (
            "request_type", "host_id", "site_id", "target_artist_id", "target_weekdays",
            "target_start_minute", "target_duration_minutes", "effective_from", "reason",
            "submitted_by_operator_id", "submitted_by_user_id"
        ) VALUES (
            'CREATE', host_one_id, site_id, artist_two_id, ARRAY[2]::SMALLINT[],
            600, 30, DATE '2026-08-03', '重复待审', operator_id, operator_user_id
        );
        RAISE EXCEPTION 'Duplicate pending host request was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    UPDATE "fixed_appointment_requests" SET
        "status" = 'APPROVED', "reviewed_by_user_id" = reviewer_user_id,
        "reviewed_at" = CURRENT_TIMESTAMP, "row_version" = 2
    WHERE "id" = create_request_id;

    BEGIN
        INSERT INTO "fixed_appointment_rules" (
            "source_request_id", "host_id", "artist_id", "site_id",
            "start_minute", "duration_minutes", "valid_from"
        ) VALUES (
            create_request_id, host_one_id, artist_two_id, site_id, 540, 30, DATE '2026-08-03'
        );
        RAISE EXCEPTION 'Rule inconsistent with its approved request was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "fixed_appointment_rules" (
        "source_request_id", "host_id", "artist_id", "site_id",
        "start_minute", "duration_minutes", "valid_from"
    ) VALUES (
        create_request_id, host_one_id, artist_one_id, site_id, 540, 30, DATE '2026-08-03'
    ) RETURNING "id" INTO created_rule_id;

    INSERT INTO "fixed_appointment_rule_weekdays" (
        "rule_id", "iso_weekday", "host_id", "artist_id", "site_id",
        "start_minute", "end_minute", "valid_from"
    ) VALUES
        (created_rule_id, 1, host_one_id, artist_one_id, site_id, 540, 570, DATE '2026-08-03'),
        (created_rule_id, 3, host_one_id, artist_one_id, site_id, 540, 570, DATE '2026-08-03');

    BEGIN
        INSERT INTO "fixed_appointment_rule_weekdays" (
            "rule_id", "iso_weekday", "host_id", "artist_id", "site_id",
            "start_minute", "end_minute", "valid_from"
        ) VALUES (created_rule_id, 2, host_one_id, artist_one_id, site_id, 540, 570, DATE '2026-08-03');
        RAISE EXCEPTION 'Weekday absent from the approved request was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "fixed_appointment_requests" (
        "request_type", "host_id", "site_id", "target_artist_id", "target_weekdays",
        "target_start_minute", "target_duration_minutes", "effective_from", "reason",
        "submitted_by_operator_id", "submitted_by_user_id"
    ) VALUES (
        'CREATE', host_two_id, site_id, artist_one_id, ARRAY[1]::SMALLINT[],
        555, 30, DATE '2026-08-03', '冲突固定', operator_id, operator_user_id
    ) RETURNING "id" INTO second_request_id;
    UPDATE "fixed_appointment_requests" SET
        "status" = 'APPROVED', "reviewed_by_user_id" = reviewer_user_id,
        "reviewed_at" = CURRENT_TIMESTAMP, "row_version" = 2
    WHERE "id" = second_request_id;

    BEGIN
        INSERT INTO "fixed_appointment_rules" (
            "source_request_id", "host_id", "artist_id", "site_id",
            "start_minute", "duration_minutes", "valid_from"
        ) VALUES (
            second_request_id, host_two_id, artist_one_id, site_id, 555, 30, DATE '2026-08-03'
        ) RETURNING "id" INTO duplicate_request_id;
        INSERT INTO "fixed_appointment_rule_weekdays" (
            "rule_id", "iso_weekday", "host_id", "artist_id", "site_id",
            "start_minute", "end_minute", "valid_from"
        ) VALUES (
            duplicate_request_id, 1, host_two_id, artist_one_id, site_id, 555, 585, DATE '2026-08-03'
        );
        RAISE EXCEPTION 'Overlapping artist fixed slot was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    INSERT INTO "appointments" (
        "host_id", "host_code_snapshot", "host_name_snapshot",
        "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
        "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
        "appointment_type", "fixed_rule_id", "created_by_role"
    ) VALUES (
        host_one_id, 'FIXED-H1', '固定主播一', artist_one_id, '固定化妆师一', site_id, '松江场地',
        DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 09:00:00+08',
        TIMESTAMPTZ '2026-08-03 09:30:00+08', 30, 1, 'FIXED', created_rule_id, 'SYSTEM'
    );

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "appointment_type", "fixed_rule_id", "created_by_role"
        ) VALUES (
            host_one_id, 'FIXED-H1', '固定主播一', artist_one_id, '固定化妆师一', site_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 09:00:00+08',
            TIMESTAMPTZ '2026-08-03 09:30:00+08', 30, 1, 'FIXED', created_rule_id, 'SYSTEM'
        );
        RAISE EXCEPTION 'Duplicate fixed rule date was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "appointment_type", "fixed_rule_id", "created_by_role"
        ) VALUES (
            host_two_id, 'FIXED-H2', '固定主播二', artist_two_id, '固定化妆师二', site_id, '松江场地',
            DATE '2026-08-04', TIMESTAMPTZ '2026-08-04 10:00:00+08',
            TIMESTAMPTZ '2026-08-04 10:30:00+08', 30, 1, 'SINGLE', created_rule_id, 'SYSTEM'
        );
        RAISE EXCEPTION 'Single appointment with fixed ancestry was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "fixed_appointment_requests" (
        "request_type", "host_id", "site_id", "current_rule_id", "target_weekdays",
        "effective_from", "reason", "submitted_by_operator_id", "submitted_by_user_id"
    ) VALUES (
        'CANCEL', host_one_id, site_id, created_rule_id, ARRAY[]::SMALLINT[], DATE '2026-08-10',
        '取消固定', operator_id, operator_user_id
    ) RETURNING "id" INTO cancel_request_id;
    UPDATE "fixed_appointment_requests" SET
        "status" = 'APPROVED', "reviewed_by_user_id" = reviewer_user_id,
        "reviewed_at" = CURRENT_TIMESTAMP, "row_version" = 2
    WHERE "id" = cancel_request_id;
    UPDATE "fixed_appointment_rules" SET
        "status" = 'ENDED', "valid_until" = DATE '2026-08-10',
        "ended_by_request_id" = cancel_request_id, "row_version" = 2
    WHERE "id" = created_rule_id;
    UPDATE "fixed_appointment_rule_weekdays" SET "valid_until" = DATE '2026-08-10'
    WHERE "rule_id" = created_rule_id;

    BEGIN
        DELETE FROM "fixed_appointment_rules" WHERE "id" = created_rule_id;
        RAISE EXCEPTION 'Fixed rule history was deletable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
    BEGIN
        DELETE FROM "fixed_appointment_requests" WHERE "id" = create_request_id;
        RAISE EXCEPTION 'Fixed request history was deletable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
END $$;

ROLLBACK;
