BEGIN;

DO $$
DECLARE
    site_id UUID;
    user_id UUID;
    host_id UUID;
    artist_id UUID;
    host_leave_id UUID;
    overtime_id UUID;
    suffix TEXT := txid_current()::text;
BEGIN
    SELECT "id" INTO site_id FROM "sites" WHERE "code" = 'SONGJIANG';
    INSERT INTO "app_users" ("display_name") VALUES ('请假加班约束-' || suffix) RETURNING "id" INTO user_id;
    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES ('LEAVE-' || suffix, '请假测试主播', site_id) RETURNING "id" INTO host_id;
    INSERT INTO "artist_profiles" ("real_name", "nickname", "nickname_normalized", "site_id")
    VALUES ('请假测试化妆师', '请假测试-' || suffix, 'leave-check-' || suffix, site_id)
    RETURNING "id" INTO artist_id;

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
END $$;

ROLLBACK;
