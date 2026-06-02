'use client';

import { useEffect, useState } from 'react';

import { createBrowserClient } from '@/lib/supabase/client';

export type ProfileData = {
  name: string;
  email: string;
  avatar: string;
  loading: boolean;
};

export function useProfile(): ProfileData {
  const [state, setState] = useState<ProfileData>({
    name: '',
    email: '',
    avatar: '',
    loading: true,
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Optimistic partial update with auth email while profile loads
      setState((prev) => ({ ...prev, email: user.email ?? '' }));

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, institutional_email, photo_url')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      setState({
        name: profile?.full_name ?? '',
        email: profile?.institutional_email ?? user.email ?? '',
        avatar: profile?.photo_url ?? '',
        loading: false,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
