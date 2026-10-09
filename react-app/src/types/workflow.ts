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
    // For the 5 NCR-derived checkpoints: id of the first NCR whose own
    // predicate fails, i.e. the specific record actually blocking this
    // checkpoint. Null when not NCR-derived, or already satisfied.
    blocking_ncr_id: string | null;
    // Improvement checkpoint only (0 / empty on the others): what its verdict rests on.
    //   blocking_reason  why the first blocking NCR blocks
    //   verified_count   NCRs with a valid improvement photo NOW
    //   unverified_*     NCRs that pass ONLY because they are Closed — their photos are NOT verified — and why
    blocking_reason?: PhotoReason | null;
    verified_count?: number;
    unverified_count?: number;
    unverified_ncr_ids?: string[];
    unverified_reasons?: Partial<Record<PhotoReason, number>>;
}

// Why an NCR's improvement photo could not be verified (the underlying reason is kept even for a Closed NCR that passes on its status).
export type PhotoReason = 'missing' | 'invalid' | 'legacy_unverified';

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
    // NCRs of this flow passing the improvement checkpoint WITHOUT a verified photo (Closed status only). 100% never means "all verified".
    unverified_photo_count?: number;
    unverified_photo_reasons?: Partial<Record<PhotoReason, number>>;
    ncr_ids: string[];
    itr_ids: string[];
    reinsp_itr_ids: string[];
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
