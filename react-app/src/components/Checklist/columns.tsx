import { ColumnDef } from "@tanstack/react-table";
import { ChecklistRecord } from "../../store/checklistStore";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import styles from "./Checklist.module.css";

export const createColumns = (
    onEdit: (record: ChecklistRecord) => void,
    onDelete: (id: string) => void,
    t: (key: string) => string
): ColumnDef<ChecklistRecord>[] => [
        {
            id: "index",
            header: "#",
            cell: ({ row }) => <span className="font-mono text-slate-500">{row.index + 1}</span>,
            size: 50,
        },
        {
            accessorKey: "recordsNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.referenceNo')} />
            ),
            cell: ({ row }) => <span className="font-mono text-xs text-slate-900">{row.original.recordsNo}</span>
        },
        {
            accessorKey: "activity",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.activity')} />
            ),
            cell: ({ row }) => <span className="font-medium">{row.original.activity}</span>
        },
        {
            accessorKey: "packageName",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.package')} />
            ),
        },
        {
            accessorKey: "date",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.date')} />
            ),
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.version')} />
            ),
            cell: ({ row }) => {
                const rev = row.original.revision ?? 0;
                return (
                    <div className="text-center font-bold text-slate-600 uppercase tracking-wider">
                        Rev. {rev}
                    </div>
                );
            }
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => (
                <div className="flex items-center justify-center space-x-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-100"
                        onClick={() => onEdit(row.original)}
                        title="Edit"
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                        onClick={() => onDelete(row.original.id)}
                        title="Delete"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )
        }
    ];
