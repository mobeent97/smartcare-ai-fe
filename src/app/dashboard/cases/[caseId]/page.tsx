'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function CaseRedirect() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/dashboard?case=${caseId}`);
  }, [caseId, router]);

  return null;
}
