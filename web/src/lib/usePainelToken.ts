'use client';

import { useEffect, useState } from 'react';
import { getPainelToken } from '@/lib/api';

/** Lê token do painel após montagem (evita divergência SSR/client). */
export function usePainelToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(getPainelToken());
  }, []);
  return token;
}
