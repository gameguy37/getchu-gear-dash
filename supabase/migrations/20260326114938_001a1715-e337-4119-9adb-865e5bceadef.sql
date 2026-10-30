CREATE OR REPLACE FUNCTION public.operator_update_own_profile(_name text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _sms_opt_in boolean DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(coalesce(public.get_employee_role(auth.uid()), '')) NOT IN ('operator', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.employees
  SET
    name = COALESCE(_name, name),
    phone = COALESCE(_phone, phone),
    sms_opt_in = COALESCE(_sms_opt_in, sms_opt_in),
    sms_opt_in_timestamp = CASE
      WHEN _sms_opt_in IS NOT NULL AND _sms_opt_in = true THEN now()
      WHEN _sms_opt_in IS NOT NULL AND _sms_opt_in = false THEN NULL
      ELSE sms_opt_in_timestamp
    END
  WHERE user_id = auth.uid();
END;
$function$;