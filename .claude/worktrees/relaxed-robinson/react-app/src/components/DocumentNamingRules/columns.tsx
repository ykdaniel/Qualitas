import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
import { NamingRule } from "./DocumentNamingRules"; // Import interface from main file or define here if circular dep issues
import { Input } from "@/components/ui/input"; // Assuming we have shadcn input or similar, or just use standard input with class

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
    getExample: (rule: NamingRuleItem) => string
): ColumnDef<NamingRuleItem>[] => [
        {
            accessorKey: "moduleName",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="模組" />
            ),
            cell: ({ row }) => <div className="font-medium text-center">{row.getValue("moduleName")}</div>,
        },
        {
            accessorKey: "prefix",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="前綴／格式" />
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
                            placeholder="e.g. FUI- 或 [ABBREV]-NCR-"
                        />
                    </div>
                );
            },
        },
        {
            accessorKey: "sequenceDigits",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="流水號位數" />
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
            header: "範例",
            cell: ({ row }) => <div className="text-center font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded">{getExample(row.original)}</div>,
        },
        {
            accessorKey: "description",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="說明" />
            ),
            cell: ({ row }) => <div className="text-left text-gray-500 text-sm">{row.getValue("description")}</div>,
        },
    ];
