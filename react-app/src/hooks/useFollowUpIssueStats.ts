import { useMemo } from 'react';

export const useFollowUpIssueStats = (issues: any[]) => {
  return useMemo(() => {
    const statusCounts = {
      opening: 0,
      closed: 0,
    };

    issues.forEach((item) => {
      const status = (item.status || 'Open').toLowerCase();
      if (status === 'open') {
        statusCounts.opening++;
      } else if (status === 'closed') {
        statusCounts.closed++;
      }
    });

    const total = issues.length;
    const openRate = total > 0 ? Math.round((statusCounts.opening / total) * 100) : 0;
    const closedRate = total > 0 ? Math.round((statusCounts.closed / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      openRate,
      closedRate,
    };
  }, [issues]);
};
