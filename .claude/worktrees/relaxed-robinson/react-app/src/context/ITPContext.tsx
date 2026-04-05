import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode, useEffect } from 'react';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { useErrorHandler } from '../hooks/useErrorHandler';

export interface ITPInspectionItem {
  id: string;
  itemNo: string;
  activity: string;
  referenceDoc: string;
  acceptanceCriteria: string;
  verifyingDocuments: string;
  checkpointContractor: string;
  checkpointMainCon: string;
  checkpointClient: string;
}

export interface ITPItem {
  id: string;
  vendor: string;
  referenceNo?: string | null;  // 由後端自動產生
  description: string;
  rev: string;
  submit: string;
  status: string;
  remark: string;
  submissionDate?: string;
  hasDetails?: boolean;
  detail_data?: ITPInspectionItem[];
  attachments?: string[];
  dueDate?: string;
}

function normalizeItem(item: unknown): ITPItem {
  const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;

  // Ensure detail_data is an array
  if (record.detail_data && typeof record.detail_data === 'string') {
    try {
      record.detail_data = JSON.parse(record.detail_data);
    } catch (e) {
      record.detail_data = [];
    }
  }

  return parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments']) as unknown as ITPItem;
}

import { FilterParams } from '../types/api';

interface ITPContextType {
  itpList: ITPItem[];
  loading: boolean;
  error: string | null;
  refetch: (params?: FilterParams) => Promise<void>;
  addITP: (itp: Omit<ITPItem, 'id'>) => Promise<ITPItem>;
  updateITP: (id: string, itp: Partial<ITPItem>) => Promise<void>;
  updateITPDetail: (id: string, detail: any) => Promise<void>;
  deleteITP: (id: string) => Promise<void>;
  getITPList: () => ITPItem[];
  getITPByVendor: (vendor: string) => ITPItem[];
}

const ITPContext = createContext<ITPContextType | undefined>(undefined);

export const ITPProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [itpList, setItpList] = useState<ITPItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { handleError } = useErrorHandler();

  const fetchITPs = useCallback(async (params?: FilterParams) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/itp/', { params });
      const data = response.data;
      setItpList(data?.map(normalizeItem) || []);
    } catch (err) {
      const msg = handleError(err, 'Failed to fetch ITPs');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    fetchITPs();
  }, [fetchITPs]);

  const addITP = useCallback(async (itp: Omit<ITPItem, 'id'>): Promise<ITPItem> => {
    try {
      const payload = {
        vendor: itp.vendor,
        description: itp.description ?? '',
        rev: itp.rev ?? '',
        submit: itp.submit ?? '',
        status: itp.status ?? 'Pending',
        remark: itp.remark ?? '',
        submissionDate: itp.submissionDate ?? null,
        hasDetails: itp.hasDetails ?? false,
        detail_data: itp.detail_data ?? [],
      };
      const response = await api.post('/itp/', payload);
      const newITP = response.data;
      setItpList(prev => [...prev, newITP]);
      return newITP;
    } catch (error) {
      handleError(error, 'Failed to add ITP');
      throw error;
    }
  }, [handleError]);

  const updateITP = useCallback(async (id: string, updates: Partial<ITPItem>) => {
    try {
      const currentItem = itpList.find(i => i.id === id);
      if (!currentItem) return;

      const mergedItem = { ...currentItem, ...updates };

      const response = await api.put(`/itp/${id}`, mergedItem);
      setItpList(prev => prev.map(i => (i.id === id ? response.data : i)));
    } catch (error) {
      handleError(error, 'Failed to update ITP');
      throw error;
    }
  }, [itpList, handleError]);

  const updateITPDetail = useCallback(async (id: string, detail: any) => {
    try {
      const response = await api.put(`/itp/${id}/detail`, detail);
      setItpList(prev => prev.map(i => (i.id === id ? normalizeItem(response.data) : i)));
    } catch (error) {
      handleError(error, 'Failed to update ITP details');
      throw error;
    }
  }, [handleError]);

  const deleteITP = useCallback(async (id: string) => {
    try {
      await api.delete(`/itp/${id}`);
      setItpList(prev => prev.filter(i => i.id !== id));
    } catch (error) {
      handleError(error, 'Failed to delete ITP');
      throw error;
    }
  }, [handleError]);

  const getITPList = () => {
    return itpList;
  };

  const getITPByVendor = (vendor: string) => {
    return itpList.filter(itp => itp.vendor === vendor && itp.status.toLowerCase() !== 'void');
  };

  const value = useMemo(
    () => ({ itpList, loading, error, refetch: fetchITPs, addITP, updateITP, updateITPDetail, deleteITP, getITPList, getITPByVendor }),
    [itpList, loading, error, fetchITPs, addITP, updateITP, updateITPDetail, deleteITP, getITPList, getITPByVendor]
  );

  return (
    <ITPContext.Provider value={value}>
      {children}
    </ITPContext.Provider>
  );
};

export const useITP = () => {
  const context = useContext(ITPContext);
  if (context === undefined) {
    throw new Error('useITP must be used within an ITPProvider');
  }
  return context;
};
