
-- Extend admin_notifications with new columns
ALTER TABLE admin_notifications
  ADD COLUMN IF NOT EXISTS recipient_role text DEFAULT 'manager',
  ADD COLUMN IF NOT EXISTS recipient_id text,
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subs"
  ON push_subscriptions
  FOR ALL
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- Allow managers to read all push_subscriptions (for sending push to others)
CREATE POLICY "Managers can read all push subs"
  ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (get_employee_role(auth.uid()) IN ('admin', 'manager'));

-- Create app_settings table (single-row config)
CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  send_client_emails boolean DEFAULT true,
  send_operator_emails boolean DEFAULT true,
  send_operator_sms boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read settings"
  ON app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can update settings"
  ON app_settings FOR UPDATE TO authenticated
  USING (get_employee_role(auth.uid()) IN ('admin', 'manager'))
  WITH CHECK (get_employee_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Managers can insert settings"
  ON app_settings FOR INSERT TO authenticated
  WITH CHECK (get_employee_role(auth.uid()) IN ('admin', 'manager'));

-- Seed default settings row
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Enable realtime on admin_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;
