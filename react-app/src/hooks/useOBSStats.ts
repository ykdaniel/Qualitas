import { useMemo } from 'react';
import type { OBSItem as ContextOBSItem } from '../store/obsStore';

export const useOBSStats = (obsList: ContextOBSItem[]) => {
  return useMemo(() => {
    const statusCounts = {
      opening: 0,
      closed: 0,
    };

    obsList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      if (status === 'closed') {
        statusCounts.closed++;
      } else if (status && status !== 'void') {
        statusCounts.opening++;
      }
    });

    const total = obsList.length;
    const openRate = total > 0 ? Math.round((statusCounts.opening / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      openRate,
    };
  }, [obsList]);
};
