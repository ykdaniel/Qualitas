import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
// Redefine interface to avoid circular dependency if NamingRule is not exported or if we want to keep columns independent
export interface NamingRuleItem {
    id: string;
    moduleName: string;
    prefix: string;
    sequenceDigits: number;
    description: string;
}

export const createColumns = (
    handlePrefixChange: (id: string, value: string) => void,
    handleSequenceDigitsChange: (id: string, value: number) => void,
    getExample: (rule: NamingRuleItem) => string,
    t: (key: string) => string
): ColumnDef<NamingRuleItem>[] => [
        {
            accessorKey: "moduleName",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('namingRules.module')} />
            ),
            cell: ({ row }) => <div className="font-medium text-center">{row.getValue("moduleName")}</div>,
        },
        {
            accessorKey: "prefix",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('namingRules.prefixFormat')} />
            ),
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex justify-center">
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            value={item.prefix}
                            onChange={(e) => handlePrefixChange(item.id, e.target.value)}
                            placeholder="e.g. [ABBREV]-NCR-"
                        />
                    </div>
                );
            },
        },
        {
            accessorKey: "sequenceDigits",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('namingRules.sequenceDigits')} />
            ),
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex justify-center">
                        <input
                            type="number"
                            className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-center"
                            min={1}
                            max={6}
                            value={item.sequenceDigits}
                            onChange={(e) => handleSequenceDigitsChange(item.id, Number(e.target.value))}
                        />
                    </div>
                );
            },
        },
        {
            id: "example",
            header: () => t('namingRules.example'),
            cell: ({ row }) => <div className="text-center font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded">{getExample(row.original)}</div>,
        },
        {
            accessorKey: "description",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('namingRules.description')} />
            ),
            cell: ({ row }) => <div className="text-left text-gray-500 text-sm">{row.getValue("description")}</div>,
        },
    ];
