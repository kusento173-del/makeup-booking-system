BEGIN;

DO $$
DECLARE
    site_id UUID;
    user_id UUID;
    artist_id UUID;
    period_id UUID;
    pending_period_id UUID;
    suffix TEXT := txid_current()::text;
BEGIN
    SELECT "id" INTO site_id FROM "sites" WHERE "code" = 'SONGJIANG';

    INSERT INTO "app_users" ("display_name")
    VALUES ('不可排班约束-' || suffix)
    RETURNING "id" INTO user_id;

    INSERT INTO "artist_profiles" (
        "real_name",
        "nickname",
        "nickname_normalized",
        "site_id"
    ) VALUES (
        '不可排班测试化妆师',
        '不可排班-' || suffix,
        'unavailable-' || suffix,
        site_id
    )
    RETURNING "id" INTO artist_id;

    INSERT INTO "artist_unavailable_periods" (
        "artist_id",
        "site_id",
        "unavailable_date",
        "start_minute",
        "end_minute",
        "reason",
        "created_by_user_id"
    ) VALUES (
        artist_id,
        site_id,
        DATE '2026-08-01',
        780,
        900,
        '上课',
        user_id
    )
    RETURNING "id" INTO period_id;

    BEGIN
        INSERT INTO "artist_unavailable_periods" (
            "artist_id",
            "site_id",
            "unavailable_date",
            "start_minute",
            "end_minute",
            "reason",
            "created_by_user_id"
        ) VALUES (
            artist_id,
            site_id,
            DATE '2026-08-01',
            840,
            960,
            '重叠时段',
            user_id
        );
        RAISE EXCEPTION 'Overlapping active unavailable period was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "artist_unavailable_periods" (
            "artist_id",
            "site_id",
            "unavailable_date",
            "start_minute",
            "end_minute",
            "reason",
            "created_by_user_id"
        ) VALUES (
            artist_id,
            site_id,
            DATE '2026-08-02',
            785,
            900,
            '错误时间',
            user_id
        );
        RAISE EXCEPTION 'Non-15-minute unavailable period was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "artist_unavailable_periods" (
        "artist_id",
        "site_id",
        "unavailable_date",
        "start_minute",
        "end_minute",
        "reason",
        "status",
        "created_by_user_id"
    ) VALUES (
        artist_id,
        site_id,
        DATE '2026-08-03',
        780,
        900,
        'Pending review',
        'PENDING',
        user_id
    )
    RETURNING "id" INTO pending_period_id;

    BEGIN
        INSERT INTO "artist_unavailable_periods" (
            "artist_id",
            "site_id",
            "unavailable_date",
            "start_minute",
            "end_minute",
            "reason",
            "created_by_user_id"
        ) VALUES (
            artist_id,
            site_id,
            DATE '2026-08-03',
            840,
            960,
            'Overlaps pending',
            user_id
        );
        RAISE EXCEPTION 'Unavailable period overlapping a pending request was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    BEGIN
        UPDATE "artist_unavailable_periods"
        SET "status" = 'REJECTED'
        WHERE "id" = pending_period_id;
        RAISE EXCEPTION 'Rejected unavailable period without reviewer was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE "artist_unavailable_periods"
    SET
        "status" = 'REJECTED',
        "reviewed_by_user_id" = user_id,
        "reviewed_at" = CURRENT_TIMESTAMP,
        "review_comment" = 'Not approved',
        "review_impact_snapshot" = '[]'::JSONB
    WHERE "id" = pending_period_id;

    BEGIN
        UPDATE "artist_unavailable_periods"
        SET "review_impact_snapshot" = '{}'::JSONB
        WHERE "id" = pending_period_id;
        RAISE EXCEPTION 'Non-array unavailable-period review impact snapshot was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "artist_unavailable_periods" (
        "artist_id",
        "site_id",
        "unavailable_date",
        "start_minute",
        "end_minute",
        "reason",
        "created_by_user_id"
    ) VALUES (
        artist_id,
        site_id,
        DATE '2026-08-03',
        840,
        960,
        'Allowed after rejection',
        user_id
    );

    BEGIN
        UPDATE "artist_unavailable_periods"
        SET "status" = 'CANCELLED'
        WHERE "id" = period_id;
        RAISE EXCEPTION 'Cancellation without actor and time was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE "artist_unavailable_periods"
    SET
        "status" = 'CANCELLED',
        "cancelled_by_user_id" = user_id,
        "cancelled_at" = CURRENT_TIMESTAMP,
        "cancellation_reason" = '课程取消',
        "row_version" = "row_version" + 1
    WHERE "id" = period_id;

    INSERT INTO "artist_unavailable_periods" (
        "artist_id",
        "site_id",
        "unavailable_date",
        "start_minute",
        "end_minute",
        "reason",
        "created_by_user_id"
    ) VALUES (
        artist_id,
        site_id,
        DATE '2026-08-01',
        840,
        960,
        '原时段取消后可重新设置',
        user_id
    );
END $$;

ROLLBACK;
