SELECT cron.schedule(
  'cleanup-ghost-jobs-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lrnifksjfxnvyfdnqaqm.supabase.co/functions/v1/cleanup-ghost-jobs',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxybmlma3NqZnhudnlmZG5xYXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTk4MTgsImV4cCI6MjA4ODkzNTgxOH0.oELea-IFM1XRcOZ6YoxiZ17gHkRA9oH3RozNLvYiUd4"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);
