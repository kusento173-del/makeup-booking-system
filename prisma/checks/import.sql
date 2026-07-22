BEGIN;

DO $$
DECLARE
    uploader_id UUID;
    batch_id UUID;
    digest TEXT := repeat('a', 64);
BEGIN
    INSERT INTO "app_users" ("display_name")
    VALUES ('导入检查管理员')
    RETURNING "id" INTO uploader_id;

    INSERT INTO "import_batches" (
        "import_type",
        "template_version",
        "mode",
        "original_filename",
        "file_sha256",
        "storage_key",
        "uploaded_by_user_id"
    ) VALUES (
        'HOST',
        '1.0',
        'MERGE',
        '主播名单.xlsx',
        digest,
        'protected/import-check.xlsx',
        uploader_id
    ) RETURNING "id" INTO batch_id;

    INSERT INTO "import_rows" (
        "import_batch_id",
        "sheet_name",
        "row_number",
        "raw_data",
        "normalized_data",
        "validation_status",
        "planned_action"
    ) VALUES (
        batch_id,
        '主播名单',
        2,
        '{"编号":"ZB0001"}'::jsonb,
        '{"hostCode":"ZB0001"}'::jsonb,
        'VALID',
        'CREATE'
    );

    BEGIN
        INSERT INTO "import_rows" (
            "import_batch_id",
            "sheet_name",
            "row_number",
            "raw_data",
            "normalized_data",
            "validation_status"
        ) VALUES (
            batch_id,
            '主播名单',
            2,
            '{}'::jsonb,
            '{}'::jsonb,
            'VALID'
        );
        RAISE EXCEPTION 'Duplicate import row location was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        UPDATE "import_batches"
        SET "status" = 'SUCCEEDED'
        WHERE "id" = batch_id;
        RAISE EXCEPTION 'Succeeded import without confirmation and timestamps was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE "import_batches"
        SET
            "status" = 'FAILED',
            "started_at" = CURRENT_TIMESTAMP,
            "completed_at" = CURRENT_TIMESTAMP,
            "failure_reason" = '未确认却开始'
        WHERE "id" = batch_id;
        RAISE EXCEPTION 'Unconfirmed started import was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "import_batches" (
            "import_type",
            "template_version",
            "mode",
            "original_filename",
            "file_sha256",
            "storage_key",
            "uploaded_by_user_id"
        ) VALUES (
            'FIXED_RELATION',
            '1.0',
            'MERGE',
            '历史固定主播名单.xlsx',
            repeat('b', 64),
            'protected/fixed.xlsx',
            uploader_id
        );
        RAISE EXCEPTION 'Unsupported fixed-relation import type was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "import_batches" (
            "import_type",
            "template_version",
            "mode",
            "original_filename",
            "file_sha256",
            "storage_key",
            "uploaded_by_user_id"
        ) VALUES (
            'ARTIST',
            '1.0',
            'MERGE',
            '化妆师名单.xlsx',
            'not-a-sha256',
            'protected/artist.xlsx',
            uploader_id
        );
        RAISE EXCEPTION 'Invalid file digest was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;
END $$;

ROLLBACK;
