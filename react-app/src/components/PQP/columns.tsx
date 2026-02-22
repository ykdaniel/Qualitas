import { ColumnDef } from "@tanstack/react-table";
import { PQPItem } from "../../store/pqpStore";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import styles from "./PQP.module.css";

const getLocalizedStatus = (status: string, t: (key: string) => string) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return t('pqp.status.approved');
    if (s === 'reject') return t('pqp.status.reject');
    if (s === 'not submit') return t('pqp.status.notSubmit');
    if (s === 'under review') return t('pqp.status.underReview');
    return status;
};

export const createColumns = (
    handleEdit: (id: string) => void,
    confirmDelete: (id: string) => void,
    t: (key: string) => string,
    getActiveContractors: () => { name: string }[]
): ColumnDef<PQPItem>[] => [
        {
            id: "index",
            header: "#",
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableColumnFilter: false,
            size: 50,
        },
        {
            accessorKey: "pqpNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('pqp.referenceNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("pqpNo")}</div>,
            size: 180,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('common.status')}
                    filterOptions={[
                        { label: t('pqp.status.notSubmit'), value: 'Not Submit' },
                        { label: t('pqp.status.underReview'), value: 'Under Review' },
                        { label: t('pqp.status.approved'), value: 'Approved' },
                        { label: t('pqp.status.reject'), value: 'Reject' },
                    ]}
                />
            ),
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                const s = (status || '').toLowerCase();
                let badgeClass = '';

                if (s === 'approved') badgeClass = styles.statusApproved;
                else if (s === 'reject') badgeClass = styles.statusReject;
                else if (s === 'under review') badgeClass = styles.statusUnderReview;
                else if (s === 'not submit') badgeClass = styles.statusNotSubmit;

                return (
                    <div className="text-center">
                        <span className={`${styles.statusBadge} ${badgeClass}`}>
                            {getLocalizedStatus(status, t)}
                        </span>
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
                    title={t('pqp.contractor')}
                    filterOptions={getActiveContractors().map(c => ({ label: c.name, value: c.name }))}
                />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("vendor")}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "title",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('pqp.subject')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("title")}</div>,
        },
        {
            accessorKey: "version",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('pqp.version')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("version")}</div>,
        },
        {
            accessorKey: "updatedAt",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('pqp.updatedDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("updatedAt")}</div>,
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const pqp = row.original;
                return (
                    <div className="flex items-center justify-center space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-100"
                            onClick={() => handleEdit(pqp.id)}
                            title={t('pqp.tooltip.edit')}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={() => confirmDelete(pqp.id)}
                            title={t('pqp.tooltip.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
