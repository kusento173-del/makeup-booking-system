BEGIN;

DO $$
DECLARE
    site_id UUID;
    user_id UUID;
    artist_id UUID;
    other_artist_id UUID;
    first_shift_id UUID;
    current_shift_id UUID;
    request_id UUID;
    test_suffix TEXT := txid_current()::text;
BEGIN
    SELECT "id" INTO site_id FROM "sites" WHERE "code" = 'SONGJIANG';

    INSERT INTO "app_users" ("display_name")
    VALUES ('班次约束检查-' || test_suffix)
    RETURNING "id" INTO user_id;

    INSERT INTO "artist_profiles" (
        "real_name",
        "nickname",
        "nickname_normalized",
        "site_id"
    ) VALUES (
        '班次测试化妆师',
        '班次测试-' || test_suffix,
        'shift-check-' || test_suffix,
        site_id
    ) RETURNING "id" INTO artist_id;

    INSERT INTO "artist_profiles" (
        "real_name",
        "nickname",
        "nickname_normalized",
        "site_id"
    ) VALUES (
        '其他班次测试化妆师',
        '其他班次测试-' || test_suffix,
        'other-shift-check-' || test_suffix,
        site_id
    ) RETURNING "id" INTO other_artist_id;

    INSERT INTO "artist_shift_templates" (
        "artist_id",
        "version_no",
        "workdays",
        "work_start_minute",
        "break_start_minute",
        "break_end_minute",
        "work_end_minute",
        "valid_from",
        "valid_until",
        "created_by_user_id"
    ) VALUES (
        artist_id,
        1,
        ARRAY[1, 2, 3, 4, 5]::SMALLINT[],
        540,
        720,
        780,
        1080,
        DATE '2026-08-01',
        DATE '2026-09-01',
        user_id
    ) RETURNING "id" INTO first_shift_id;

    INSERT INTO "artist_shift_templates" (
        "artist_id",
        "version_no",
        "workdays",
        "work_start_minute",
        "work_end_minute",
        "valid_from",
        "created_by_user_id"
    ) VALUES (
        artist_id,
        2,
        ARRAY[2, 3, 4, 5, 6]::SMALLINT[],
        600,
        1140,
        DATE '2026-09-01',
        user_id
    ) RETURNING "id" INTO current_shift_id;

    BEGIN
        INSERT INTO "artist_shift_templates" (
            "artist_id", "version_no", "workdays", "work_start_minute",
            "work_end_minute", "valid_from"
        ) VALUES (
            artist_id, 3, ARRAY[]::SMALLINT[], 540, 1080, DATE '2026-10-01'
        );
        RAISE EXCEPTION 'Empty workday set was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "artist_shift_templates" (
            "artist_id", "version_no", "workdays", "work_start_minute",
            "work_end_minute", "valid_from"
        ) VALUES (
            artist_id, 3, ARRAY[1, 1]::SMALLINT[], 540, 1080, DATE '2026-10-01'
        );
        RAISE EXCEPTION 'Duplicate workdays were accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "artist_shift_templates" (
            "artist_id", "version_no", "workdays", "work_start_minute",
            "work_end_minute", "valid_from"
        ) VALUES (
            artist_id, 3, ARRAY[8]::SMALLINT[], 540, 1080, DATE '2026-10-01'
        );
        RAISE EXCEPTION 'Non-ISO workday was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "artist_shift_templates" (
            "artist_id", "version_no", "workdays", "work_start_minute",
            "break_start_minute", "work_end_minute", "valid_from"
        ) VALUES (
            artist_id, 3, ARRAY[1]::SMALLINT[], 540, 720, 1080, DATE '2026-10-01'
        );
        RAISE EXCEPTION 'Partial break was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "artist_shift_templates" (
            "artist_id", "version_no", "workdays", "work_start_minute",
            "work_end_minute", "valid_from"
        ) VALUES (
            artist_id, 3, ARRAY[1]::SMALLINT[], 545, 1080, DATE '2026-10-01'
        );
        RAISE EXCEPTION 'Non-15-minute shift was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "artist_shift_templates" (
            "artist_id", "version_no", "workdays", "work_start_minute",
            "work_end_minute", "valid_from", "valid_until"
        ) VALUES (
            artist_id, 3, ARRAY[1]::SMALLINT[], 540, 1080,
            DATE '2026-08-15', DATE '2026-08-20'
        );
        RAISE EXCEPTION 'Overlapping shift version was accepted';
    EXCEPTION
        WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        UPDATE "artist_shift_templates"
        SET "work_end_minute" = 1095
        WHERE "id" = first_shift_id;
        RAISE EXCEPTION 'Historical shift mutation was accepted';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;

    BEGIN
        DELETE FROM "artist_shift_templates" WHERE "id" = first_shift_id;
        RAISE EXCEPTION 'Historical shift delete was accepted';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;

    INSERT INTO "artist_shift_change_requests" (
        "artist_id",
        "site_id",
        "current_shift_id",
        "proposed_workdays",
        "proposed_work_start_minute",
        "proposed_break_start_minute",
        "proposed_break_end_minute",
        "proposed_work_end_minute",
        "effective_from",
        "reason",
        "submitted_by_user_id"
    ) VALUES (
        artist_id,
        site_id,
        current_shift_id,
        ARRAY[1, 2, 3, 4, 5]::SMALLINT[],
        540,
        720,
        780,
        1080,
        DATE '2026-10-01',
        '调整工作日',
        user_id
    ) RETURNING "id" INTO request_id;

    BEGIN
        INSERT INTO "artist_shift_change_requests" (
            "artist_id", "site_id", "current_shift_id", "proposed_workdays",
            "proposed_work_start_minute", "proposed_work_end_minute",
            "effective_from", "reason", "submitted_by_user_id"
        ) VALUES (
            artist_id, site_id, current_shift_id, ARRAY[1]::SMALLINT[],
            540, 1080, DATE '2026-10-15', '第二个待审批申请', user_id
        );
        RAISE EXCEPTION 'Second pending shift request was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "artist_shift_change_requests" (
            "artist_id", "site_id", "current_shift_id", "proposed_workdays",
            "proposed_work_start_minute", "proposed_work_end_minute",
            "effective_from", "reason", "submitted_by_user_id"
        ) VALUES (
            other_artist_id, site_id, current_shift_id, ARRAY[1]::SMALLINT[],
            540, 1080, DATE '2026-10-01', '错误班次归属', user_id
        );
        RAISE EXCEPTION 'Cross-artist current shift was accepted';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        UPDATE "artist_shift_change_requests"
        SET "status" = 'APPROVED'
        WHERE "id" = request_id;
        RAISE EXCEPTION 'Approval without reviewer was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    UPDATE "artist_shift_change_requests"
    SET
        "status" = 'APPROVED',
        "reviewed_by_user_id" = user_id,
        "reviewed_at" = CURRENT_TIMESTAMP,
        "review_comment" = '同意',
        "row_version" = "row_version" + 1
    WHERE "id" = request_id;

    UPDATE "artist_shift_templates"
    SET "valid_until" = DATE '2026-10-01'
    WHERE "id" = current_shift_id;

    BEGIN
        UPDATE "artist_shift_templates"
        SET "valid_until" = DATE '2026-10-15'
        WHERE "id" = current_shift_id;
        RAISE EXCEPTION 'Closed shift was changed again';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;
END $$;

ROLLBACK;
