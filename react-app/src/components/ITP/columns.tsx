import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
import { ITPItem } from "../../store/itpStore";
import { Edit, Trash2, Link, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const getLocalizedStatus = (status: string, t: (key: string) => string) => {
    const s = status.toLowerCase();
    if (s === 'approved') return t('itp.status.approved');
    if (s === 'approved with comments') return t('itp.status.approvedWithComments');
    if (s === 'revise & resubmit' || s === 'revise and resubmit') return t('itp.status.reviseResubmit');
    if (s === 'rejected') return t('itp.status.rejected');
    if (s === 'pending') return t('itp.status.pending');
    if (s === 'no submit' || s === 'nosubmit') return t('itp.status.noSubmit');
    if (s === 'void') return t('itp.status.void');
    return status;
};

export const createColumns = (
    handleEdit: (id: string) => void,
    handleDelete: (id: string) => void,
    navigate: (path: string) => void,
    t: (key: string) => string,
    activeContractors: { name: string }[],
    noiList: any[] // We need noiList to check for related NOIs count
): ColumnDef<ITPItem>[] => [
        {
            id: "index",
            header: "#",
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableHiding: false,
            size: 50,
        },
        {
            accessorKey: "referenceNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itp.referenceNo')} />
            ),
            cell: ({ row }) => {
                const isVoid = row.getValue('status')?.toString().toLowerCase() === 'void';
                return (
                    <div className={cn("text-center", isVoid && "line-through text-gray-400")}>
                        {row.getValue("referenceNo") || '-'}
                    </div>
                );
            },
            size: 180,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('itp.status')}
                    filterOptions={[
                        { label: t('itp.status.approved'), value: 'Approved' },
                        { label: t('itp.status.approvedWithComments'), value: 'Approved with comments' },
                        { label: t('itp.status.reviseResubmit'), value: 'Revise & Resubmit' },
                        { label: t('itp.status.rejected'), value: 'Rejected' },
                        { label: t('itp.status.pending'), value: 'Pending' },
                        { label: t('itp.status.noSubmit'), value: 'No submit' },
                        { label: t('itp.status.void'), value: 'Void' },
                    ]}
                />
            ),
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                const isVoid = status.toLowerCase() === 'void';
                return (
                    <div className={cn("text-center", isVoid && "line-through text-gray-400")}>
                        {getLocalizedStatus(status, t)}
                    </div>
                );
            },
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "vendor",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('itp.vendor')}
                    filterOptions={activeContractors.map(c => ({ label: c.name, value: c.name }))}
                />
            ),
            cell: ({ row }) => {
                const isVoid = row.getValue('status')?.toString().toLowerCase() === 'void';
                return (
                    <div className={cn("text-center", isVoid && "line-through text-gray-400")}>
                        {row.getValue("vendor")}
                    </div>
                );
            },
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "description",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itp.description')} />
            ),
            cell: ({ row }) => {
                const isVoid = row.getValue('status')?.toString().toLowerCase() === 'void';
                return (
                    <div className={cn("text-left", isVoid && "line-through text-gray-400")}>
                        {row.getValue("description")}
                    </div>
                );
            },
        },
        {
            accessorKey: "rev",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itp.rev')} />
            ),
            cell: ({ row }) => {
                const isVoid = row.getValue('status')?.toString().toLowerCase() === 'void';
                return (
                    <div className={cn("text-center", isVoid && "line-through text-gray-400")}>
                        {row.getValue("rev")}
                    </div>
                );
            },
            size: 80,
        },
        {
            accessorKey: "submissionDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itp.submissionDate')} />
            ),
            cell: ({ row }) => {
                const isVoid = row.getValue('status')?.toString().toLowerCase() === 'void';
                return (
                    <div className={cn("text-center", isVoid && "line-through text-gray-400")}>
                        {row.getValue("submissionDate") || '-'}
                    </div>
                );
            },
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const itp = row.original;
                const relatedNoiCount = noiList.filter(noi => noi.itpNo === itp.referenceNo).length;

                return (
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-emerald-500 hover:text-white hover:bg-emerald-500"
                            onClick={() => handleEdit(itp.id)}
                            title={t('itp.tooltip.edit')}
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-auto px-2 py-1 text-xs gap-1",
                                relatedNoiCount > 0
                                    ? "text-blue-500 hover:text-white hover:bg-blue-500"
                                    : "text-gray-400 bg-gray-100 cursor-not-allowed hover:bg-gray-100 hover:text-gray-400"
                            )}
                            onClick={() => relatedNoiCount > 0 && navigate('/noi')}
                            disabled={relatedNoiCount === 0}
                            title={relatedNoiCount > 0 ? t('itp.tooltip.viewRelatedNOI').replace('{count}', relatedNoiCount.toString()) : t('itp.tooltip.noRelatedNOI')}
                        >
                            <Link className="h-3 w-3" />
                            {relatedNoiCount}
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-white hover:bg-red-500"
                            onClick={() => handleDelete(itp.id)}
                            title={t('itp.tooltip.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
            enableSorting: false,
            enableHiding: false,
            size: 200, // Make it wider for the group of buttons
        },
    ];
