import { ColumnDef } from "@tanstack/react-table";
import { NCRItem } from "../../store/ncrStore";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

export const createColumns = (
    handleEdit: (id: string) => void,
    confirmDelete: (id: string) => void,
    t: (key: string) => string
): ColumnDef<NCRItem>[] => [
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
                <DataTableColumnHeader column={column} title={t('ncr.documentNumber')} />
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
                        { label: t('status.open'), value: 'Open' },
                        { label: t('status.closed'), value: 'Closed' },
                    ]}
                />
            ),
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                return <div className="text-center">{status.toLowerCase() === 'open' ? t('status.open') : t('status.closed')}</div>;
            },
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "vendor",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('obs.contractor')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("vendor")}</div>,
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
            accessorKey: "type",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('ncr.type')} />
            ),
            cell: ({ row }) => {
                const type = row.getValue("type") as string;
                return <div className="text-center">{type ? t(`ncr.type.${type.toLowerCase()}`) : '-'}</div>;
            },
        },
        {
            accessorKey: "raiseDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('ncr.raiseDate')} />
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
                        {val ? t(`ncr.disposition.${val.replace(/\s+/g, '').replace(/^./, str => str.toLowerCase())}`) : '-'}
                    </div>
                );
            },
        },
        {
            accessorKey: "productIntegrityRelated",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('ncr.refIntegrity')} />
            ),
            cell: ({ row }) => {
                const val = row.getValue("productIntegrityRelated") as string;
                const isPink = val === 'Yes';
                return (
                    <div className={`text-center ${isPink ? 'bg-pink-100 text-pink-800 font-medium px-2 py-1 rounded' : ''}`}>
                        {val ? (val === 'Yes' ? t('common.yes') : t('common.no')) : '-'}
                    </div>
                );
            },
        },
        {
            accessorKey: "permanentProductDeviation",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('ncr.refPermanentDeviation')} />
            ),
            cell: ({ row }) => {
                const val = row.getValue("permanentProductDeviation") as string;
                const isPink = val === 'Yes';
                return (
                    <div className={`text-center ${isPink ? 'bg-pink-100 text-pink-800 font-medium px-2 py-1 rounded' : ''}`}>
                        {val ? (val === 'Yes' ? t('common.yes') : t('common.no')) : '-'}
                    </div>
                );
            },
        },
        {
            accessorKey: "impactToOM",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('ncr.refImpactOM')} />
            ),
            cell: ({ row }) => {
                const val = row.getValue("impactToOM") as string;
                const isPink = val === 'Yes';
                return (
                    <div className={`text-center ${isPink ? 'bg-pink-100 text-pink-800 font-medium px-2 py-1 rounded' : ''}`}>
                        {val ? (val === 'Yes' ? t('common.yes') : t('common.no')) : '-'}
                    </div>
                );
            },
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const ncr = row.original;
                return (
                    <div className="flex items-center justify-center space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-100"
                            onClick={() => handleEdit(ncr.id)}
                            title={t('common.edit')}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={() => confirmDelete(ncr.id)}
                            title={t('common.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
