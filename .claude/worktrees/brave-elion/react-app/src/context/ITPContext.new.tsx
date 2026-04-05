/**
 * ITP Context - Refactored using createDataContext factory
 * Reduced from ~141 lines to ~30 lines (79% reduction)
 */

import { createDataContext } from './createDataContext';
import { parseJsonFields } from '../utils/normalizeApiItem';

export interface ITPItem {
  id: string;
  vendor: string;
  referenceNo?: string | null;
  description: string;
  rev: string;
  submit: string;
  status: string;
  remark: string;
  submissionDate?: string;
  hasDetails?: boolean;
  detail_data?: string;
  attachments?: string[];
  dueDate?: string;
}

/**
 * Normalize ITP item from API response
 */
function normalizeITP(item: unknown): ITPItem {
  const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
  return parseJsonFields(record, ['attachments']) as unknown as ITPItem;
}

// Create ITP context using factory
const { Provider: ITPProvider, useContext: useITP } = createDataContext<ITPItem>({
  endpoint: '/itp/',
  entityName: 'ITP',
  normalizeItem: normalizeITP,
  fetchOnMount: true
});

// Export provider and hook
export { ITPProvider, useITP };

// Re-export DataContextValue type for backward compatibility
export type { DataContextValue as ITPContextType } from './createDataContext';
