import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
import { AuditItem } from "../../store/auditStore";
import { Edit, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const createColumns = (
    handleEdit: (id: string) => void,
    handleDelete: (id: string) => void,
    handleReport: (id: string) => void,
    t: (key: string) => string,
    activeContractors: { name: string }[]
): ColumnDef<AuditItem>[] => [
        {
            id: "index",
            header: "#",
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableHiding: false,
            size: 50,
        },
        {
            accessorKey: "auditNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('audit.auditNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("auditNo")}</div>,
            size: 180,
        },
        {
            accessorKey: "title",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('audit.auditTitle')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("title")}</div>,
        },
        {
            accessorKey: "date",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('audit.date')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("date")}</div>,
        },
        {
            accessorKey: "contractor",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('common.contractor')}
                    filterOptions={activeContractors.map(c => ({ label: c.name, value: c.name }))}
                />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("contractor") || '-'}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "location",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('audit.location')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("location")}</div>,
        },
        {
            accessorKey: "auditor",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('audit.auditor')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("auditor")}</div>,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('common.status')}
                    filterOptions={[
                        { label: 'Planned', value: 'Planned' },
                        { label: 'In Progress', value: 'In Progress' },
                        { label: 'Completed', value: 'Completed' },
                        { label: 'Closed', value: 'Closed' },
                    ]}
                />
            ),
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                const isClosed = status === 'Closed';
                return (
                    <div className="flex justify-center">
                        <span
                            className={cn(
                                "px-2 py-1 rounded text-xs",
                                isClosed ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
                            )}
                        >
                            {status}
                        </span>
                    </div>
                );
            },
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-emerald-500 hover:text-white hover:bg-emerald-500"
                            onClick={() => handleEdit(item.id)}
                            title={t('common.edit')}
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-500 hover:text-white hover:bg-blue-500"
                            onClick={() => handleReport(item.id)}
                            title={t('audit.report')}
                        >
                            <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-white hover:bg-red-500"
                            onClick={() => handleDelete(item.id)}
                            title={t('common.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
            enableSorting: false,
            enableHiding: false,
            size: 100,
        },
    ];
