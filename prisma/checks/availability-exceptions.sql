BEGIN;

DO $$
DECLARE
    site_id UUID;
    user_id UUID;
    host_id UUID;
    artist_id UUID;
    operator_id UUID;
    host_leave_id UUID;
    artist_leave_id UUID;
    artist_pending_leave_id UUID;
    overtime_id UUID;
    fixed_request_id UUID;
    fixed_rule_id UUID;
    fixed_appointment_id UUID;
    suffix TEXT := txid_current()::text;
BEGIN
    SELECT "id" INTO site_id FROM "sites" WHERE "code" = 'SONGJIANG';
    INSERT INTO "app_users" ("display_name") VALUES ('请假加班约束-' || suffix) RETURNING "id" INTO user_id;
    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES ('LEAVE-' || suffix, '请假测试主播', site_id) RETURNING "id" INTO host_id;
    INSERT INTO "artist_profiles" ("real_name", "nickname", "nickname_normalized", "site_id")
    VALUES ('请假测试化妆师', '请假测试-' || suffix, 'leave-check-' || suffix, site_id)
    RETURNING "id" INTO artist_id;
    INSERT INTO "operator_profiles" ("real_name", "name_normalized", "site_id")
    VALUES ('请假测试运营', 'leave-operator-' || suffix, site_id)
    RETURNING "id" INTO operator_id;

    INSERT INTO "leave_records" (
        "subject_type", "host_id", "start_date", "end_date", "reason", "created_by_user_id"
    ) VALUES ('HOST', host_id, DATE '2026-08-01', DATE '2026-08-03', '休息', user_id)
    RETURNING "id" INTO host_leave_id;

    BEGIN
        INSERT INTO "leave_records" (
            "subject_type", "host_id", "start_date", "end_date", "created_by_user_id"
        ) VALUES ('HOST', host_id, DATE '2026-08-03', DATE '2026-08-04', user_id);
        RAISE EXCEPTION 'Overlapping active host leave was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "leave_records" (
            "subject_type", "host_id", "artist_id", "start_date", "end_date", "created_by_user_id"
        ) VALUES ('HOST', host_id, artist_id, DATE '2026-08-05', DATE '2026-08-05', user_id);
        RAISE EXCEPTION 'Leave with two subjects was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "leave_records" (
            "subject_type", "artist_id", "start_date", "end_date", "created_by_user_id"
        ) VALUES ('ARTIST', artist_id, DATE '2026-08-01', DATE '2026-08-08', user_id);
        RAISE EXCEPTION 'Eight-day leave was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "leave_records" (
        "subject_type", "artist_id", "start_date", "end_date", "status", "created_by_user_id"
    ) VALUES (
        'ARTIST', artist_id, DATE '2026-08-06', DATE '2026-08-06', 'PENDING', user_id
    ) RETURNING "id" INTO artist_pending_leave_id;

    BEGIN
        INSERT INTO "leave_records" (
            "subject_type", "artist_id", "start_date", "end_date", "created_by_user_id"
        ) VALUES ('ARTIST', artist_id, DATE '2026-08-06', DATE '2026-08-06', user_id);
        RAISE EXCEPTION 'Leave overlapping a pending artist leave was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        UPDATE "leave_records"
        SET "status" = 'REJECTED'
        WHERE "id" = artist_pending_leave_id;
        RAISE EXCEPTION 'Rejected leave without reviewer was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE "leave_records"
    SET
        "status" = 'REJECTED',
        "reviewed_by_user_id" = user_id,
        "reviewed_at" = CURRENT_TIMESTAMP,
        "review_comment" = 'Not approved'
    WHERE "id" = artist_pending_leave_id;

    INSERT INTO "leave_records" (
        "subject_type", "artist_id", "start_date", "end_date", "created_by_user_id"
    ) VALUES ('ARTIST', artist_id, DATE '2026-08-06', DATE '2026-08-06', user_id);

    BEGIN
        UPDATE "leave_records" SET "status" = 'CANCELLED' WHERE "id" = host_leave_id;
        RAISE EXCEPTION 'Cancellation without actor and time was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE "leave_records" SET
        "status" = 'CANCELLED', "cancelled_by_user_id" = user_id,
        "cancelled_at" = CURRENT_TIMESTAMP, "cancellation_reason" = '行程变化'
    WHERE "id" = host_leave_id;
    INSERT INTO "leave_records" (
        "subject_type", "host_id", "start_date", "end_date", "created_by_user_id"
    ) VALUES ('HOST', host_id, DATE '2026-08-02', DATE '2026-08-02', user_id);

    INSERT INTO "artist_overtimes" (
        "artist_id", "site_id", "overtime_date", "work_start_minute", "work_end_minute",
        "reason", "submitted_by_user_id"
    ) VALUES (artist_id, site_id, DATE '2026-08-09', 540, 1080, '临时加班', user_id)
    RETURNING "id" INTO overtime_id;

    BEGIN
        INSERT INTO "artist_overtimes" (
            "artist_id", "site_id", "overtime_date", "work_start_minute", "work_end_minute",
            "reason", "submitted_by_user_id"
        ) VALUES (artist_id, site_id, DATE '2026-08-09', 540, 1080, '重复加班', user_id);
        RAISE EXCEPTION 'Duplicate active overtime was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "artist_overtimes" (
            "artist_id", "site_id", "overtime_date", "work_start_minute", "work_end_minute",
            "reason", "submitted_by_user_id"
        ) VALUES (artist_id, site_id, DATE '2026-08-10', 545, 1080, '错误时间', user_id);
        RAISE EXCEPTION 'Non-15-minute overtime was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE "artist_overtimes" SET
        "status" = 'REJECTED', "reviewed_by_user_id" = user_id, "reviewed_at" = CURRENT_TIMESTAMP
    WHERE "id" = overtime_id;
    INSERT INTO "artist_overtimes" (
        "artist_id", "site_id", "overtime_date", "work_start_minute", "work_end_minute",
        "reason", "submitted_by_user_id"
    ) VALUES (artist_id, site_id, DATE '2026-08-09', 540, 1080, '重新申请', user_id);

    INSERT INTO "fixed_appointment_requests" (
        "request_type", "host_id", "site_id", "target_artist_id", "target_weekdays",
        "target_start_minute", "target_duration_minutes", "effective_from", "reason",
        "status", "submitted_by_operator_id", "submitted_by_user_id",
        "reviewed_by_user_id", "reviewed_at"
    ) VALUES (
        'CREATE', host_id, site_id, artist_id, ARRAY[1]::SMALLINT[],
        900, 30, DATE '2026-08-03', '固定恢复约束',
        'APPROVED', operator_id, user_id, user_id, CURRENT_TIMESTAMP
    ) RETURNING "id" INTO fixed_request_id;

    INSERT INTO "fixed_appointment_rules" (
        "source_request_id", "host_id", "artist_id", "site_id",
        "start_minute", "duration_minutes", "valid_from"
    ) VALUES (
        fixed_request_id, host_id, artist_id, site_id, 900, 30, DATE '2026-08-03'
    ) RETURNING "id" INTO fixed_rule_id;

    INSERT INTO "fixed_appointment_rule_weekdays" (
        "rule_id", "iso_weekday", "host_id", "artist_id", "site_id",
        "start_minute", "end_minute", "valid_from"
    ) VALUES (
        fixed_rule_id, 1, host_id, artist_id, site_id, 900, 930, DATE '2026-08-03'
    );

    INSERT INTO "leave_records" (
        "subject_type", "artist_id", "start_date", "end_date", "reason", "created_by_user_id"
    ) VALUES (
        'ARTIST', artist_id, DATE '2026-08-03', DATE '2026-08-03',
        '固定恢复测试', user_id
    ) RETURNING "id" INTO artist_leave_id;

    INSERT INTO "appointments" (
        "host_id", "host_code_snapshot", "host_name_snapshot",
        "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
        "appointment_date", "start_at", "end_at", "duration_minutes",
        "appointment_type", "fixed_rule_id", "status", "daily_sequence",
        "created_by_role", "cancelled_at", "cancelled_by_user_id",
        "cancellation_reason_code", "cancellation_source_type", "cancellation_source_id"
    ) VALUES (
        host_id, 'LEAVE-FIXED', '请假测试主播',
        artist_id, '请假测试化妆师', site_id, '松江',
        DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 15:00:00+08',
        TIMESTAMPTZ '2026-08-03 15:30:00+08', 30,
        'FIXED', fixed_rule_id, 'CANCELLED', 1,
        'SYSTEM', CURRENT_TIMESTAMP, user_id,
        'ARTIST_LEAVE', 'LEAVE_RECORD', artist_leave_id
    ) RETURNING "id" INTO fixed_appointment_id;

    UPDATE "leave_records" SET
        "status" = 'CANCELLED',
        "cancelled_by_user_id" = user_id,
        "cancelled_at" = CURRENT_TIMESTAMP,
        "cancellation_reason" = '恢复上班',
        "row_version" = 2
    WHERE "id" = artist_leave_id;

    UPDATE "appointments" SET
        "status" = 'BOOKED',
        "cancelled_at" = NULL,
        "cancelled_by_user_id" = NULL,
        "cancellation_reason_code" = NULL,
        "cancellation_reason_text" = NULL,
        "cancellation_source_type" = NULL,
        "cancellation_source_id" = NULL,
        "updated_at" = CURRENT_TIMESTAMP,
        "row_version" = "row_version" + 1
    WHERE "id" = fixed_appointment_id;
END $$;

ROLLBACK;
