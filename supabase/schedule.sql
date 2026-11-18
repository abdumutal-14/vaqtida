-- Vaqtida — Push Reminder Scheduler (pg_cron)
-- Run once in Supabase -> SQL Editor after replacing placeholders.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove existing schedule if present
select cron.unschedule('vaqtida-reminders')
where exists (select 1 from cron.job where jobname = 'vaqtida-reminders');

-- Trigger send-reminders Edge Function every minute
select cron.schedule(
  'vaqtida-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<YOUR_CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify: select * from cron.job;
-- Stop:   select cron.unschedule('vaqtida-reminders');
