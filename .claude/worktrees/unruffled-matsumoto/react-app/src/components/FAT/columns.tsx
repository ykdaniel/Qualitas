import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
// FATItem interface needs to be imported or defined. 
// It is defined in FAT.tsx but not exported. I should probably export it or redefine it.
// To avoid circular dependency or editing FAT.tsx just for export before refactor, 
// I will define a matching interface here since I will eventually update FAT.tsx to use this.
import { FATItem } from "../../context/FATContext";

import { Edit, FileText, Trash2, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const createColumns = (
    handleEdit: (id: string) => void,
    handleViewDetails: (id: string) => void,
    handleAddDetails: (id: string) => void,
    handleDelete: (id: string) => void,
    t: (key: string) => string,
    activeContractors: { name: string }[]
): ColumnDef<FATItem>[] => [
        {
            id: "index",
            header: "#",
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableHiding: false,
            size: 50,
        },
        {
            accessorKey: "equipment",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.equipment')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("equipment")}</div>,
        },
        {
            accessorKey: "supplier",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('fat.supplier')}
                    filterOptions={activeContractors.map(c => ({ label: c.name, value: c.name }))}
                />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("supplier")}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "procedure",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.procedure')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("procedure")}</div>,
        },
        {
            accessorKey: "location",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.location')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("location")}</div>,
        },
        {
            accessorKey: "startDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.startDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("startDate")}</div>,
        },
        {
            accessorKey: "endDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.endDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("endDate")}</div>,
        },
        {
            accessorKey: "deliveryFrom",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.deliveryFrom')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("deliveryFrom")}</div>,
        },
        {
            accessorKey: "deliveryTo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.deliveryTo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("deliveryTo")}</div>,
        },
        {
            accessorKey: "siteReadiness",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.siteReadiness')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("siteReadiness")}</div>,
        },
        {
            accessorKey: "moveInDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('fat.moveInDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("moveInDate")}</div>,
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const fat = row.original;
                return (
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-emerald-500 hover:text-white hover:bg-emerald-500"
                            onClick={() => handleEdit(fat.id)}
                            title={t('fat.tooltip.edit')}
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-purple-500 hover:text-white hover:bg-purple-500"
                            onClick={() => handleViewDetails(fat.id)}
                            title={t('fat.tooltip.details')}
                        >
                            <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-500 hover:text-white hover:bg-blue-500"
                            onClick={() => handleAddDetails(fat.id)}
                            title={t('fat.tooltip.addDetails')}
                        >
                            <PlusSquare className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-white hover:bg-red-500"
                            onClick={() => handleDelete(fat.id)}
                            title={t('fat.tooltip.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
            enableSorting: false,
            enableHiding: false,
            size: 150,
        },
    ];
