import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { useErrorHandler } from '../hooks/useErrorHandler';

export interface NCRItem {
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
  foundBy?: string;
  raisedBy?: string;
  foundLocation?: string;
  productDisposition?: string;
  productIntegrityRelated?: string;
  permanentProductDeviation?: string;
  impactToOM?: string;
  defectPhotos?: string[];
  improvementPhotos?: string[];
  noiNumber?: string;
  dueDate?: string;
  attachments?: string[];
}

import { FilterParams } from '../types/api';

function normalizeItem(item: unknown): NCRItem {
  const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
  return parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments']) as unknown as NCRItem;
}

interface NCRContextType {
  ncrList: NCRItem[];
  loading: boolean;
  error: string | null;
  refetch: (params?: FilterParams) => Promise<void>;
  addNCR: (ncr: Omit<NCRItem, 'id'>) => Promise<NCRItem>;
  updateNCR: (id: string, ncr: Partial<NCRItem>) => Promise<void>;
  deleteNCR: (id: string) => Promise<void>;
  getNCRList: () => NCRItem[];
  getNCRByVendor: (vendor: string) => NCRItem[];
}

const NCRContext = createContext<NCRContextType | undefined>(undefined);

export const NCRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [ncrList, setNcrList] = useState<NCRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { handleError } = useErrorHandler();

  const fetchNCRs = React.useCallback(async (params?: FilterParams) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/ncr/', { params });
      setNcrList((response.data || []).map(normalizeItem));
    } catch (err) {
      const msg = handleError(err, 'Failed to fetch NCRs');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    fetchNCRs();
  }, [fetchNCRs]);

  const addNCR = useCallback(async (ncr: Omit<NCRItem, 'id'>): Promise<NCRItem> => {
    try {
      const response = await api.post('/ncr/', ncr);
      const newNCR = normalizeItem(response.data);
      setNcrList(prev => [...prev, newNCR]);
      return newNCR;
    } catch (error) {
      handleError(error, 'Failed to add NCR');
      throw error;
    }
  }, [handleError]);

  const updateNCR = useCallback(async (id: string, updates: Partial<NCRItem>) => {
    try {
      const response = await api.put(`/ncr/${id}`, updates);
      const updated = normalizeItem(response.data);
      setNcrList(prev => prev.map(n => (n.id === id ? updated : n)));
    } catch (error) {
      handleError(error, 'Failed to update NCR');
      throw error;
    }
  }, [handleError]);

  const deleteNCR = useCallback(async (id: string) => {
    try {
      await api.delete(`/ncr/${id}`);
      setNcrList(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      handleError(error, 'Failed to delete NCR');
      throw error;
    }
  }, [handleError]);

  const getNCRList = () => ncrList;
  const getNCRByVendor = (vendor: string) => ncrList.filter(ncr => ncr.vendor === vendor);

  const value = useMemo(
    () => ({ ncrList, loading, error, refetch: fetchNCRs, addNCR, updateNCR, deleteNCR, getNCRList, getNCRByVendor }),
    [ncrList, loading, error, fetchNCRs, addNCR, updateNCR, deleteNCR, getNCRList, getNCRByVendor]
  );

  return (
    <NCRContext.Provider value={value}>
      {children}
    </NCRContext.Provider>
  );
};

export const useNCR = () => {
  const context = useContext(NCRContext);
  if (context === undefined) {
    throw new Error('useNCR must be used within an NCRProvider');
  }
  return context;
};
