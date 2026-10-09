import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { fetchAllWorkflows, fetchWorkflowStats } from '../services/workflowService';
import { getErrorMessage } from '../utils/errorUtils';
import type { WorkflowStats, WorkflowSummary } from '../types/workflow';

interface WorkflowData {
    projectId?: string;
    stats: WorkflowStats | null;
    workflows: WorkflowSummary[];
    loading: boolean;
    error: string | null;
}

export function useWorkflowData() {
    const projectId = useProjectStore(s => s.currentProject?.id);
    const [attempt, setAttempt] = useState(0);
    const [data, setData] = useState<WorkflowData>({
        projectId, stats: null, workflows: [], loading: true, error: null,
    });
    useEffect(() => {
        let cancelled = false;
        setData({ projectId, stats: null, workflows: [], loading: true, error: null });
        async function load() {
            try {
                const [stats, workflows] = await Promise.all([
                    fetchWorkflowStats(projectId), fetchAllWorkflows(projectId),
                ]);
                if (!cancelled) setData({ projectId, stats, workflows, loading: false, error: null });
            } catch (err) {
                if (!cancelled) setData({ projectId, stats: null, workflows: [], loading: false, error: getErrorMessage(err) });
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [projectId, attempt]);
    // Hide old-scope values immediately, before the new effect starts.
    const visible = data.projectId === projectId ? data : {
        projectId, stats: null, workflows: [], loading: true, error: null,
    };
    return { ...visible, retry: () => setAttempt(n => n + 1) };
}
