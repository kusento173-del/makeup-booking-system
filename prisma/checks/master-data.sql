BEGIN;

DO $$
DECLARE
    songjiang_id UUID;
    wuxi_id UUID;
    host_id UUID;
    qualification_history_id UUID;
    operator_id UUID;
    test_suffix TEXT := txid_current()::text;
    host_code_one TEXT;
    host_code_two TEXT;
    artist_match_name TEXT;
    operator_match_name TEXT;
BEGIN
    host_code_one := 'CHECK-HOST-1-' || test_suffix;
    host_code_two := 'CHECK-HOST-2-' || test_suffix;
    artist_match_name := 'check-artist-' || test_suffix;
    operator_match_name := 'check-operator-' || test_suffix;

    IF (
        SELECT array_agg("code"::text ORDER BY "sort_order")
        FROM "sites"
    ) <> ARRAY['SONGJIANG', 'XIANCHANG', 'WUXI'] THEN
        RAISE EXCEPTION 'Expected three initialized sites';
    END IF;

    IF EXISTS (SELECT 1 FROM "sites" WHERE uuid_extract_version("id") <> 7) THEN
        RAISE EXCEPTION 'Site IDs must use UUIDv7';
    END IF;

    SELECT "id" INTO songjiang_id FROM "sites" WHERE "code" = 'SONGJIANG';
    SELECT "id" INTO wuxi_id FROM "sites" WHERE "code" = 'WUXI';

    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES (host_code_one, '同名主播', songjiang_id)
    RETURNING "id" INTO host_id;

    INSERT INTO "host_qualification_histories" (
        "host_id",
        "to_status",
        "effective_at"
    ) VALUES (host_id, 'ACTIVE', CURRENT_TIMESTAMP)
    RETURNING "id" INTO qualification_history_id;

    BEGIN
        INSERT INTO "host_qualification_histories" (
            "host_id",
            "from_status",
            "to_status",
            "effective_at"
        ) VALUES (host_id, 'ACTIVE', 'ACTIVE', CURRENT_TIMESTAMP);
        RAISE EXCEPTION 'No-op host qualification transition was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE "host_qualification_histories"
        SET "to_status" = 'SUSPENDED'
        WHERE "id" = qualification_history_id;
        RAISE EXCEPTION 'Host qualification history update was accepted';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;

    BEGIN
        DELETE FROM "host_qualification_histories"
        WHERE "id" = qualification_history_id;
        RAISE EXCEPTION 'Host qualification history delete was accepted';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;

    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES (host_code_two, '同名主播', songjiang_id);

    BEGIN
        INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
        VALUES (host_code_one, '另一主播', songjiang_id);
        RAISE EXCEPTION 'Duplicate host code was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    INSERT INTO "artist_profiles" (
        "real_name",
        "nickname",
        "nickname_normalized",
        "site_id"
    ) VALUES ('测试化妆师一', '测试昵称一', artist_match_name, songjiang_id);

    BEGIN
        INSERT INTO "artist_profiles" (
            "real_name",
            "nickname",
            "nickname_normalized",
            "site_id"
        ) VALUES ('测试化妆师二', '测试昵称二', artist_match_name, wuxi_id);
        RAISE EXCEPTION 'Duplicate active artist nickname was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    UPDATE "artist_profiles"
    SET "employment_status" = 'INACTIVE'
    WHERE "nickname_normalized" = artist_match_name;

    INSERT INTO "artist_profiles" (
        "real_name",
        "nickname",
        "nickname_normalized",
        "site_id"
    ) VALUES ('测试化妆师二', '测试昵称二', artist_match_name, wuxi_id);

    INSERT INTO "operator_profiles" (
        "real_name",
        "name_normalized",
        "site_id"
    ) VALUES ('测试运营', operator_match_name, songjiang_id)
    RETURNING "id" INTO operator_id;

    BEGIN
        INSERT INTO "operator_profiles" (
            "real_name",
            "name_normalized",
            "site_id"
        ) VALUES ('测试运营', operator_match_name, songjiang_id);
        RAISE EXCEPTION 'Duplicate active operator in one site was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    INSERT INTO "operator_profiles" (
        "real_name",
        "name_normalized",
        "site_id"
    ) VALUES ('测试运营', operator_match_name, wuxi_id);

    INSERT INTO "host_operator_relations" (
        "host_id",
        "operator_id",
        "valid_from",
        "valid_until"
    ) VALUES (host_id, operator_id, DATE '2026-07-01', DATE '2026-07-10');

    BEGIN
        INSERT INTO "host_operator_relations" (
            "host_id",
            "operator_id",
            "valid_from",
            "valid_until"
        ) VALUES (host_id, operator_id, DATE '2026-07-09', DATE '2026-07-15');
        RAISE EXCEPTION 'Overlapping host-operator relation was accepted';
    EXCEPTION
        WHEN exclusion_violation THEN NULL;
    END;

    INSERT INTO "host_operator_relations" (
        "host_id",
        "operator_id",
        "valid_from"
    ) VALUES (host_id, operator_id, DATE '2026-07-10');

    BEGIN
        INSERT INTO "host_operator_relations" (
            "host_id",
            "operator_id",
            "valid_from",
            "valid_until"
        ) VALUES (host_id, operator_id, DATE '2026-08-01', DATE '2026-08-01');
        RAISE EXCEPTION 'Invalid empty validity range was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;
END $$;

ROLLBACK;
