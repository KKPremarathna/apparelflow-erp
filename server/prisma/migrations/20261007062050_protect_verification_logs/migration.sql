CREATE FUNCTION public.prevent_verification_log_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Verification audit logs are immutable.'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER verification_logs_no_update_delete
BEFORE UPDATE OR DELETE
ON public.verification_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_verification_log_changes();

CREATE TRIGGER verification_logs_no_truncate
BEFORE TRUNCATE
ON public.verification_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_verification_log_changes();