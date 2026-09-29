'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/auth';

export type DesignerClaimEligibility = { canClaim: boolean; profilePublished: boolean; acceptingOrders: boolean; profileCompleted: boolean; approvedPortfolioCount: number };

export function useDesignerClaimEligibility(enabled: boolean) {
  const [eligibility, setEligibility] = useState<DesignerClaimEligibility | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) { setEligibility(null); setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setEligibility(null);
    setError(false);
    fetchWithAuth('/designer-profile/claim-eligibility')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || '接单资格检查失败');
        if (!cancelled) setEligibility(result.data);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { eligibility, loading: enabled && (loading || (!eligibility && !error)), error };
}
