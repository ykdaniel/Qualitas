import { useMemo } from 'react';
import type { NOIItem } from '../store/noiStore';

export const useNOIStats = (noiList: NOIItem[]) => {
  return useMemo(() => {
    const statusCounts: Record<string, number> = {
      opening: 0,
      closed: 0,
      reject: 0,
    };

    noiList.forEach((item) => {
      const status = (item.status || 'Open').toLowerCase();
      if (status === 'open') {
        statusCounts.opening++;
      } else if (status === 'closed') {
        statusCounts.closed++;
      } else if (status === 'reject') {
        statusCounts.reject = (statusCounts.reject || 0) + 1;
      }
    });

    const total = noiList.length;
    const openRate = total > 0 ? Math.round((statusCounts.opening / total) * 100) : 0;

    return {
      ...statusCounts,
      opening: statusCounts.opening,
      closed: statusCounts.closed,
      reject: statusCounts.reject || 0,
      total,
      openRate,
    };
  }, [noiList]);
};
