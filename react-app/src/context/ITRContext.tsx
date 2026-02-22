import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useAuth } from './AuthContext';

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
  itpNo?: string;  // Related ITP Reference Number
  drawings?: string[]; // Latest Drawings
  certificates?: string[]; // Calibration Certificates
  linkedChecklists?: any[]; // Snapshot of linked checklists
  detail_data?: any; // Raw detail data from backend
}

function normalizeItem(item: unknown): ITRItem {
  const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
  const parsedRecord = parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments', 'drawings', 'certificates', 'detail_data']) as Record<string, unknown>;

  // Extract linkedChecklists from detail_data if exists
  if (parsedRecord.detail_data && typeof parsedRecord.detail_data === 'object') {
    const detailData = parsedRecord.detail_data as Record<string, any>;
    if (Array.isArray(detailData.linkedChecklists)) {
      parsedRecord.linkedChecklists = detailData.linkedChecklists;
    }
  }
  // console.log("normalizeItem", { id: parsedRecord.id, linked: parsedRecord.linkedChecklists, detail: parsedRecord.detail_data });

  return parsedRecord as unknown as ITRItem;
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

  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      fetchITRs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const addITR = useCallback(async (itr: Omit<ITRItem, 'id'>): Promise<ITRItem> => {
    try {
      // Pack linkedChecklists into detail_data
      const payload = { ...itr } as any;

      let detailData: any = {};
      if (payload.detail_data) {
        try {
          detailData = typeof payload.detail_data === 'string'
            ? JSON.parse(payload.detail_data)
            : payload.detail_data;
        } catch (e) {
          console.error("Failed to parse payload.detail_data in addITR", e);
        }
      }

      if (payload.linkedChecklists) {
        detailData.linkedChecklists = payload.linkedChecklists;
        delete payload.linkedChecklists;
      }

      // Always stringify detail_data for backend
      payload.detail_data = JSON.stringify(detailData);

      const response = await api.post('/itr/', payload);
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
      // Pack linkedChecklists into detail_data
      const payload = { ...updates } as any;

      // Determine if we need to merge detail_data
      if (payload.linkedChecklists || payload.detail_data) {
        // Find existing item to merge detail_data
        const existingItem = itrList.find(i => i.id === id);
        let existingDetail = {};

        // 1. Get existing detail data
        if (existingItem?.detail_data) {
          try {
            existingDetail = typeof existingItem.detail_data === 'string'
              ? JSON.parse(existingItem.detail_data)
              : existingItem.detail_data;
          } catch (e) {
            console.error("Failed to parse existing detail_data", e);
          }
        }

        // 2. Get new detail data from payload if present
        let newDetail = {};
        if (payload.detail_data) {
          try {
            newDetail = typeof payload.detail_data === 'string'
              ? JSON.parse(payload.detail_data)
              : payload.detail_data;
          } catch (e) {
            console.error("Failed to parse payload detail_data", e);
          }
        }

        // 3. Merge: Existing -> New Updates -> Linked Checklists
        const mergedDetail: any = {
          ...existingDetail,
          ...newDetail,
        };

        if (payload.linkedChecklists) {
          mergedDetail.linkedChecklists = payload.linkedChecklists;
        }

        payload.detail_data = JSON.stringify(mergedDetail);
        delete payload.linkedChecklists;
      }

      const response = await api.put(`/itr/${id}/`, payload);
      const updated = normalizeItem(response.data);
      setItrList(prev => prev.map(i => (i.id === id ? updated : i)));
    } catch (error) {
      handleError(error, 'Failed to update ITR');
      throw error;
    }
  }, [handleError]);

  const deleteITR = useCallback(async (id: string) => {
    try {
      await api.delete(`/itr/${id}/`);
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
