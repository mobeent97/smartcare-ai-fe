'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

type Direction = 'forward' | 'back';

/**
 * Wraps Next.js router.push with the View Transitions API.
 * Sets data-transition="forward|back" on <html> so CSS can
 * pick the correct slide direction.
 */
export function useTransitionRouter() {
  const router = useRouter();

  const navigate = useCallback(
    (href: string, direction: Direction = 'forward') => {
      if (typeof document === 'undefined' || !document.startViewTransition) {
        router.push(href);
        return;
      }

      document.documentElement.dataset.transition = direction;

      document.startViewTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  return { navigate };
}
