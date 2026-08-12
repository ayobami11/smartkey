-- Fix: every pg_net-based cron job called `extensions.http_post`

select cron.schedule('weekend-code-reminders', '0 6 * * 6,0', $$
  select net.http_post(
    url     := 'https://smartkey-ochre.vercel.app/api/cron/weekend-reminders',
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

select cron.schedule('overdue-key-check', '0 * * * *', $$
  select public.mark_key_overdue();
  select net.http_post(
    url     := 'https://smartkey-ochre.vercel.app/api/cron/overdue-reminders',
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

select cron.schedule('daily-digest', '0 7 * * *', $$
  select net.http_post(
    url     := 'https://smartkey-ochre.vercel.app/api/cron/daily-digest',
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
