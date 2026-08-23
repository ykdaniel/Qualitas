import { ColumnDef } from "@tanstack/react-table";
import { OSDItem } from "../../store/osdStore";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export const createColumns = (
    confirmDelete: (id: string) => void,
    t: (key: string) => string,
    getActiveContractors: () => { name: string }[]
): ColumnDef<OSDItem>[] => [
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
                <DataTableColumnHeader column={column} title={t('osd.refNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("documentNumber")}</div>,
            size: 180,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('osd.status')}
                    filterOptions={[
                        { label: 'Open', value: 'Open' },
                        { label: 'Resolved', value: 'Resolved' },
                        { label: 'Closed', value: 'Closed' },
                        { label: 'Void', value: 'Void' },
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
                    title={t('osd.contractor')}
                    filterOptions={getActiveContractors().map(c => ({ label: c.name, value: c.name }))}
                />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("vendor")}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "deliveryNoteNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('osd.deliveryNoteNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("deliveryNoteNo") || '-'}</div>,
        },
        {
            accessorKey: "itemDescription",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('osd.itemDescription')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("itemDescription") || '-'}</div>,
        },
        {
            accessorKey: "expectedQty",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('osd.expectedQty')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("expectedQty") || '-'}</div>,
        },
        {
            accessorKey: "receivedQty",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('osd.receivedQty')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("receivedQty") || '-'}</div>,
        },
        {
            accessorKey: "raiseDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('osd.raiseDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("raiseDate") || '-'}</div>,
        },
        {
            accessorKey: "disposition",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('osd.disposition')} />
            ),
            cell: ({ row }) => {
                const val = row.getValue("disposition") as string;
                const isFlag = val === 'Reject' || val === 'ReturnToSupplier';
                return (
                    <div className={`text-center ${isFlag ? 'bg-pink-100 text-pink-800 font-medium px-2 py-1 rounded' : ''}`}>
                        {val || '-'}
                    </div>
                );
            },
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const osd = row.original;
                return (
                    <div className="flex items-center justify-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={(e) => { e.stopPropagation(); confirmDelete(osd.id); }}
                            title={t('common.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
