// Q-WorkFlow types — matches backend schemas.WorkflowSummary /
// WorkflowStats / CheckpointState for the Q-WorkFlow-rooted tracker
// (Phase 1 PR1b v4). A "workflow" here is one NOI scored against 9
// canonical checkpoints, each in one of three states:
// done / current / pending. See backend/services/workflow_service.py.

export type CheckpointKey =
    | 'noi'
    | 'wh_inspection'
    | 'ncr'
    | 'moc'
    | 'improvement'
    | 'reinspection'
    | 'itr'
    | 'close_ncr'
    | 'accepted';

// Canonical left-to-right order in the tracker — must stay in sync
// with CHECKPOINT_ORDER in backend/services/workflow_service.py.
export const CHECKPOINT_ORDER: CheckpointKey[] = [
    'noi',
    'wh_inspection',
    'ncr',
    'moc',
    'improvement',
    'reinspection',
    'itr',
    'close_ncr',
    'accepted',
];

export const TOTAL_CHECKPOINTS = CHECKPOINT_ORDER.length;

export type CheckpointState = 'done' | 'current' | 'pending';

export interface Checkpoint {
    key: CheckpointKey;
    state: CheckpointState;
    done: boolean;
}

export interface WorkflowSummary {
    qworkflow_id: string;
    reference_no: string | null;  // Q-WorkFlow-000001
    noi_id: string | null;
    noi_reference_no: string | null;
    noi_package: string | null;
    issue_date: string | null;
    vendor_name: string | null;
    checkpoints: Checkpoint[];
    done_count: number;
    completion_percent: number;
    ncr_ids: string[];
    itr_ids: string[];
}

// Completion-bucket distribution powering the Dashboard card.
export interface WorkflowStats {
    total: number;
    bucket_0_25: number;
    bucket_26_50: number;
    bucket_51_75: number;
    bucket_76_100: number;
}

export type CompletionBucket =
    | 'bucket_0_25'
    | 'bucket_26_50'
    | 'bucket_51_75'
    | 'bucket_76_100';

export const COMPLETION_BUCKETS: {
    key: CompletionBucket;
    min: number;
    max: number;
}[] = [
    { key: 'bucket_0_25', min: 0, max: 25 },
    { key: 'bucket_26_50', min: 26, max: 50 },
    { key: 'bucket_51_75', min: 51, max: 75 },
    { key: 'bucket_76_100', min: 76, max: 100 },
];
