import { ColumnDef } from "@tanstack/react-table";
import { NOIItem } from "../../context/NOIContext";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { formatTime24h, getLocalizedStatus } from "../../utils/formatters";
import { Checkbox } from "@/components/ui/checkbox";
import styles from "./NOI.module.css";

export const createColumns = (
    handleEdit: (id: string) => void,
    handleViewDetails: (id: string) => void,
    handleDeleteClick: (id: string) => void,
    t: (key: string) => string
): ColumnDef<NOIItem>[] => [
        {
            id: "select",
            header: ({ table }) => (
                <div className="flex justify-center items-center">
                    <Checkbox
                        checked={(table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")) as boolean | "indeterminate"}
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="bg-white"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex justify-center items-center">
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                    />
                </div>
            ),
            enableSorting: false,
            enableColumnFilter: false,
            size: 50, // Setting size as well in case we enable it in DataTable later
        },
        {
            id: "index",
            header: () => <div className="text-center">#</div>,
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableColumnFilter: false,
            size: 50,
        },
        {
            accessorKey: "referenceNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.referenceNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("referenceNo")}</div>,
            size: 180,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('common.status')}
                    filterOptions={[
                        { label: t('noi.status.open'), value: 'Open' },
                        { label: t('noi.status.closed'), value: 'Closed' },
                        { label: t('noi.status.reject'), value: 'Reject' },
                    ]}
                />
            ),
            cell: ({ row }) => (
                <div className="text-center">
                    {getLocalizedStatus(row.getValue("status"), t)}
                </div>
            ),
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "contractor",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.contractor')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("contractor")}</div>,
        },
        {
            accessorKey: "package",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('noi.package')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("package")}</div>,
        },
        {
            accessorKey: "itpNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('noi.itpNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("itpNo")}</div>,
        },
        {
            accessorKey: "ncrNumber",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itr.ncrNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("ncrNumber") || '-'}</div>,
        },
        {
            accessorKey: "issueDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('noi.issueDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("issueDate")}</div>,
        },
        {
            accessorKey: "inspectionDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('noi.inspectionDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("inspectionDate")}</div>,
        },
        {
            accessorKey: "inspectionTime",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('noi.inspectionTime')} />
            ),
            cell: ({ row }) => <div className="text-center">{formatTime24h(row.getValue("inspectionTime"))}</div>,
        },
        {
            accessorKey: "eventNumber",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('noi.eventNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("eventNumber") || '-'}</div>,
        },
        {
            accessorKey: "checkpoint",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('noi.checkpoint')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("checkpoint") || '-'}</div>,
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const noi = row.original;
                return (
                    <div className="flex items-center justify-center space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-100"
                            onClick={() => handleEdit(noi.id)}
                            title={t('noi.tooltip.edit')}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-100"
                            onClick={() => handleViewDetails(noi.id)}
                            title={t('noi.tooltip.details')}
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={() => handleDeleteClick(noi.id)}
                            title={t('noi.tooltip.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
