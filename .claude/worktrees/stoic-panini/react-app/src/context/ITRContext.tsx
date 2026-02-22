import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { useErrorHandler } from '../hooks/useErrorHandler';

export interface ITRItem {
  id: string;
  vendor: string;
  documentNumber: string;
  description: string;
  rev: string;
  submit: string;
  status: string;
  remark: string;
  hasDetails?: boolean;
  raiseDate?: string;
  closeoutDate?: string;
  aconex?: string;
  type?: string;
  subject?: string;
  ncrNumber?: string;  // 若檢驗失敗，連結到產生的 NCR
  raisedBy?: string;
  foundLocation?: string;
  noiNumber?: string;  // 連結到產生此 ITR 的 NOI（取代舊的 itpNo）
  eventNumber?: string;
  checkpoint?: string;
  defectPhotos?: string[];
  improvementPhotos?: string[];
  attachments?: string[];
}

function normalizeItem(item: unknown): ITRItem {
  const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
  return parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments']) as unknown as ITRItem;
}

import { FilterParams } from '../types/api';

interface ITRContextType {
  itrList: ITRItem[];
  loading: boolean;
  error: string | null;
  refetch: (params?: FilterParams) => Promise<void>;
  addITR: (itr: Omit<ITRItem, 'id'>) => Promise<ITRItem>;
  updateITR: (id: string, itr: Partial<ITRItem>) => Promise<void>;
  deleteITR: (id: string) => Promise<void>;
  getITRList: () => ITRItem[];
  getITRByNOI: (noiNumber: string) => ITRItem[];
  getITRByNCR: (ncrNumber: string) => ITRItem[];
}

const ITRContext = createContext<ITRContextType | undefined>(undefined);

export const ITRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [itrList, setItrList] = useState<ITRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { handleError } = useErrorHandler();

  const fetchITRs = useCallback(async (params?: FilterParams) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/itr/', { params });
      setItrList((response.data || []).map(normalizeItem));
    } catch (err) {
      const msg = handleError(err, 'Failed to fetch ITRs');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    fetchITRs();
  }, [fetchITRs]);

  const addITR = useCallback(async (itr: Omit<ITRItem, 'id'>): Promise<ITRItem> => {
    try {
      const response = await api.post('/itr/', itr);
      const newITR = normalizeItem(response.data);
      setItrList(prev => [...prev, newITR]);
      return newITR;
    } catch (error) {
      handleError(error, 'Failed to add ITR');
      throw error;
    }
  }, [handleError]);

  const updateITR = useCallback(async (id: string, updates: Partial<ITRItem>) => {
    try {
      const response = await api.put(`/itr/${id}`, updates);
      const updated = normalizeItem(response.data);
      setItrList(prev => prev.map(i => (i.id === id ? updated : i)));
    } catch (error) {
      handleError(error, 'Failed to update ITR');
      throw error;
    }
  }, [handleError]);

  const deleteITR = useCallback(async (id: string) => {
    try {
      await api.delete(`/itr/${id}`);
      setItrList(prev => prev.filter(i => i.id !== id));
    } catch (error) {
      handleError(error, 'Failed to delete ITR');
      throw error;
    }
  }, [handleError]);

  const getITRList = () => itrList;

  const getITRByNOI = (noiNumber: string) => {
    return itrList.filter(itr => itr.noiNumber === noiNumber);
  };

  const getITRByNCR = (ncrNumber: string) => {
    return itrList.filter(itr => itr.ncrNumber === ncrNumber);
  };

  const value = useMemo(
    () => ({ itrList, loading, error, refetch: fetchITRs, addITR, updateITR, deleteITR, getITRList, getITRByNOI, getITRByNCR }),
    [itrList, loading, error, fetchITRs, addITR, updateITR, deleteITR]
  );

  return (
    <ITRContext.Provider value={value}>
      {children}
    </ITRContext.Provider>
  );
};

export const useITR = () => {
  const context = useContext(ITRContext);
  if (context === undefined) {
    throw new Error('useITR must be used within an ITRProvider');
  }
  return context;
};
