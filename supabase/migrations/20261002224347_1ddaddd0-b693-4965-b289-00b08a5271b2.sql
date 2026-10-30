CREATE OR REPLACE FUNCTION public.auto_register_employee(_user_id uuid, _name text, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees WHERE user_id = _user_id OR lower(email) = lower(_email)) THEN
    RETURN;
  END IF;
  INSERT INTO public.employees (user_id, name, email, role, status)
  VALUES (_user_id, COALESCE(NULLIF(_name, ''), _email), _email, 'pending', 'pending');
END;
$$;
REVOKE ALL ON FUNCTION public.auto_register_employee(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_register_employee(uuid, text, text) TO authenticated;