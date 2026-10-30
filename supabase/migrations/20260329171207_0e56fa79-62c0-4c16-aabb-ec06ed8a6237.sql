-- Enable full replica identity on assets table so Realtime UPDATE payloads include old values
ALTER TABLE public.assets REPLICA IDENTITY FULL;