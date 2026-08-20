select cron.schedule('audit-log-export', '0 2 * * *', $$
  select net.http_post(
    url     := 'https://smartkey-ochre.vercel.app/api/cron/audit-export',
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
