// API client for Q-WorkFlow endpoints. Uses the shared `api` axios
// instance so auth token refresh / interceptors apply automatically.
// See backend/routers/workflow.py for the endpoint contract.

import api from './api';
import type { WorkflowStats, WorkflowSummary } from '../types/workflow';

export async function fetchWorkflowStats(): Promise<WorkflowStats> {
    const { data } = await api.get<WorkflowStats>('/workflow/stats');
    return data;
}

export async function fetchNeedsAttention(limit = 3): Promise<WorkflowSummary[]> {
    const { data } = await api.get<WorkflowSummary[]>('/workflow/needs-attention', {
        params: { limit },
    });
    return data ?? [];
}

export interface ListWorkflowsParams {
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
