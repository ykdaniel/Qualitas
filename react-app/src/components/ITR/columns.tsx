import { ColumnDef } from "@tanstack/react-table";
import { ITRItem } from "../../store/itrStore";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, FileText, AlertTriangle } from "lucide-react";
import { getLocalizedStatus } from "../../utils/formatters";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";

export const createColumns = (
    handleEdit: (id: string) => void,
    handleDeleteClick: (id: string) => void,
    navigate: (path: string) => void,
    t: (key: string) => string
): ColumnDef<ITRItem>[] => [
        {
            id: "select",
            header: ({ table }) => (
                <div className="flex justify-center items-center w-full">
                    <Checkbox
                        checked={(table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")) as boolean | "indeterminate"}
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="bg-white"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex justify-center items-center w-full">
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                    />
                </div>
            ),
            enableSorting: false,
            enableColumnFilter: false,
            size: 50,
        },
        {
            id: "index",
            header: "#",
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableColumnFilter: false,
            size: 50,
        },
        {
            accessorKey: "documentNumber",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.referenceNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("documentNumber")}</div>,
            size: 180,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('common.status')}
                    filterOptions={[
                        { label: t('itr.status.approved'), value: 'Approved' },
                        { label: t('itr.status.reject'), value: 'Reject' },
                        { label: t('itr.status.inProgress'), value: 'In Progress' },
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
            accessorKey: "vendor",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.contractor')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("vendor")}</div>,
        },
        {
            accessorKey: "subject",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('noi.package')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("subject") || row.original.description || '-'}</div>,
        },
        {
            accessorKey: "noiNumber",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itr.noiNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("noiNumber") || '-'}</div>,
        },
        {
            accessorKey: "raiseDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itr.inspectionDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("raiseDate") || '-'}</div>,
        },
        {
            accessorKey: "dueDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.dueDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("dueDate") || '-'}</div>,
        },
        {
            accessorKey: "ncrNumber",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itr.ncrNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("ncrNumber") || '-'}</div>,
        },
        {
            accessorKey: "closeoutDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('itr.closeoutDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("closeoutDate") || '-'}</div>,
        },
        {
            accessorKey: "type",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.version')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("type") || '-'}</div>,
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const itr = row.original;
                return (
                    <div className="flex items-center justify-center space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-100"
                            onClick={() => handleEdit(itr.id)}
                            title={t('itr.tooltip.edit')}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>

                        {itr.noiNumber && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 hover:text-gray-600 hover:bg-gray-100"
                                onClick={() => navigate('/noi')}
                                title={t('itr.tooltip.viewRelatedNOI')}
                            >
                                <FileText className="h-4 w-4" />
                            </Button>
                        )}
                        {itr.ncrNumber && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => navigate('/ncr')}
                                title={t('itr.tooltip.viewRelatedNCR')}
                            >
                                <AlertTriangle className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={() => handleDeleteClick(itr.id)}
                            title={t('itr.tooltip.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
