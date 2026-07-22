CREATE FUNCTION prevent_auth_session_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'auth_sessions cannot be deleted'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "auth_sessions_prevent_delete"
BEFORE DELETE ON "auth_sessions"
FOR EACH ROW
EXECUTE FUNCTION prevent_auth_session_delete();
