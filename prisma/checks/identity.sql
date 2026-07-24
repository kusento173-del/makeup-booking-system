BEGIN;

DO $$
DECLARE
    test_suffix TEXT := txid_current()::text;
    site_id UUID;
    user_one_id UUID;
    user_two_id UUID;
    binding_host_id UUID;
    binding_code_id UUID;
    binding_challenge_id UUID;
    role_selection_challenge_id UUID;
    role_id UUID;
    binding_hash TEXT;
    challenge_hash TEXT;
    role_selection_hash TEXT;
    mobile_hash TEXT;
    refresh_hash TEXT;
BEGIN
    SELECT "id" INTO site_id FROM "sites" WHERE "code" = 'SONGJIANG';

    IF site_id IS NULL THEN
        RAISE EXCEPTION 'Identity checks require the SONGJIANG site';
    END IF;

    mobile_hash := lpad(test_suffix, 64, 'a');
    refresh_hash := lpad(test_suffix, 64, 'c');
    binding_hash := lpad(test_suffix, 64, 'e');
    challenge_hash := lpad(test_suffix, 64, '9');
    role_selection_hash := lpad(test_suffix, 64, '6');

    INSERT INTO "app_users" (
        "display_name",
        "mobile_ciphertext",
        "mobile_hash",
        "mobile_last4"
    ) VALUES (
        'identity-check-one',
        'encrypted-mobile-one',
        mobile_hash,
        '1234'
    ) RETURNING "id" INTO user_one_id;

    INSERT INTO "app_users" ("display_name")
    VALUES ('identity-check-two')
    RETURNING "id" INTO user_two_id;

    IF uuid_extract_version(user_one_id) <> 7 OR uuid_extract_version(user_two_id) <> 7 THEN
        RAISE EXCEPTION 'User IDs must use UUIDv7';
    END IF;

    BEGIN
        INSERT INTO "app_users" (
            "display_name",
            "mobile_ciphertext",
            "mobile_hash",
            "mobile_last4"
        ) VALUES ('duplicate-mobile', 'encrypted-mobile-two', mobile_hash, '1234');
        RAISE EXCEPTION 'Duplicate mobile hash was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "app_users" ("display_name", "mobile_hash")
        VALUES ('incomplete-mobile', lpad(test_suffix, 64, 'b'));
        RAISE EXCEPTION 'Incomplete mobile protection fields were accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    INSERT INTO "user_identities" (
        "user_id",
        "provider",
        "provider_app_id",
        "external_subject"
    ) VALUES (user_one_id, 'WECHAT', 'wx-app-check', 'openid-' || test_suffix);

    BEGIN
        INSERT INTO "user_identities" (
            "user_id",
            "provider",
            "provider_app_id",
            "external_subject"
        ) VALUES (user_two_id, 'WECHAT', 'wx-app-check', 'openid-' || test_suffix);
        RAISE EXCEPTION 'Duplicate external identity was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "user_identities" (
            "user_id",
            "provider",
            "provider_app_id",
            "external_subject"
        ) VALUES (user_two_id, 'WECHAT', '', 'another-openid-' || test_suffix);
        RAISE EXCEPTION 'Blank provider app ID was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    INSERT INTO "password_credentials" ("user_id", "password_hash")
    VALUES (user_one_id, '$argon2id$identity-check');

    BEGIN
        INSERT INTO "password_credentials" (
            "user_id",
            "password_hash",
            "failed_attempt_count"
        ) VALUES (user_two_id, '$argon2id$invalid-counter', -1);
        RAISE EXCEPTION 'Negative failed-attempt count was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "user_roles" ("user_id", "role_code")
        VALUES (user_one_id, 'HOST');
        RAISE EXCEPTION 'Host role without a site was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    INSERT INTO "user_roles" ("user_id", "role_code", "site_id")
    VALUES (user_one_id, 'HOST', site_id);

    BEGIN
        INSERT INTO "user_roles" ("user_id", "role_code")
        VALUES (user_one_id, 'CUSTOMER_SERVICE');
        RAISE EXCEPTION 'Customer-service role without a site was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "user_roles" ("user_id", "role_code", "site_id")
        VALUES (user_one_id, 'ADMIN', site_id);
        RAISE EXCEPTION 'Global admin role with a site was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    INSERT INTO "user_roles" ("user_id", "role_code", "site_id")
    VALUES (user_one_id, 'CUSTOMER_SERVICE', site_id)
    RETURNING "id" INTO role_id;

    BEGIN
        INSERT INTO "user_roles" ("user_id", "role_code", "site_id")
        VALUES (user_one_id, 'CUSTOMER_SERVICE', site_id);
        RAISE EXCEPTION 'Duplicate active role was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    UPDATE "user_roles" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "id" = role_id;

    INSERT INTO "user_roles" ("user_id", "role_code", "site_id")
    VALUES (user_one_id, 'CUSTOMER_SERVICE', site_id);

    SELECT "id" INTO role_id
    FROM "user_roles"
    WHERE "user_id" = user_one_id
      AND "role_code" = 'CUSTOMER_SERVICE'
      AND "revoked_at" IS NULL;

    INSERT INTO "auth_sessions" (
        "user_id",
        "role_assignment_id",
        "refresh_token_hash",
        "expires_at"
    ) VALUES (user_one_id, role_id, refresh_hash, CURRENT_TIMESTAMP + INTERVAL '1 day');

    BEGIN
        INSERT INTO "auth_sessions" (
            "user_id",
            "role_assignment_id",
            "refresh_token_hash",
            "expires_at"
        ) VALUES (user_one_id, role_id, refresh_hash, CURRENT_TIMESTAMP + INTERVAL '1 day');
        RAISE EXCEPTION 'Duplicate refresh-token hash was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "auth_sessions" (
            "user_id",
            "role_assignment_id",
            "refresh_token_hash",
            "expires_at"
        ) VALUES (user_two_id, role_id, lpad(test_suffix, 64, '7'), CURRENT_TIMESTAMP + INTERVAL '1 day');
        RAISE EXCEPTION 'Session accepted a role owned by another user';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "auth_sessions" (
            "user_id",
            "role_assignment_id",
            "refresh_token_hash",
            "expires_at"
        ) VALUES (user_one_id, role_id, 'raw-token', CURRENT_TIMESTAMP + INTERVAL '1 day');
        RAISE EXCEPTION 'Unhashed refresh token was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "auth_sessions" (
            "user_id",
            "role_assignment_id",
            "refresh_token_hash",
            "expires_at"
        ) VALUES (user_one_id, role_id, lpad(test_suffix, 64, 'd'), CURRENT_TIMESTAMP - INTERVAL '1 day');
        RAISE EXCEPTION 'Expired session was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        DELETE FROM "auth_sessions" WHERE "refresh_token_hash" = refresh_hash;
        RAISE EXCEPTION 'Session history was deleted';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;

    INSERT INTO "host_profiles" ("user_id", "host_code", "real_name", "site_id")
    VALUES (user_one_id, 'IDENTITY-HOST-1-' || test_suffix, 'Identity Host One', site_id);

    BEGIN
        INSERT INTO "host_profiles" ("user_id", "host_code", "real_name", "site_id")
        VALUES (user_one_id, 'IDENTITY-HOST-2-' || test_suffix, 'Identity Host Two', site_id);
        RAISE EXCEPTION 'One user was bound to multiple host profiles';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    INSERT INTO "host_profiles" ("host_code", "real_name", "site_id")
    VALUES ('IDENTITY-BIND-HOST-' || test_suffix, 'Binding Host', site_id)
    RETURNING "id" INTO binding_host_id;

    INSERT INTO "account_binding_codes" (
        "role_code",
        "site_id",
        "host_profile_id",
        "code_hash",
        "expires_at",
        "created_by_user_id"
    ) VALUES (
        'HOST',
        site_id,
        binding_host_id,
        binding_hash,
        CURRENT_TIMESTAMP + INTERVAL '1 day',
        user_one_id
    ) RETURNING "id" INTO binding_code_id;

    BEGIN
        INSERT INTO "account_binding_codes" (
            "role_code",
            "site_id",
            "host_profile_id",
            "code_hash",
            "expires_at",
            "created_by_user_id"
        ) VALUES (
            'HOST',
            site_id,
            binding_host_id,
            lpad(test_suffix, 64, 'f'),
            CURRENT_TIMESTAMP + INTERVAL '1 day',
            user_one_id
        );
        RAISE EXCEPTION 'Multiple active binding codes for one host were accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO "account_binding_codes" (
            "role_code",
            "site_id",
            "host_profile_id",
            "code_hash",
            "expires_at",
            "created_by_user_id"
        ) VALUES (
            'ARTIST',
            site_id,
            binding_host_id,
            lpad(test_suffix, 64, 'b'),
            CURRENT_TIMESTAMP + INTERVAL '1 day',
            user_one_id
        );
        RAISE EXCEPTION 'Binding role and profile mismatch was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE "account_binding_codes"
        SET "failed_attempt_count" = 6
        WHERE "id" = binding_code_id;
        RAISE EXCEPTION 'Binding-code attempts above the maximum were accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    UPDATE "account_binding_codes"
    SET
        "consumed_at" = CURRENT_TIMESTAMP,
        "consumed_by_user_id" = user_two_id,
        "row_version" = "row_version" + 1
    WHERE "id" = binding_code_id;

    BEGIN
        DELETE FROM "account_binding_codes" WHERE "id" = binding_code_id;
        RAISE EXCEPTION 'Binding-code history was deleted';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;

    UPDATE "app_users"
    SET "status" = 'PENDING_BINDING'
    WHERE "id" = user_two_id;

    INSERT INTO "auth_binding_challenges" (
        "user_id",
        "token_hash",
        "expires_at"
    ) VALUES (
        user_two_id,
        challenge_hash,
        CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    ) RETURNING "id" INTO binding_challenge_id;

    BEGIN
        INSERT INTO "auth_binding_challenges" (
            "user_id",
            "token_hash",
            "expires_at"
        ) VALUES (
            user_two_id,
            lpad(test_suffix, 64, '8'),
            CURRENT_TIMESTAMP + INTERVAL '10 minutes'
        );
        RAISE EXCEPTION 'Multiple active binding challenges for one user were accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    UPDATE "auth_binding_challenges"
    SET "consumed_at" = CURRENT_TIMESTAMP
    WHERE "id" = binding_challenge_id;

    BEGIN
        DELETE FROM "auth_binding_challenges" WHERE "id" = binding_challenge_id;
        RAISE EXCEPTION 'Binding challenge history was deleted';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;

    INSERT INTO "auth_role_selection_challenges" (
        "user_id",
        "token_hash",
        "expires_at"
    ) VALUES (
        user_one_id,
        role_selection_hash,
        CURRENT_TIMESTAMP + INTERVAL '5 minutes'
    ) RETURNING "id" INTO role_selection_challenge_id;

    BEGIN
        INSERT INTO "auth_role_selection_challenges" (
            "user_id",
            "token_hash",
            "expires_at"
        ) VALUES (
            user_one_id,
            lpad(test_suffix, 64, '5'),
            CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        );
        RAISE EXCEPTION 'Multiple active role-selection challenges for one user were accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    UPDATE "auth_role_selection_challenges"
    SET "consumed_at" = CURRENT_TIMESTAMP
    WHERE "id" = role_selection_challenge_id;

    BEGIN
        DELETE FROM "auth_role_selection_challenges" WHERE "id" = role_selection_challenge_id;
        RAISE EXCEPTION 'Role-selection challenge history was deleted';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN NULL;
    END;

    BEGIN
        DELETE FROM "app_users" WHERE "id" = user_one_id;
        RAISE EXCEPTION 'User with identity history was deleted';
    EXCEPTION
        WHEN restrict_violation THEN NULL;
    END;
END $$;

ROLLBACK;
