import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { useErrorHandler } from '../hooks/useErrorHandler';

export interface OBSItem {
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
  attachments?: string[];
}

function normalizeItem(item: unknown): OBSItem {
  const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
  return parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments']) as unknown as OBSItem;
}

import { FilterParams } from '../types/api';

interface OBSContextType {
  obsList: OBSItem[];
  loading: boolean;
  error: string | null;
  refetch: (params?: FilterParams) => Promise<void>;
  addOBS: (obs: Omit<OBSItem, 'id'>) => Promise<OBSItem>;
  updateOBS: (id: string, obs: Partial<OBSItem>) => Promise<void>;
  deleteOBS: (id: string) => Promise<void>;
  getOBSList: () => OBSItem[];
  getOBSByVendor: (vendor: string) => OBSItem[];
}

const OBSContext = createContext<OBSContextType | undefined>(undefined);

export const OBSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [obsList, setObsList] = useState<OBSItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { handleError } = useErrorHandler();

  const fetchOBSs = useCallback(async (params?: FilterParams) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/obs/', { params });
      setObsList((response.data || []).map(normalizeItem));
    } catch (err) {
      const msg = handleError(err, 'Failed to fetch OBSs');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    fetchOBSs();
  }, [fetchOBSs]);

  const addOBS = useCallback(async (obs: Omit<OBSItem, 'id'>): Promise<OBSItem> => {
    try {
      const response = await api.post('/obs/', obs);
      const newOBS = normalizeItem(response.data);
      setObsList(prev => [...prev, newOBS]);
      return newOBS;
    } catch (error) {
      handleError(error, 'Failed to add OBS');
      throw error;
    }
  }, [handleError]);

  const updateOBS = useCallback(async (id: string, updates: Partial<OBSItem>) => {
    try {
      const response = await api.put(`/obs/${id}`, updates);
      const updated = normalizeItem(response.data);
      setObsList(prev => prev.map(o => (o.id === id ? updated : o)));
    } catch (error) {
      handleError(error, 'Failed to update OBS');
      throw error;
    }
  }, [handleError]);

  const deleteOBS = useCallback(async (id: string) => {
    try {
      await api.delete(`/obs/${id}`);
      setObsList(prev => prev.filter(o => o.id !== id));
    } catch (error) {
      handleError(error, 'Failed to delete OBS');
      throw error;
    }
  }, [handleError]);

  const getOBSList = () => obsList;
  const getOBSByVendor = (vendor: string) => obsList.filter(obs => obs.vendor === vendor);

  const value = useMemo(
    () => ({ obsList, loading, error, refetch: fetchOBSs, addOBS, updateOBS, deleteOBS, getOBSList, getOBSByVendor }),
    [obsList, loading, error, fetchOBSs]
  );

  return (
    <OBSContext.Provider value={value}>
      {children}
    </OBSContext.Provider>
  );
};

export const useOBS = () => {
  const context = useContext(OBSContext);
  if (context === undefined) {
    throw new Error('useOBS must be used within an OBSProvider');
  }
  return context;
};
