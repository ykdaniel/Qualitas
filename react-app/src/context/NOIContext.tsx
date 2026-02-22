import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useAuth } from './AuthContext';

export interface NOIItem {
  id: string;
  package: string;
  referenceNo: string;
  issueDate: string;
  inspectionTime: string;
  itpNo: string;  // 連結到 ITP referenceNo
  eventNumber?: string;
  checkpoint: string;
  inspectionDate: string;
  type: string;
  contractor: string;
  contacts?: string;
  phone?: string;
  email?: string;
  status: string;
  remark?: string;
  closeoutDate?: string;
  attachments?: string[];
  ncrNumber?: string;  // 若此 NOI 是針對 NCR 的重新檢驗
  dueDate?: string;
}

import { FilterParams } from '../types/api';

interface NOIContextType {
  noiList: NOIItem[];
  loading: boolean;
  error: string | null;
  refetch: (params?: FilterParams) => Promise<void>;
  addNOI: (noi: Omit<NOIItem, 'id'>, id?: string) => Promise<NOIItem>;
  addBulkNOI: (nois: Omit<NOIItem, 'id'>[]) => Promise<NOIItem[]>;
  updateNOI: (id: string, noi: Partial<NOIItem>) => Promise<void>;
  deleteNOI: (id: string) => Promise<void>;
  getNOIList: () => NOIItem[];
}

const NOIContext = createContext<NOIContextType | undefined>(undefined);

export const NOIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [noiList, setNoiList] = useState<NOIItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { handleError } = useErrorHandler();

  const fetchNOIs = React.useCallback(async (params?: FilterParams) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/noi/', { params });
      setNoiList(response.data || []);
    } catch (err) {
      const msg = handleError(err, 'Failed to fetch NOIs');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      fetchNOIs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const addNOI = async (noi: Omit<NOIItem, 'id'>, id?: string): Promise<NOIItem> => {
    try {
      const response = await api.post('/noi/', id ? { ...noi, id } : noi);
      const newNOI = response.data;
      setNoiList(prev => [...prev, newNOI]);
      return newNOI;
    } catch (error) {
      handleError(error, 'Failed to add NOI');
      throw error;
    }
  };

  const addBulkNOI = async (nois: Omit<NOIItem, 'id'>[]): Promise<NOIItem[]> => {
    try {
      const response = await api.post('/noi/bulk/', nois);
      const newNOIs = response.data;
      setNoiList(prev => [...prev, ...newNOIs]);
      return newNOIs;
    } catch (error) {
      handleError(error, 'Failed to add bulk NOI');
      throw error;
    }
  };

  const updateNOI = async (id: string, updates: Partial<NOIItem>) => {
    try {
      const response = await api.put(`/noi/${id}/`, updates);
      setNoiList(prev => prev.map(n => (n.id === id ? response.data : n)));
    } catch (error) {
      handleError(error, 'Failed to update NOI');
      throw error;
    }
  };

  const deleteNOI = async (id: string) => {
    try {
      await api.delete(`/noi/${id}/`);
      setNoiList(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      handleError(error, 'Failed to delete NOI');
      throw error;
    }
  };

  const getNOIList = () => noiList;

  const value = useMemo(
    () => ({ noiList, loading, error, refetch: fetchNOIs, addNOI, addBulkNOI, updateNOI, deleteNOI, getNOIList }),
    [noiList, loading, error, fetchNOIs, addNOI, addBulkNOI, updateNOI, deleteNOI, getNOIList]
  );

  return (
    <NOIContext.Provider value={value}>
      {children}
    </NOIContext.Provider>
  );
};

export const useNOI = () => {
  const context = useContext(NOIContext);
  if (context === undefined) {
    throw new Error('useNOI must be used within a NOIProvider');
  }
  return context;
};
