import { ColumnDef } from "@tanstack/react-table";
import { OBSItem } from "../../context/OBSContext";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Trash2 } from "lucide-react";

export const createColumns = (
    handleEdit: (id: string) => void,
    handleViewDetails: (id: string) => void,
    confirmDelete: (id: string) => void,
    t: (key: string) => string,
    getActiveContractors: () => { name: string }[]
): ColumnDef<OBSItem>[] => [
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
                <DataTableColumnHeader column={column} title={t('obs.refNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("documentNumber")}</div>,
            size: 180,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('obs.status')}
                    filterOptions={[
                        { label: 'Open', value: 'Open' },
                        { label: 'Closed', value: 'Closed' },
                    ]}
                />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("status")}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "vendor",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('obs.contractor')}
                    filterOptions={getActiveContractors().map(c => ({ label: c.name, value: c.name }))}
                />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("vendor")}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "type",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('obs.type')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("type") || '-'}</div>,
        },
        {
            accessorKey: "subject",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('obs.subject')} />
            ),
            cell: ({ row }) => {
                const subject = row.getValue("subject") as string;
                const description = row.original.description;
                return <div className="text-center">{subject || description || '-'}</div>;
            },
        },
        {
            accessorKey: "raiseDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('obs.raiseDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("raiseDate") || '-'}</div>,
        },
        {
            accessorKey: "closeoutDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('obs.closeoutDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("closeoutDate") || '-'}</div>,
        },
        {
            accessorKey: "foundBy",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('obs.foundBy')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("foundBy") || '-'}</div>,
        },
        {
            accessorKey: "raisedBy",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('obs.raisedBy')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("raisedBy") || '-'}</div>,
        },
        {
            accessorKey: "productDisposition",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('obs.productDisposition')} />
            ),
            cell: ({ row }) => {
                const val = row.getValue("productDisposition") as string;
                const isPink = val === 'Use As Is';
                return (
                    <div className={`text-center ${isPink ? 'bg-pink-100 text-pink-800 font-medium px-2 py-1 rounded' : ''}`}>
                        {val || '-'}
                    </div>
                );
            },
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const obs = row.original;
                return (
                    <div className="flex items-center justify-center space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-100"
                            onClick={() => handleEdit(obs.id)}
                            title={t('common.edit')}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-100"
                            onClick={() => handleViewDetails(obs.id)}
                            title={t('common.details')}
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={() => confirmDelete(obs.id)}
                            title={t('common.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
