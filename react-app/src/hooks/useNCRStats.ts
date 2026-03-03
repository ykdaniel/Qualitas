import { useMemo } from 'react';
import type { NCRItem } from '../store/ncrStore';

export const useNCRStats = (ncrList: NCRItem[]) => {
  return useMemo(() => {
    const statusCounts = {
      opening: 0,
      closed: 0,
    };

    ncrList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      if (status === 'open' || status === 'opening') {
        statusCounts.opening++;
      } else if (status === 'closed') {
        statusCounts.closed++;
      }
    });

    const total = ncrList.length;
    const openRate = total > 0 ? Math.round((statusCounts.opening / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      openRate,
    };
  }, [ncrList]);
};
