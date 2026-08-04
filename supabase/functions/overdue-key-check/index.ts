import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Prefer the custom `SERVICE_ROLE_KEY` secret (an sb_secret_... API key that can be
// rotated on its own). `SUPABASE_*` is a reserved namespace in Edge Functions, so the
// replacement cannot shadow the built-in name — it has to be read explicitly.
// The fallback is the built-in legacy service_role JWT, kept only so the function keeps
// working mid-migration. Remove it once the legacy keys are disabled.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  (Deno.env.get('SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
);

Deno.serve(async () => {
  const { data, error } = await supabase.rpc('mark_key_overdue');

  if (error) {
    console.error(
      JSON.stringify({ event: 'overdue_check_failed', error: error.message })
    );
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updated_count = Array.isArray(data)
    ? (data[0]?.updated_count ?? 0)
    : (data?.updated_count ?? 0);

  console.log(
    JSON.stringify({ event: 'overdue_check_complete', updated_count })
  );

  return new Response(JSON.stringify({ updated_count }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
