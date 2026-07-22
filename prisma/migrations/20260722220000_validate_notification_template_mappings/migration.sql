CREATE FUNCTION "notification_mini_program_mappings_valid"("mappings" VARCHAR[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
    SELECT
        cardinality("mappings") BETWEEN 1 AND 32
        AND count(*) = count(DISTINCT split_part("mapping", '=', 1))
        AND bool_and(
            "mapping" ~ '^(thing|number|letter|symbol|character_string|time|date|amount|phone_number|car_number|name|phrase|enum)[0-9]{1,2}=[A-Za-z][A-Za-z0-9]*$'
        )
    FROM unnest("mappings") AS "mapping"
$$;

ALTER TABLE "notification_template_versions"
ADD CONSTRAINT "notification_template_versions_mini_program_mapping_check"
CHECK (
    "channel" <> 'WECHAT_MINI_PROGRAM'
    OR "notification_mini_program_mappings_valid"("variable_keys")
);
