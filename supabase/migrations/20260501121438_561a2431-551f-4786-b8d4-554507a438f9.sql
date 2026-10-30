-- Deduplicate any existing rows before adding unique constraint
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.ctid < b.ctid AND a.employee_id = b.employee_id;

ALTER TABLE public.push_subscriptions
ADD CONSTRAINT push_subscriptions_employee_id_key UNIQUE (employee_id);