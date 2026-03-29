import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
import { Contractor } from "../../store/contractorsStore";
import { Project } from "../../store/projectStore";
import { Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Contractor Columns ────────────────────────────────────────────────────────
export const createColumns = (
    handleEdit: (contractor: Contractor) => void,
    handleDelete: (id: string) => void,
    t: (key: string) => string
): ColumnDef<Contractor>[] => [
        {
            id: "serialNumber",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.serialNumber') || 'No.'} />
            ),
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: "package",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.package')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("package") || '-'}</div>,
        },
        {
            accessorKey: "abbreviation",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.abbreviation')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("abbreviation") || '-'}</div>,
        },
        {
            accessorKey: "name",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.name')} />
            ),
            cell: ({ row }) => <div className="text-center font-medium">{row.getValue("name")}</div>,
        },
        {
            accessorKey: "scope",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.scope')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("scope")}</div>,
        },
        {
            accessorKey: "contactPerson",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.contactPerson')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("contactPerson")}</div>,
        },
        {
            accessorKey: "email",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.email')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("email")}</div>,
        },
        {
            accessorKey: "phone",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.phone')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("phone")}</div>,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('contractors.status')}
                    filterOptions={[
                        { label: t('contractors.status.active') || 'Active', value: 'active' },
                        { label: t('contractors.status.inactive') || 'Inactive', value: 'inactive' },
                    ]}
                />
            ),
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                const isActive = status === 'active';
                return (
                    <div className="flex justify-center">
                        <span
                            className={cn(
                                "px-3 py-1 rounded-full text-xs font-medium",
                                isActive ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                            )}
                        >
                            {isActive ? (t('contractors.status.active') || 'Active') : (t('contractors.status.inactive') || 'Inactive')}
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
            header: t('contractors.operations'),
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-emerald-500 hover:text-white hover:bg-emerald-500"
                            onClick={() => handleEdit(item)}
                            title={t('common.edit')}
                        >
                            <Edit className="h-4 w-4" />
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

// ─── Project Columns ────────────────────────────────────────────────────────
export const createProjectColumns = (
    handleEdit: (project: Project) => void,
    handleDelete: (id: string) => void,
    t: (key: string) => string
): ColumnDef<Project>[] => [
        {
            id: "serialNumber",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('contractors.serialNumber') || 'No.'} />
            ),
            cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
            enableSorting: false,
            enableHiding: false,
            size: 60,
        },
        {
            accessorKey: "name",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Project Name" />
            ),
            cell: ({ row }) => <div className="text-center font-medium">{row.getValue("name")}</div>,
        },
        {
            accessorKey: "code",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Code" />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("code") || '-'}</div>,
        },
        {
            accessorKey: "owner",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Owner" />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("owner") || '-'}</div>,
        },
        {
            accessorKey: "description",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Description" />
            ),
            cell: ({ row }) => <div className="text-left text-gray-500 line-clamp-1">{row.getValue("description") || '-'}</div>,
        },
        {
            id: "actions",
            header: t('contractors.operations') || 'Actions',
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-500 hover:text-white hover:bg-blue-500"
                            onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                            title={t('common.edit')}
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-white hover:bg-red-500"
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
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
