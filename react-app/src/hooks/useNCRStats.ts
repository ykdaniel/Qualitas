import { useMemo } from 'react';
import type { NCRItem } from '../store/ncrStore';
import { isClosedStatus, isVoidStatus, isOutstandingStatus } from '../utils/statusBuckets';

type StatusLike = Pick<NCRItem, 'status'>;

/** Pure computation, extracted so it can be unit-tested without React (mirrors
 * useDashboardModuleStatus.ts's deriveModuleStatus pattern). */
export const computeNCRStats = (ncrList: StatusLike[]) => {
  // open/inProgress/resolved stay literal-match (BACKLOG #24): they drive
  // 3 separate tabs that must keep showing exactly those 3 literal states.
  const statusCounts = {
    open: 0,
    inProgress: 0,
    resolved: 0,
  };

  ncrList.forEach((item) => {
    const status = (item.status || '').toLowerCase();
    if (status === 'open') {
      statusCounts.open++;
    } else if (status === 'in progress') {
      statusCounts.inProgress++;
    } else if (status === 'resolved') {
      statusCounts.resolved++;
    }
  });

  const total = ncrList.length;
  // closed/void/opening (BACKLOG #24.4, 2026-10-06): now the SAME shared
  // definition the Dashboard already uses (utils/statusBuckets.ts), instead
  // of this hook's own literal-match-only logic — the card's "opening"
  // number used to be open+inProgress+resolved by literal match only, which
  // silently dropped any non-standard status from every bucket (it counted
  // toward `total` but neither opening nor closed nor void), so the card
  // and the sum of the tabs it's supposed to summarize could disagree.
  // isOutstandingStatus() is "not Closed and not Void" — any status value,
  // standard or not, lands somewhere.
  const closed = ncrList.filter(item => isClosedStatus(item.status)).length;
  const voidCount = ncrList.filter(item => isVoidStatus(item.status)).length;
  const opening = ncrList.filter(item => isOutstandingStatus(item.status)).length;
  const openRate = total > 0 ? Math.round((opening / total) * 100) : 0;

  return {
    ...statusCounts,
    closed,
    void: voidCount,
    opening,
    total,
    openRate,
  };
};

export const useNCRStats = (ncrList: NCRItem[]) => {
  return useMemo(() => computeNCRStats(ncrList), [ncrList]);
};
