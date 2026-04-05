import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Edit2, Eye, Trash2 } from "lucide-react";

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
    sourceModule?: string;
    sourceReferenceNo?: string;
    isExternal?: boolean;
}

export const createColumns = (
    handleEdit: (id: string) => void,
    handleViewDetails: (id: string) => void,
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

                const getModulePath = (module?: string) => {
                    switch (module?.toUpperCase()) {
                        case 'NCR': return '/ncr';
                        case 'OBS': return '/obs';
                        case 'NOI': return '/noi';
                        case 'ITR': return '/itr';
                        case 'ITP': return '/itp';
                        case 'PQP': return '/pqp';
                        default: return null;
                    }
                };

                const modulePath = getModulePath(issue.sourceModule);

                if (issue.isExternal && issue.sourceModule) {
                    return (
                        <span
                            className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            onClick={() => modulePath && navigate(modulePath)}
                            style={{ cursor: modulePath ? 'pointer' : 'default' }}
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
                const getModulePath = (module?: string) => {
                    switch (module?.toUpperCase()) {
                        case 'NCR': return '/ncr';
                        case 'OBS': return '/obs';
                        case 'NOI': return '/noi';
                        case 'ITR': return '/itr';
                        case 'ITP': return '/itp';
                        case 'PQP': return '/pqp';
                        default: return null;
                    }
                };
                const modulePath = getModulePath(issue.sourceModule);

                if (issue.isExternal && modulePath) {
                    return (
                        <span
                            onClick={() => navigate(modulePath)}
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
                const getModulePath = (module?: string) => {
                    switch (module?.toUpperCase()) {
                        case 'NCR': return '/ncr';
                        case 'OBS': return '/obs';
                        case 'NOI': return '/noi';
                        case 'ITR': return '/itr';
                        case 'ITP': return '/itp';
                        case 'PQP': return '/pqp';
                        default: return null;
                    }
                };
                const modulePath = getModulePath(issue.sourceModule);

                if (issue.isExternal && modulePath) {
                    return (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(modulePath)}
                            title={t('followup.tooltip.goToModule', { module: issue.sourceModule })}
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                    );
                }

                return (
                    <div className="flex justify-center space-x-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(issue.id)}
                            title={t('common.edit')}
                            className="text-blue-500 hover:text-blue-700"
                        >
                            <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(issue.id)}
                            title={t('common.details')}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(issue.id)}
                            title={t('common.delete')}
                            className="text-red-500 hover:text-red-700"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
