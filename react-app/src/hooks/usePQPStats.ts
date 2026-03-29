import { useMemo } from 'react';
import type { PQPItem } from '../store/pqpStore';

const normalizePQPStatus = (status?: string) => {
  const s = (status || '').trim().toLowerCase();
  if (s === 'rejected') return 'reject';
  if (s === 'not submitted') return 'not submit';
  return s;
};

export const usePQPStats = (pqpList: PQPItem[]) => {
  return useMemo(() => {
    const statusCounts = {
      approved: 0,
      reject: 0,
      underReview: 0,
      notSubmit: 0,
    };

    pqpList.forEach((item) => {
      const status = normalizePQPStatus(item.status || 'Approved');
      if (status === 'approved') {
        statusCounts.approved++;
      } else if (status === 'reject') {
        statusCounts.reject++;
      } else if (status === 'under review') {
        statusCounts.underReview++;
      } else if (status === 'not submit') {
        statusCounts.notSubmit++;
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
