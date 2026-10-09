import { useMemo } from 'react';
import type { ITRItem } from '../store/itrStore';
import { addSevenWorkingDays } from '../utils/dateUtils';
import { formatDateISO } from '../utils/formatters';

/** Check whether an ITR item is overdue (due date in the past and not in a terminal status). */
export const isITROverdue = (item: ITRItem): boolean => {
  const status = (item.status || '').toLowerCase();
  if (status === 'approved' || status === 'void') return false;
  const dueDate = item.dueDate || (item.raiseDate ? addSevenWorkingDays(formatDateISO(item.raiseDate)) : null);
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
};

export const useITRStats = (itrList: ITRItem[]) => {
  return useMemo(() => {
    let approved = 0;
    let reject = 0;
    let inProgress = 0;
    let voidCount = 0;
    let overdue = 0;

    itrList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      if (status === 'approved') approved++;
      else if (status === 'reject' || status === 'rejected') reject++;
      else if (status === 'in progress') inProgress++;
      else if (status === 'void') voidCount++;

      if (isITROverdue(item)) overdue++;
    });

    const total = itrList.length;
    const approvedRate = total > 0 ? Math.round((approved / total) * 100) : 0;

    return {
      total,
      approved,
      reject,
      inProgress,
      void: voidCount,
      overdue,
      approvedRate,
    };
  }, [itrList]);
};
