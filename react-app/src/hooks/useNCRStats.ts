import { useMemo } from 'react';
import type { NCRItem } from '../store/ncrStore';

export const useNCRStats = (ncrList: NCRItem[]) => {
  return useMemo(() => {
    const statusCounts = {
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      void: 0,
    };

    ncrList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      if (status === 'open') {
        statusCounts.open++;
      } else if (status === 'in progress') {
        statusCounts.inProgress++;
      } else if (status === 'resolved') {
        statusCounts.resolved++;
      } else if (status === 'closed') {
        statusCounts.closed++;
      } else if (status === 'void') {
        statusCounts.void++;
      }
    });

    const total = ncrList.length;
    // "opening" = all non-closed/non-void (active issues)
    const opening = statusCounts.open + statusCounts.inProgress + statusCounts.resolved;
    const openRate = total > 0 ? Math.round((opening / total) * 100) : 0;

    return {
      ...statusCounts,
      opening,
      total,
      openRate,
    };
  }, [ncrList]);
};
