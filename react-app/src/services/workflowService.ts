// API client for Q-WorkFlow endpoints. Uses the shared `api` axios
// instance so auth token refresh / interceptors apply automatically.
// See backend/routers/workflow.py for the endpoint contract.

import api from './api';
import type { WorkflowStats, WorkflowSummary } from '../types/workflow';

export async function fetchWorkflowStats(project_id?: string): Promise<WorkflowStats> {
    const { data } = await api.get<WorkflowStats>('/workflow/stats', { params: { project_id } });
    return data;
}

export async function fetchNeedsAttention(limit = 3, project_id?: string): Promise<WorkflowSummary[]> {
    const { data } = await api.get<WorkflowSummary[]>('/workflow/needs-attention', {
        params: { limit, project_id },
    });
    return data ?? [];
}

export interface ListWorkflowsParams {
    project_id?: string;
    skip?: number;
    limit?: number;
    // Inclusive percentage bounds on the derived completion_percent.
    min_completion?: number;
    max_completion?: number;
    vendor_id?: string;
}

export async function fetchWorkflows(
    params: ListWorkflowsParams = {},
): Promise<WorkflowSummary[]> {
    const { data } = await api.get<WorkflowSummary[]>('/workflow/', { params });
    return data ?? [];
}

// Retrieve every page: summary cards count all workflows, not just the first 200.
export async function fetchAllWorkflows(project_id?: string): Promise<WorkflowSummary[]> {
    const rows: WorkflowSummary[] = [];
    const limit = 200;
    for (;;) {
        const page = await fetchWorkflows({ project_id, skip: rows.length, limit });
        rows.push(...page);
        if (page.length < limit) return rows;
    }
}
