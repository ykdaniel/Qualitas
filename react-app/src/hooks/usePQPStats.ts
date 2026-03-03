import { useMemo } from 'react';
import type { PQPItem } from '../store/pqpStore';

export const usePQPStats = (pqpList: PQPItem[]) => {
  return useMemo(() => {
    const statusCounts = {
      approved: 0,
      reject: 0,
    };

    pqpList.forEach((item) => {
      const status = (item.status || 'Approved').toLowerCase();
      if (status === 'approved') {
        statusCounts.approved++;
      } else if (status === 'reject') {
        statusCounts.reject++;
      }
    });

    const total = pqpList.length;
    const activeRate = total > 0 ? Math.round((statusCounts.approved / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      activeRate,
    };
  }, [pqpList]);
};
