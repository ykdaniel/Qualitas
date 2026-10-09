import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Eye, Trash2 } from "lucide-react";

export interface FollowUpIssueItem {
    id: string;
    issueNo: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assignedTo: string;
    assignedToUserId?: number | null;
    vendor?: string;
    dueDate: string;
    createdAt: string;
    updatedAt: string;
    action?: string;
    sourceModule?: string;
    sourceReferenceNo?: string;
    isExternal?: boolean;
}

const getModulePath = (module?: string): string | null => {
    switch (module?.toUpperCase()) {
        case 'NCR': return '/ncr';
        case 'OBS': return '/obs';
        case 'NOI': return '/noi';
        case 'ITR': return '/itr';
        case 'ITP': return '/itp';
        case 'PQP': return '/pqp';
        case 'MEETING': return '/meeting-minutes';
        default: return null;
    }
};

/** Real FollowUp rows created by Meeting Minutes (or any future module
 *  that tags sourceModule/sourceReferenceNo on a genuine DB row, not just
 *  the synthetic cross-module aggregation) are just as click-through-able
 *  as the virtual `isExternal` rows — both cases carry a real source to
 *  deep-link to. */
const isLinkable = (issue: FollowUpIssueItem): boolean =>
    !!(issue.isExternal || (issue.sourceModule && issue.sourceReferenceNo));

/** Deep-link straight to the specific record instead of just the module's
 *  list page. Every module page here (NCR/OBS/NOI/ITR/ITP/PQP) supports
 *  `?openId=` (see their own useEffect deep-link handlers). NCR/NOI/OBS/
 *  ITP/PQP accept either the real id or the human-readable reference
 *  number, so `sourceReferenceNo` (all this module ever stores) works
 *  directly. ITR's handler only matches by real id, so it's recovered
 *  from this row's own synthetic id — built elsewhere as
 *  `itr-${itr.id}` — by stripping the module prefix. */
const getDeepLinkPath = (issue: FollowUpIssueItem): string | null => {
    const modulePath = getModulePath(issue.sourceModule);
    if (!modulePath) return null;

    switch (issue.sourceModule?.toUpperCase()) {
        case 'NCR':
        case 'OBS':
        case 'NOI':
        case 'ITP':
        case 'PQP':
            return issue.sourceReferenceNo
                ? `${modulePath}?openId=${encodeURIComponent(issue.sourceReferenceNo)}`
                : modulePath;
        case 'ITR': {
            const realId = issue.id.startsWith('itr-') ? issue.id.slice(4) : null;
            return realId ? `${modulePath}?openId=${encodeURIComponent(realId)}` : modulePath;
        }
        default:
            return modulePath;
    }
};

export const createColumns = (
    handleDeleteClick: (id: string) => void,
    navigate: (path: string) => void,
    t: (key: string, params?: Record<string, string | number>) => string
): ColumnDef<FollowUpIssueItem>[] => [
        {
            id: "index",
            header: "#",
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableColumnFilter: false,
            size: 50,
        },
        {
            accessorKey: "sourceModule",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('followup.source')}
                    filterOptions={[
                        { label: 'Follow-up', value: 'Follow-up' },
                        { label: 'NCR', value: 'NCR' },
                        { label: 'OBS', value: 'OBS' },
                        { label: 'NOI', value: 'NOI' },
                        { label: 'ITR', value: 'ITR' },
                        { label: 'ITP', value: 'ITP' },
                        { label: 'PQP', value: 'PQP' },
                    ]}
                />
            ),
            cell: ({ row }) => {
                const issue = row.original;
                const deepLinkPath = getDeepLinkPath(issue);

                if (isLinkable(issue) && issue.sourceModule) {
                    return (
                        <span
                            className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            onClick={() => deepLinkPath && navigate(deepLinkPath)}
                            style={{ cursor: deepLinkPath ? 'pointer' : 'default' }}
                            title={t('followup.tooltip.goToModule', { module: issue.sourceModule })}
                        >
                            {issue.sourceModule}
                        </span>
                    );
                }
                return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Follow-up</span>;
            },
            filterFn: (row, id, value) => {
                if (!value) return true;
                const rowValue = row.getValue(id) as string;
                // 如果是手動建立的 issue，sourceModule 可能是 undefined 或 string
                // 我們假設 undefined/null 或 'Follow-up' (大小寫可能不同) 對應 'Follow-up' 選項
                if ((!rowValue || rowValue.toLowerCase() === 'follow-up') && value === 'Follow-up') return true;
                return rowValue === value;
            }
        },
        {
            accessorKey: "issueNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('followup.issueNo')} />
            ),
            cell: ({ row }) => {
                const issue = row.original;
                const deepLinkPath = getDeepLinkPath(issue);

                if (isLinkable(issue) && deepLinkPath) {
                    return (
                        <span
                            onClick={() => navigate(deepLinkPath)}
                            className="cursor-pointer text-blue-500 hover:underline"
                        >
                            {issue.issueNo}
                        </span>
                    );
                }
                return issue.issueNo;
            },
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('followup.status')}
                    filterOptions={[
                        { label: 'Open', value: 'Open' },
                        { label: 'Closed', value: 'Closed' },
                    ]}
                />
            ),
            cell: ({ row }) => <div>{row.getValue("status")}</div>,
            filterFn: (row, id, value) => {
                return (row.getValue(id) as string) === value;
            },
        },
        {
            accessorKey: "description",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('followup.description')} />
            ),
            cell: ({ row }) => (
                <div className="max-w-[300px] truncate" title={row.getValue("description")}>
                    {row.getValue("description")}
                </div>
            ),
        },
        {
            accessorKey: "assignedTo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('followup.assignedTo')} />
            ),
            cell: ({ row }) => {
                const issue = row.original;
                return issue.assignedTo || issue.vendor || '-';
            },
            // Custom accessor for filtering/sorting to combine assignedTo and vendor
            accessorFn: (row) => row.assignedTo || row.vendor || '',
        },
        {
            accessorKey: "createdAt",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('followup.createdDate')} />
            ),
        },
        {
            accessorKey: "dueDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('followup.dueDate')} />
            ),
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const issue = row.original;
                const deepLinkPath = getDeepLinkPath(issue);

                if (issue.isExternal && deepLinkPath) {
                    // Synthetic aggregation row — no real FollowUp record to
                    // delete, only a source to jump to.
                    return (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(deepLinkPath)}
                            title={t('followup.tooltip.goToModule', { module: issue.sourceModule })}
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                    );
                }

                // Only Void FollowUps can be deleted (mirrors NCR/Audit) —
                // a Closed FollowUp especially is meant to stay a permanent
                // record, not something a stray click can erase.
                const canDelete = issue.status === 'Void';
                return (
                    <div className="flex justify-center gap-1">
                        {!issue.isExternal && deepLinkPath && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); navigate(deepLinkPath); }}
                                title={t('followup.tooltip.goToModule', { module: issue.sourceModule })}
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canDelete}
                            onClick={(e) => { e.stopPropagation(); canDelete && handleDeleteClick(issue.id); }}
                            title={canDelete ? t('common.delete') : (t('followup.deleteVoidOnlyHint') || 'Void this issue first, then delete')}
                            className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:hover:text-red-500"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
