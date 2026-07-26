CREATE OR REPLACE FUNCTION public.audit_snapshot_has_sensitive_key(snapshot JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
DECLARE
    item RECORD;
    normalized_key TEXT;
BEGIN
    IF jsonb_typeof(snapshot) = 'object' THEN
        FOR item IN SELECT "key", "value" FROM jsonb_each(snapshot) LOOP
            normalized_key := regexp_replace(lower(item."key"), '[-_]', '', 'g');

            IF normalized_key = ANY (ARRAY[
                'password',
                'passwordhash',
                'accesstoken',
                'refreshtoken',
                'token',
                'authorization',
                'cookie',
                'mobile',
                'mobilenumber',
                'mobileciphertext',
                'mobilehash',
                'phone',
                'phonenumber',
                'externalsubject',
                'openid',
                'unionid'
            ]) THEN
                RETURN TRUE;
            END IF;

            IF jsonb_typeof(item."value") IN ('object', 'array')
                AND public.audit_snapshot_has_sensitive_key(item."value") THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(snapshot) = 'array' THEN
        FOR item IN SELECT "value" FROM jsonb_array_elements(snapshot) LOOP
            IF jsonb_typeof(item."value") IN ('object', 'array')
                AND public.audit_snapshot_has_sensitive_key(item."value") THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    END IF;

    RETURN FALSE;
END;
$$;
