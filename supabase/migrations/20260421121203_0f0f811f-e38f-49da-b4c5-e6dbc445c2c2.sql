-- Store the service role key in Vault and update the relay-message trigger
-- to read it from there, so the edge function actually gets called.

-- 1. Insert the service role key into Vault (idempotent)
DO $$
DECLARE
  _exists uuid;
BEGIN
  SELECT id INTO _exists FROM vault.secrets WHERE name = 'service_role_key';
  IF _exists IS NULL THEN
    PERFORM vault.create_secret(
      'REPLACE_ME',
      'service_role_key',
      'Service role key used by handle_new_relay_message trigger'
    );
  END IF;
END $$;

-- 2. Rewrite the trigger function to read from Vault
CREATE OR REPLACE FUNCTION public.handle_new_relay_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _url text := 'https://lrnifksjfxnvyfdnqaqm.supabase.co/functions/v1/notify-relay-message';
  _key text;
BEGIN
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(_key, ''),
      'apikey', COALESCE(_key, '')
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'job_id', NEW.job_id,
        'sender_id', NEW.sender_id,
        'sender_name', NEW.sender_name,
        'sender_type', NEW.sender_type,
        'message', NEW.message,
        'created_at', NEW.created_at
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_relay_message failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;