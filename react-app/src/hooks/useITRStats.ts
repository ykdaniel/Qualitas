import { useMemo } from 'react';
import type { ITRItem } from '../store/itrStore';

export const useITRStats = (itrList: ITRItem[]) => {
  return useMemo(() => {
    const total = itrList.length;
    const approved = itrList.filter(item => (item.status || '').toLowerCase() === 'approved').length;
    const reject = itrList.filter(item => (item.status || '').toLowerCase() === 'reject').length;
    const inProgress = itrList.filter(item => (item.status || '').toLowerCase() === 'in progress').length;
    
    return {
      total,
      approved,
      reject,
      inProgress,
      approvedRate: total > 0 ? Math.round((approved / total) * 100) : 0
    };
  }, [itrList]);
};
