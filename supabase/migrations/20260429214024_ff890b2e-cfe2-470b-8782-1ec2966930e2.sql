-- Add admin-only purchase receipt fields to assets
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS purchase_receipt_url text,
  ADD COLUMN IF NOT EXISTS purchase_receipt_notes text;

-- Private bucket for purchase receipts (admin/manager only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-receipts', 'purchase-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: only admins/managers can read/write purchase receipts
DROP POLICY IF EXISTS "Admins read purchase receipts" ON storage.objects;
CREATE POLICY "Admins read purchase receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'purchase-receipts'
    AND lower(coalesce(public.get_employee_role(auth.uid()), '')) IN ('admin','manager')
  );

DROP POLICY IF EXISTS "Admins insert purchase receipts" ON storage.objects;
CREATE POLICY "Admins insert purchase receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'purchase-receipts'
    AND lower(coalesce(public.get_employee_role(auth.uid()), '')) IN ('admin','manager')
  );

DROP POLICY IF EXISTS "Admins update purchase receipts" ON storage.objects;
CREATE POLICY "Admins update purchase receipts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'purchase-receipts'
    AND lower(coalesce(public.get_employee_role(auth.uid()), '')) IN ('admin','manager')
  );

DROP POLICY IF EXISTS "Admins delete purchase receipts" ON storage.objects;
CREATE POLICY "Admins delete purchase receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'purchase-receipts'
    AND lower(coalesce(public.get_employee_role(auth.uid()), '')) IN ('admin','manager')
  );

-- Extend the operator asset-update guard so operators cannot modify receipt fields
CREATE OR REPLACE FUNCTION public.guard_operator_asset_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    NEW.purchase_receipt_url := OLD.purchase_receipt_url;
    NEW.purchase_receipt_notes := OLD.purchase_receipt_notes;
  END IF;
  RETURN NEW;
END;
$function$;