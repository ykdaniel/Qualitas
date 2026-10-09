import { useMemo } from 'react';
import type { OSDItem as ContextOSDItem } from '../store/osdStore';

export const useOSDStats = (osdList: ContextOSDItem[]) => {
  return useMemo(() => {
    const statusCounts = {
      opening: 0,
      closed: 0,
      void: 0,
    };

    osdList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      if (status === 'closed') {
        statusCounts.closed++;
      } else if (status === 'void') {
        statusCounts.void++;
      } else if (status) {
        statusCounts.opening++;
      }
    });

    const total = osdList.length;
    const openRate = total > 0 ? Math.round((statusCounts.opening / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      openRate,
    };
  }, [osdList]);
};
