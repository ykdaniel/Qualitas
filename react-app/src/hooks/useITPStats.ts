import { useMemo } from 'react';
import type { ITPItem } from '../store/itpStore';

export const useITPStats = (itpList: ITPItem[]) => {
  return useMemo(() => {
    const statusCounts = {
      approved: 0,
      approvedWithComments: 0,
      reviseResubmit: 0,
      rejected: 0,
      pending: 0,
      noSubmit: 0,
      void: 0,
    };

    itpList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      if (status === 'void') {
        statusCounts.void++;
      } else if (status === 'approved') {
        statusCounts.approved++;
      } else if (status === 'approved with comments') {
        statusCounts.approvedWithComments++;
      } else if (status === 'revise & resubmit' || status === 'revise and resubmit') {
        statusCounts.reviseResubmit++;
      } else if (status === 'rejected') {
        statusCounts.rejected++;
      } else if (status === 'pending') {
        statusCounts.pending++;
      } else if (status === 'no submit' || status === 'nosubmit') {
        statusCounts.noSubmit++;
      }
    });

    const total = itpList.filter(item => (item.status || '').toLowerCase() !== 'void').length;
    const submission = itpList.filter(item => {
      const status = (item.status || '').toLowerCase();
      return status !== 'void' && status !== 'no submit' && status !== 'nosubmit';
    }).length;
    
    const submissionMaturity = total > 0 ? Math.round((submission / total) * 100) : 0;
    const approvalMaturity = total > 0 ? Math.round(((statusCounts.approved + statusCounts.approvedWithComments) / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      submission,
      submissionMaturity,
      approvalMaturity,
    };
  }, [itpList]);
};
