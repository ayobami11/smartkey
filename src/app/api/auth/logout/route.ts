import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const POST = async () => {
  const supabase = await createServerClient();

  const { error } = await supabase.auth.signOut();
  if (error) {
    return NextResponse.json(err('Failed to sign out', 500), { status: 500 });
  }

  return NextResponse.json(ok(null));
};
