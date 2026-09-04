-- SmartKey — make the daily shift report actually generate itself

select cron.schedule('daily-shift-summary', '0 18 * * *', $$
  select public.schedule_pending_shift_report();
  select net.http_post(
    url     := 'https://smartkey-ochre.vercel.app/api/cron/shift-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'weekend_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$$);
