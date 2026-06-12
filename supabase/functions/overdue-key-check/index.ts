import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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
