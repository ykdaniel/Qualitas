import { useMemo } from 'react';
import type { ChecklistRecord } from '../store/checklistStore';

export const useChecklistStats = (records: ChecklistRecord[]) => {
  return useMemo(() => {
    const total = records.length;
    const passed = records.filter(r => r.status === 'Pass').length;
    const ongoing = records.filter(r => r.status === 'Ongoing').length;
    const failed = records.filter(r => r.status === 'Fail').length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    return { 
      total, 
      passed, 
      ongoing, 
      failed, 
      passRate 
    };
  }, [records]);
};
