import { useMemo } from 'react';
import type { FATItem } from '../store/fatStore';

export const useFATStats = (fatList: FATItem[]) => {
  return useMemo(() => {
    const total = fatList.length;
    const withDetails = fatList.filter(item => item.hasDetails).length;
    const detailsRate = total > 0 ? Math.round((withDetails / total) * 100) : 0;

    return {
      total,
      withDetails,
      detailsRate,
    };
  }, [fatList]);
};
