BEGIN;

DO $$
DECLARE
    songjiang_id UUID;
    wuxi_id UUID;
    user_id UUID;
    host_one_id UUID;
    host_two_id UUID;
    artist_one_id UUID;
    artist_two_id UUID;
    wuxi_artist_id UUID;
    first_id UUID;
    second_id UUID;
    suffix TEXT := txid_current()::text;
BEGIN
    SELECT "id" INTO songjiang_id FROM "sites" WHERE "code" = 'SONGJIANG';
    SELECT "id" INTO wuxi_id FROM "sites" WHERE "code" = 'WUXI';
    INSERT INTO "app_users" ("display_name") VALUES ('预约约束-' || suffix) RETURNING "id" INTO user_id;
    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES ('APPT-H1-' || suffix, '预约主播一', songjiang_id) RETURNING "id" INTO host_one_id;
    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES ('APPT-H2-' || suffix, '预约主播二', songjiang_id) RETURNING "id" INTO host_two_id;
    INSERT INTO "artist_profiles" ("real_name", "nickname", "nickname_normalized", "site_id")
    VALUES ('预约化妆师一', '预约一-' || suffix, 'appointment-one-' || suffix, songjiang_id)
    RETURNING "id" INTO artist_one_id;
    INSERT INTO "artist_profiles" ("real_name", "nickname", "nickname_normalized", "site_id")
    VALUES ('预约化妆师二', '预约二-' || suffix, 'appointment-two-' || suffix, songjiang_id)
    RETURNING "id" INTO artist_two_id;
    INSERT INTO "artist_profiles" ("real_name", "nickname", "nickname_normalized", "site_id")
    VALUES ('无锡化妆师', '无锡预约-' || suffix, 'appointment-wuxi-' || suffix, wuxi_id)
    RETURNING "id" INTO wuxi_artist_id;

    INSERT INTO "appointments" (
        "host_id", "host_code_snapshot", "host_name_snapshot",
        "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
        "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
        "created_by_user_id", "created_by_role"
    ) VALUES (
        host_one_id, 'H001', '预约主播一', artist_one_id, '预约一', songjiang_id, '松江场地',
        DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 09:00:00+08',
        TIMESTAMPTZ '2026-08-03 09:30:00+08', 30, 1, user_id, 'HOST'
    ) RETURNING "id" INTO first_id;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', artist_one_id, '预约一', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 09:15:00+08',
            TIMESTAMPTZ '2026-08-03 09:45:00+08', 30, 1, user_id, 'CUSTOMER_SERVICE'
        );
        RAISE EXCEPTION 'Overlapping artist appointment was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_one_id, 'H001', '预约主播一', artist_two_id, '预约二', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 09:15:00+08',
            TIMESTAMPTZ '2026-08-03 09:45:00+08', 30, 2, user_id, 'OPERATOR'
        );
        RAISE EXCEPTION 'Overlapping host appointment was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    INSERT INTO "appointments" (
        "host_id", "host_code_snapshot", "host_name_snapshot",
        "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
        "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
        "created_by_user_id", "created_by_role"
    ) VALUES (
        host_one_id, 'H001', '预约主播一', artist_one_id, '预约一', songjiang_id, '松江场地',
        DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 09:30:00+08',
        TIMESTAMPTZ '2026-08-03 10:00:00+08', 30, 2, user_id, 'HOST'
    ) RETURNING "id" INTO second_id;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_one_id, 'H001', '预约主播一', artist_two_id, '预约二', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 11:00:00+08',
            TIMESTAMPTZ '2026-08-03 11:30:00+08', 30, 1, user_id, 'HOST'
        );
        RAISE EXCEPTION 'Duplicate active daily sequence was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', artist_two_id, '预约二', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 11:00:00+08',
            TIMESTAMPTZ '2026-08-03 11:20:00+08', 20, 1, user_id, 'HOST'
        );
        RAISE EXCEPTION 'Unsupported duration was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', artist_two_id, '预约二', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 23:30:00+08',
            TIMESTAMPTZ '2026-08-04 00:30:00+08', 60, 1, user_id, 'HOST'
        );
        RAISE EXCEPTION 'Cross-business-date appointment was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', artist_two_id, '预约二', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 11:05:00+08',
            TIMESTAMPTZ '2026-08-03 11:35:00+08', 30, 1, user_id, 'HOST'
        );
        RAISE EXCEPTION 'Non-15-minute start was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "operator_name_snapshot", "appointment_date", "start_at", "end_at",
            "duration_minutes", "daily_sequence", "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', artist_two_id, '预约二', songjiang_id, '松江场地',
            '无运营 ID', DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 11:00:00+08',
            TIMESTAMPTZ '2026-08-03 11:30:00+08', 30, 1, user_id, 'HOST'
        );
        RAISE EXCEPTION 'Unpaired operator snapshot was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', artist_two_id, '预约二', songjiang_id, '松江场地',
            DATE '2026-08-04', TIMESTAMPTZ '2026-08-03 11:00:00+08',
            TIMESTAMPTZ '2026-08-03 11:30:00+08', 30, 1, user_id, 'HOST'
        );
        RAISE EXCEPTION 'Mismatched business date was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', wuxi_artist_id, '无锡预约', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 11:00:00+08',
            TIMESTAMPTZ '2026-08-03 11:30:00+08', 30, 1, user_id, 'HOST'
        );
        RAISE EXCEPTION 'Cross-site artist appointment was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        UPDATE "appointments" SET
            "status" = 'CANCELLED', "updated_at" = CURRENT_TIMESTAMP, "row_version" = 2
        WHERE "id" = first_id;
        RAISE EXCEPTION 'Cancellation without required state fields was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE "appointments" SET
        "status" = 'CANCELLED', "cancelled_at" = CURRENT_TIMESTAMP,
        "cancelled_by_user_id" = user_id, "cancellation_reason_code" = 'USER_CANCELLED',
        "updated_at" = CURRENT_TIMESTAMP, "row_version" = 2
    WHERE "id" = first_id;

    INSERT INTO "appointments" (
        "host_id", "host_code_snapshot", "host_name_snapshot",
        "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
        "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
        "created_by_user_id", "created_by_role", "rescheduled_from_appointment_id"
    ) VALUES (
        host_one_id, 'H001', '预约主播一', artist_one_id, '预约一', songjiang_id, '松江场地',
        DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 09:00:00+08',
        TIMESTAMPTZ '2026-08-03 09:30:00+08', 30, 1, user_id, 'HOST', first_id
    );

    UPDATE "appointments" SET
        "status" = 'COMPLETED', "completed_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP, "row_version" = 2
    WHERE "id" = second_id;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', artist_one_id, '预约一', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 09:30:00+08',
            TIMESTAMPTZ '2026-08-03 10:00:00+08', 30, 1, user_id, 'HOST'
        );
        RAISE EXCEPTION 'Completed appointment released its historical artist range';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "appointments" (
            "host_id", "host_code_snapshot", "host_name_snapshot",
            "artist_id", "artist_nickname_snapshot", "site_id", "site_name_snapshot",
            "appointment_date", "start_at", "end_at", "duration_minutes", "daily_sequence",
            "appointment_type", "created_by_user_id", "created_by_role"
        ) VALUES (
            host_two_id, 'H002', '预约主播二', artist_two_id, '预约二', songjiang_id, '松江场地',
            DATE '2026-08-03', TIMESTAMPTZ '2026-08-03 13:00:00+08',
            TIMESTAMPTZ '2026-08-03 13:30:00+08', 30, 1, 'FIXED', user_id, 'HOST'
        );
        RAISE EXCEPTION 'Fixed appointment without fixed-rule ancestry was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE "appointments" SET "artist_id" = artist_two_id WHERE "id" = second_id;
        RAISE EXCEPTION 'Completed appointment identity was mutable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    BEGIN
        DELETE FROM "appointments" WHERE "id" = second_id;
        RAISE EXCEPTION 'Appointment history was deletable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
END $$;

ROLLBACK;
