BEGIN;

DO $$
DECLARE
    user_id UUID;
    site_id UUID;
    job_id UUID;
    failed_job_id UUID;
    suffix TEXT := txid_current()::text;
BEGIN
    SELECT "id" INTO site_id FROM "sites" ORDER BY "sort_order", "id" LIMIT 1;
    INSERT INTO "app_users" ("display_name")
    VALUES ('导出约束-' || suffix) RETURNING "id" INTO user_id;

    BEGIN
        INSERT INTO "export_jobs" (
            "requested_by_user_id", "requested_by_role_code", "scope", "schedule_date"
        ) VALUES (user_id, 'CUSTOMER_SERVICE', 'SINGLE_SITE', DATE '2026-07-23');
        RAISE EXCEPTION 'Single-site export without site was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "export_jobs" (
            "requested_by_user_id", "requested_by_role_code", "scope", "site_id", "schedule_date"
        ) VALUES (user_id, 'ADMIN', 'ALL_SITES', site_id, DATE '2026-07-23');
        RAISE EXCEPTION 'All-sites export with site was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO "export_jobs" (
        "requested_by_user_id", "requested_by_role_code", "scope", "site_id", "schedule_date"
    ) VALUES (
        user_id, 'CUSTOMER_SERVICE', 'SINGLE_SITE', site_id, DATE '2026-07-23'
    ) RETURNING "id" INTO job_id;

    BEGIN
        UPDATE "export_jobs" SET
            "status" = 'SUCCEEDED',
            "started_at" = CURRENT_TIMESTAMP,
            "completed_at" = CURRENT_TIMESTAMP,
            "expires_at" = CURRENT_TIMESTAMP + INTERVAL '24 hours',
            "output_filename" = 'schedule.xlsx',
            "content_type" = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            "storage_key" = 'exports/schedule.xlsx',
            "file_size_bytes" = 100,
            "file_sha256" = repeat('a', 64),
            "row_count" = 1,
            "row_version" = 2
        WHERE "id" = job_id;
        RAISE EXCEPTION 'Pending export skipped processing';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    BEGIN
        UPDATE "export_jobs" SET
            "site_id" = NULL,
            "scope" = 'ALL_SITES',
            "status" = 'PROCESSING',
            "started_at" = CURRENT_TIMESTAMP,
            "row_version" = 2
        WHERE "id" = job_id;
        RAISE EXCEPTION 'Export request scope was mutable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    UPDATE "export_jobs" SET
        "status" = 'PROCESSING',
        "started_at" = CURRENT_TIMESTAMP,
        "row_version" = 2
    WHERE "id" = job_id;

    BEGIN
        UPDATE "export_jobs" SET
            "status" = 'SUCCEEDED',
            "completed_at" = CURRENT_TIMESTAMP,
            "expires_at" = CURRENT_TIMESTAMP + INTERVAL '24 hours',
            "output_filename" = '../schedule.xlsx',
            "content_type" = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            "storage_key" = 'exports/schedule.xlsx',
            "file_size_bytes" = 100,
            "file_sha256" = repeat('a', 64),
            "row_count" = 1,
            "row_version" = 3
        WHERE "id" = job_id;
        RAISE EXCEPTION 'Unsafe export filename was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE "export_jobs" SET
        "status" = 'SUCCEEDED',
        "completed_at" = CURRENT_TIMESTAMP,
        "expires_at" = CURRENT_TIMESTAMP + INTERVAL '24 hours',
        "output_filename" = 'schedule.xlsx',
        "content_type" = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        "storage_key" = 'exports/' || job_id || '.xlsx',
        "file_size_bytes" = 100,
        "file_sha256" = repeat('a', 64),
        "row_count" = 1,
        "row_version" = 3
    WHERE "id" = job_id;

    BEGIN
        UPDATE "export_jobs" SET "row_count" = 2, "row_version" = 4 WHERE "id" = job_id;
        RAISE EXCEPTION 'Completed export history was mutable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    BEGIN
        DELETE FROM "export_jobs" WHERE "id" = job_id;
        RAISE EXCEPTION 'Export history was deletable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    INSERT INTO "export_jobs" (
        "requested_by_user_id", "requested_by_role_code", "scope", "schedule_date"
    ) VALUES (
        user_id, 'ADMIN', 'ALL_SITES', DATE '2026-07-23'
    ) RETURNING "id" INTO failed_job_id;

    UPDATE "export_jobs" SET
        "status" = 'PROCESSING',
        "started_at" = CURRENT_TIMESTAMP,
        "row_version" = 2
    WHERE "id" = failed_job_id;
    UPDATE "export_jobs" SET
        "status" = 'FAILED',
        "failure_reason" = '对象存储暂不可用',
        "completed_at" = CURRENT_TIMESTAMP,
        "row_version" = 3
    WHERE "id" = failed_job_id;

    IF NOT EXISTS (
        SELECT 1 FROM "export_jobs"
        WHERE "id" = failed_job_id AND "status" = 'FAILED' AND "row_version" = 3
    ) THEN
        RAISE EXCEPTION 'Valid failed export lifecycle was rejected';
    END IF;
END $$;

ROLLBACK;
