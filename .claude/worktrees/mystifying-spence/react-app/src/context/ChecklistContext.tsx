import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import * as api from '../services/api';
import { FilterParams } from '../types/api';

export interface ChecklistRecord {
    id: string;
    itpIndex: number;
    recordsNo: string;
    activity: string;
    date: string;
    status: 'Pass' | 'Fail' | 'Ongoing';
    packageName: string;
    location: string;
    revision: number;
    noiNumber?: string;
    data: any;
}

interface ChecklistContextType {
    records: ChecklistRecord[];
    loading: boolean;
    addRecord: (record: Omit<ChecklistRecord, 'id' | 'recordsNo'>) => Promise<void>;
    updateRecord: (id: string, updates: Partial<ChecklistRecord>) => Promise<void>;
    deleteRecord: (id: string) => Promise<void>;
    refreshRecords: (params?: FilterParams) => Promise<void>;
}

const ChecklistContext = createContext<ChecklistContextType | undefined>(undefined);

export const ChecklistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [records, setRecords] = useState<ChecklistRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRecords = useCallback(async (params?: FilterParams) => {
        setLoading(true);
        try {
            const data = await api.getChecklists(params);
            setRecords(data.map(r => ({
                id: r.id,
                itpIndex: r.itpIndex,
                recordsNo: r.recordsNo,
                activity: r.activity,
                date: r.date,
                status: r.status as any,
                packageName: r.packageName,
                location: r.location || '',
                revision: r.detail_data ? (JSON.parse(r.detail_data).revision || 0) : 0,
                noiNumber: (r as any).noiNumber,
                data: r.detail_data ? JSON.parse(r.detail_data) : {}
            })));
        } catch (e) {
            console.error('Failed to fetch checklist records', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    const addRecord = useCallback(async (record: Omit<ChecklistRecord, 'id' | 'recordsNo'>) => {
        try {
            await api.createChecklist({
                recordsNo: "[AUTO-GENERATE]",
                activity: record.activity,
                date: record.date,
                status: record.status,
                packageName: record.packageName,
                location: record.location,
                itpIndex: record.itpIndex,
                detail_data: JSON.stringify(record.data)
            });
            await fetchRecords();
        } catch (e) {
            console.error('Failed to add checklist record', e);
            throw e;
        }
    }, [fetchRecords]);

    const updateRecord = useCallback(async (id: string, updates: Partial<ChecklistRecord>) => {
        try {
            const payload: any = {};
            if (updates.activity) payload.activity = updates.activity;
            if (updates.date) payload.date = updates.date;
            if (updates.status) payload.status = updates.status;
            if (updates.packageName) payload.packageName = updates.packageName;
            if (updates.location) payload.location = updates.location;
            if (updates.itpIndex !== undefined) payload.itpIndex = updates.itpIndex;
            if (updates.data) payload.detail_data = JSON.stringify(updates.data);

            await api.updateChecklist(id, payload);
            await fetchRecords();
        } catch (e) {
            console.error('Failed to update checklist record', e);
            throw e;
        }
    }, [fetchRecords]);

    const deleteRecord = useCallback(async (id: string) => {
        try {
            await api.deleteChecklist(id);
            await fetchRecords();
        } catch (e) {
            console.error('Failed to delete checklist record', e);
            throw e;
        }
    }, [fetchRecords]);

    return (
        <ChecklistContext.Provider value={{ records, loading, addRecord, updateRecord, deleteRecord, refreshRecords: fetchRecords }}>
            {children}
        </ChecklistContext.Provider>
    );
};

export const useChecklist = () => {
    const context = useContext(ChecklistContext);
    if (!context) throw new Error('useChecklist must be used within ChecklistProvider');
    return context;
};
