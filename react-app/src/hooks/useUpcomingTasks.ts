import { useMemo } from 'react';
import { useNCRStore } from '../store/ncrStore';
import { useFollowUpStore } from '../store/followUpStore';

export const useUpcomingTasks = (selectedVendor: string) => {
  const ncrList = useNCRStore(state => state.ncrList);
  const followUpList = useFollowUpStore(state => state.followUpList);

  const upcomingTasks = useMemo(() => {
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const normalizeDateOnly = (value?: string): string => {
      if (!value) return '';
      return value.slice(0, 10).replace(/\//g, '-');
    };

    const normalizeStatus = (status?: string): string => (status || '').trim().toLowerCase();

    const today = new Date();
    const next7Days = new Date();
    next7Days.setDate(today.getDate() + 7);

    const todayStr = formatLocalDate(today);
    const next7DaysStr = formatLocalDate(next7Days);

    const matchesVendor = (vendor?: string) =>
      selectedVendor === 'all' || vendor === selectedVendor;

    const upcomingNcrs = ncrList
      .filter(n =>
        normalizeStatus(n.status) !== 'closed' &&
        normalizeDateOnly(n.dueDate) >= todayStr &&
        normalizeDateOnly(n.dueDate) <= next7DaysStr &&
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
        normalizeStatus(f.status) !== 'closed' &&
        normalizeDateOnly(f.dueDate) >= todayStr &&
        normalizeDateOnly(f.dueDate) <= next7DaysStr &&
        matchesVendor(f.vendor)
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
