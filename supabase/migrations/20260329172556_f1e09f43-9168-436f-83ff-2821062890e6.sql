
-- 1. Fix relay_messages anonymous INSERT: require portal token verification
DROP POLICY IF EXISTS "Public insert relay" ON public.relay_messages;
CREATE POLICY "Public insert relay" ON public.relay_messages
  FOR INSERT TO anon
  WITH CHECK (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = relay_messages.job_id
        AND jobs.portal_token IS NOT NULL
        AND (jobs.portal_token)::text = (
          (current_setting('request.headers', true))::json ->> 'x-portal-token'
        )
    )
  );

-- 2. Fix gearphotos bucket: replace broad policies with role-scoped ones
DROP POLICY IF EXISTS "Allow Authenticated Uploads xf2bps_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow Authenticated Uploads xf2bps_1" ON storage.objects;
DROP POLICY IF EXISTS "Allow Authenticated Uploads xf2bps_2" ON storage.objects;
DROP POLICY IF EXISTS "Allow Authenticated Uploads xf2bps_3" ON storage.objects;

-- Admins/managers: full CRUD on gearphotos
CREATE POLICY "Managers full access gearphotos" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'gearphotos'
    AND get_employee_role(auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    bucket_id = 'gearphotos'
    AND get_employee_role(auth.uid()) IN ('admin', 'manager')
  );

-- Operators: INSERT only on gearphotos
CREATE POLICY "Operators upload gearphotos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gearphotos'
    AND get_employee_role(auth.uid()) = 'operator'
  );

-- Operators: SELECT only on gearphotos
CREATE POLICY "Operators view gearphotos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gearphotos'
    AND get_employee_role(auth.uid()) = 'operator'
  );

-- 3. Fix operator asset updates: add trigger to guard sensitive columns
CREATE OR REPLACE FUNCTION public.guard_operator_asset_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(COALESCE(get_employee_role(auth.uid()), '')) = 'operator' THEN
    NEW.original_value := OLD.original_value;
    NEW.replacement_cost := OLD.replacement_cost;
    NEW.serial_number := OLD.serial_number;
    NEW.purchase_date := OLD.purchase_date;
    NEW.purchased_from := OLD.purchased_from;
    NEW.manufacturer := OLD.manufacturer;
    NEW.asset_name := OLD.asset_name;
    NEW.category := OLD.category;
    NEW.quantity := OLD.quantity;
    NEW.home_parent_id := OLD.home_parent_id;
    NEW.parent_asset_id := OLD.parent_asset_id;
    NEW.color_code := OLD.color_code;
    NEW.replaced_at := OLD.replaced_at;
    NEW.cover_image_url := OLD.cover_image_url;
    NEW.metadata := OLD.metadata;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_operator_asset_update
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_operator_asset_update();

-- 4. Fix operator notification insertion: scope operator_id to own record and restrict to assigned jobs
DROP POLICY IF EXISTS "Operators can insert notifications" ON public.admin_notifications;
CREATE POLICY "Operators can insert notifications" ON public.admin_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    get_employee_role(auth.uid()) = 'operator'
    AND operator_id = (SELECT id FROM employees WHERE user_id = auth.uid() LIMIT 1)
    AND job_id IN (
      SELECT a.job_id FROM assignments a
      WHERE a.operator_id = (SELECT id FROM employees WHERE user_id = auth.uid() LIMIT 1)
    )
  );
