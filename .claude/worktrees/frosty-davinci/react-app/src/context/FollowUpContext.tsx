import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';

export interface FollowUpIssueItem {
    id: string;
    issueNo: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assignedTo: string;
    vendor?: string;
    dueDate: string;
    createdAt: string;
    updatedAt: string;
    action?: string;
    sourceModule?: string;  // 來源模組：NCR, OBS, NOI, ITR 等
    sourceReferenceNo?: string;  // 來源單號
}

interface FollowUpContextType {
    followUpList: FollowUpIssueItem[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    addFollowUp: (item: Partial<FollowUpIssueItem>) => Promise<FollowUpIssueItem>;
    updateFollowUp: (id: string, item: Partial<FollowUpIssueItem>) => Promise<void>;
    deleteFollowUp: (id: string) => Promise<void>;
}

const FollowUpContext = createContext<FollowUpContextType | undefined>(undefined);

export const FollowUpProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [followUpList, setFollowUpList] = useState<FollowUpIssueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { handleError } = useErrorHandler();

    const fetchFollowUps = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/followup/');
            setFollowUpList(response.data || []);
        } catch (err) {
            const msg = handleError(err, 'Failed to fetch Follow-up Issues');
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [handleError]);

    useEffect(() => {
        fetchFollowUps();
    }, [fetchFollowUps]);

    const addFollowUp = useCallback(async (item: Partial<FollowUpIssueItem>): Promise<FollowUpIssueItem> => {
        try {
            const response = await api.post('/followup/', item);
            const newItem = response.data;
            setFollowUpList(prev => [...prev, newItem]);
            return newItem;
        } catch (error) {
            handleError(error, 'Failed to add Follow-up Issue');
            throw error;
        }
    }, [handleError]);

    const updateFollowUp = useCallback(async (id: string, updates: Partial<FollowUpIssueItem>) => {
        try {
            const response = await api.put(`/followup/${id}`, updates);
            setFollowUpList(prev => prev.map(f => (f.id === id ? response.data : f)));
        } catch (error) {
            handleError(error, 'Failed to update Follow-up Issue');
            throw error;
        }
    }, [handleError]);

    const deleteFollowUp = useCallback(async (id: string) => {
        try {
            await api.delete(`/followup/${id}`);
            setFollowUpList(prev => prev.filter(f => f.id !== id));
        } catch (error) {
            handleError(error, 'Failed to delete Follow-up Issue');
            throw error;
        }
    }, [handleError]);

    const value = useMemo(
        () => ({ followUpList, loading, error, refetch: fetchFollowUps, addFollowUp, updateFollowUp, deleteFollowUp }),
        [followUpList, loading, error, fetchFollowUps, addFollowUp, updateFollowUp, deleteFollowUp]
    );

    return (
        <FollowUpContext.Provider value={value}>
            {children}
        </FollowUpContext.Provider>
    );
};

export const useFollowUp = () => {
    const context = useContext(FollowUpContext);
    if (context === undefined) {
        throw new Error('useFollowUp must be used within a FollowUpProvider');
    }
    return context;
};
