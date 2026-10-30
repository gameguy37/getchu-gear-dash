CREATE OR REPLACE FUNCTION public.redeem_reward(_reward_id uuid, _employee_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cost integer;
  _available integer;
  _redeemed integer;
  _current_points integer;
BEGIN
  -- Verify caller owns the employee record being charged
  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = _employee_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to redeem for this employee';
  END IF;

  SELECT points_cost, quantity_available, quantity_redeemed
  INTO _cost, _available, _redeemed
  FROM public.rewards WHERE id = _reward_id AND active = true FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Reward not found or inactive'; END IF;

  IF _available IS NOT NULL AND _redeemed >= _available THEN
    RAISE EXCEPTION 'Reward is out of stock';
  END IF;

  SELECT points INTO _current_points FROM public.employees WHERE id = _employee_id FOR UPDATE;

  IF _current_points < _cost THEN RAISE EXCEPTION 'Not enough points'; END IF;

  UPDATE public.employees SET points = points - _cost WHERE id = _employee_id;
  UPDATE public.rewards SET quantity_redeemed = quantity_redeemed + 1 WHERE id = _reward_id;

  INSERT INTO public.reward_redemptions (reward_id, employee_id, points_spent)
    VALUES (_reward_id, _employee_id, _cost);
END;
$function$;