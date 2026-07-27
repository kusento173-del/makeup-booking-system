BEGIN;

DO $$
DECLARE
    test_suffix TEXT := txid_current()::text;
    site_id UUID;
    user_one_id UUID;
    user_two_id UUID;
    role_selection_challenge_id UUID;
    role_id UUID;
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
    ) VALUES (user_one_id, 'PASSWORD', 'BACKOFFICE', 'identity-' || test_suffix);

    BEGIN
        INSERT INTO "user_identities" (
            "user_id",
            "provider",
            "provider_app_id",
            "external_subject"
        ) VALUES (user_two_id, 'PASSWORD', 'BACKOFFICE', 'identity-' || test_suffix);
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
        ) VALUES (user_two_id, 'PASSWORD', '', 'another-identity-' || test_suffix);
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
