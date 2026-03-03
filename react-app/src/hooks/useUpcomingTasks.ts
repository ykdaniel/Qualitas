import { useMemo } from 'react';
import { useNCRStore } from '../store/ncrStore';
import { useFollowUpStore } from '../store/followUpStore';

export const useUpcomingTasks = (selectedVendor: string) => {
  const ncrList = useNCRStore(state => state.ncrList);
  const followUpList = useFollowUpStore(state => state.followUpList);

  const upcomingTasks = useMemo(() => {
    const today = new Date();
    const next7Days = new Date();
    next7Days.setDate(today.getDate() + 7);

    const todayStr = today.toISOString().split('T')[0];
    const next7DaysStr = next7Days.toISOString().split('T')[0];

    const matchesVendor = (vendor?: string) =>
      selectedVendor === 'all' || vendor === selectedVendor;

    const upcomingNcrs = ncrList
      .filter(n =>
        n.status.toLowerCase() !== 'closed' &&
        n.dueDate && n.dueDate >= todayStr && n.dueDate <= next7DaysStr &&
        matchesVendor(n.vendor)
      )
      .map(n => ({
        id: n.id,
        type: 'NCR',
        title: n.documentNumber,
        dueDate: n.dueDate!,
        vendor: n.vendor,
        link: '/ncr'
      }));

    const upcomingFollowUps = followUpList
      .filter(f =>
        f.status.toLowerCase() !== 'closed' &&
        f.dueDate && f.dueDate >= todayStr && f.dueDate <= next7DaysStr &&
        matchesVendor(f.vendor || f.assignedTo)
      )
      .map(f => ({
        id: f.id,
        type: 'Follow-up',
        title: f.title || f.issueNo,
        dueDate: f.dueDate,
        vendor: f.vendor || f.assignedTo,
        link: '/followup'
      }));

    return [...upcomingNcrs, ...upcomingFollowUps].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [ncrList, followUpList, selectedVendor]);

  return upcomingTasks;
};
