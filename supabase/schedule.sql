-- Vaqtida — push eslatmalarini rejalashtirish (pg_cron)
-- Supabase → SQL Editor'da bir marta bajaring.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Eski jadval bo'lsa olib tashlaymiz (qayta ishga tushirishda xato bermasin)
select cron.unschedule('vaqtida-reminders')
where exists (select 1 from cron.job where jobname = 'vaqtida-reminders');

-- Har daqiqada send-reminders Edge Function'ini chaqiradi
select cron.schedule(
  'vaqtida-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://zmycycvvyikkiqonyixo.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '88980afc6ce8ab79224a711aa4a4faf910a64c487f792549'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Tekshirish:  select * from cron.job;
-- To'xtatish:  select cron.unschedule('vaqtida-reminders');
