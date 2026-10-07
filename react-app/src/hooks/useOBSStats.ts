import { useMemo } from 'react';
import type { OBSItem as ContextOBSItem } from '../store/obsStore';
import { isClosedStatus, isVoidStatus, isOutstandingStatus } from '../utils/statusBuckets';

type StatusLike = Pick<ContextOBSItem, 'status'>;

/** Pure computation, extracted so it can be unit-tested without React (mirrors
 * useDashboardModuleStatus.ts's deriveModuleStatus pattern). */
export const computeOBSStats = (obsList: StatusLike[]) => {
  // BACKLOG #24.4 (2026-10-06): now the same shared definition the Dashboard
  // already uses (utils/statusBuckets.ts) instead of this hook's own ad-hoc
  // logic, which also silently excluded a blank status from every bucket
  // (it only treated a truthy-but-non-closed/void status as "opening").
  const closed = obsList.filter(item => isClosedStatus(item.status)).length;
  const voidCount = obsList.filter(item => isVoidStatus(item.status)).length;
  const opening = obsList.filter(item => isOutstandingStatus(item.status)).length;

  const total = obsList.length;
  const openRate = total > 0 ? Math.round((opening / total) * 100) : 0;

  return {
    opening,
    closed,
    void: voidCount,
    total,
    openRate,
  };
};

export const useOBSStats = (obsList: ContextOBSItem[]) => {
  return useMemo(() => computeOBSStats(obsList), [obsList]);
};
