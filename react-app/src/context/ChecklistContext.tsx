import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import * as api from '../services/api';
import { FilterParams } from '../types/api';
import { useAuth } from './AuthContext';

export interface ChecklistRecord {
    id: string;
    itpIndex: number;
    recordsNo: string;
    activity: string;
    date: string;
    status: 'Pass' | 'Fail' | 'Ongoing';
    packageName: string;
    contractor?: string;
    itpId?: string;
    itpVersion?: string;
    passCount?: number;
    failCount?: number;
    itrId?: string;
    itrNumber?: string;
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
                contractor: r.contractor || '',
                itpId: r.itpId,
                itpVersion: r.itpVersion,
                passCount: r.passCount,
                failCount: r.failCount,
                itrId: r.itrId,
                itrNumber: r.itrNumber,
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

    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (isAuthenticated) {
            fetchRecords();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]);

    const addRecord = useCallback(async (record: Omit<ChecklistRecord, 'id' | 'recordsNo'>) => {
        try {
            await api.createChecklist({
                recordsNo: "[AUTO-GENERATE]",
                activity: record.activity,
                date: record.date,
                status: record.status,
                packageName: record.packageName,
                contractor: record.contractor,
                itpId: record.itpId,
                itpVersion: record.itpVersion,
                passCount: record.passCount,
                failCount: record.failCount,
                itrId: record.itrId,
                itrNumber: record.itrNumber,
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
            if (updates.activity !== undefined) payload.activity = updates.activity;
            if (updates.date !== undefined) payload.date = updates.date;
            if (updates.status !== undefined) payload.status = updates.status;
            if (updates.packageName !== undefined) payload.packageName = updates.packageName;
            if (updates.contractor !== undefined) payload.contractor = updates.contractor;
            if (updates.itpId !== undefined) payload.itpId = updates.itpId;
            if (updates.itpVersion !== undefined) payload.itpVersion = updates.itpVersion;
            if (updates.passCount !== undefined) payload.passCount = updates.passCount;
            if (updates.failCount !== undefined) payload.failCount = updates.failCount;
            if (updates.itrId !== undefined) payload.itrId = updates.itrId;
            if (updates.itrNumber !== undefined) payload.itrNumber = updates.itrNumber;
            if (updates.location !== undefined) payload.location = updates.location;
            if (updates.itpIndex !== undefined) payload.itpIndex = updates.itpIndex;
            if (updates.data !== undefined) payload.detail_data = JSON.stringify(updates.data);

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
