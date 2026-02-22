import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../Shared/DataTable/DataTableColumnHeader";
import { cn } from "@/lib/utils";

export interface KPIItem {
    index: number;
    vendor: string;
    scope: string;
    obsPct: number | null;
    ncrPct: number | null;
    lastMonth: number | null;
    thisMonth: number | null;
    variance: number;
    trend: 'up' | 'down' | 'flat';
    monthly: Record<string, number | null>;
}

export const createColumns = (
    sortedMonths: string[],
    t: (key: string) => string,
    language: string
): ColumnDef<KPIItem>[] => {
    const baseColumns: ColumnDef<KPIItem>[] = [
        {
            accessorKey: "index",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="#" />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("index")}</div>,
            size: 50,
        },
        {
            accessorKey: "vendor",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.contractor')} />
            ),
            cell: ({ row }) => <div className="font-medium">{row.getValue("vendor")}</div>,
        },
        {
            accessorKey: "scope",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('kpi.scope')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("scope")}</div>,
        },
        {
            accessorKey: "obsPct",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="OBS" />
            ),
            cell: ({ row }) => {
                const val = row.getValue("obsPct");
                return <div className="text-center">{val != null ? `${val}%` : '—'}</div>;
            },
        },
        {
            accessorKey: "ncrPct",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="NCR" />
            ),
            cell: ({ row }) => {
                const val = row.getValue("ncrPct");
                return <div className="text-center">{val != null ? `${val}%` : '—'}</div>;
            },
        },
        {
            accessorKey: "lastMonth",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('kpi.lastMonth')} />
            ),
            cell: ({ row }) => {
                const val = row.getValue("lastMonth");
                return <div className="text-center">{val != null ? `${val}%` : '—'}</div>;
            },
        },
        {
            accessorKey: "thisMonth",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('kpi.thisMonth')} />
            ),
            cell: ({ row }) => {
                const val = row.getValue("thisMonth");
                return <div className="text-center">{val != null ? `${val}%` : '—'}</div>;
            },
        },
        {
            accessorKey: "trend",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('kpi.trend')} />
            ),
            cell: ({ row }) => {
                const trend = row.getValue("trend") as string;
                return (
                    <div className="text-center">
                        {trend === 'up' && <span className="text-emerald-600 font-bold" title="↑">↑</span>}
                        {trend === 'down' && <span className="text-red-600 font-bold" title="↓">↓</span>}
                        {trend === 'flat' && <span className="text-gray-500" title="—">—</span>}
                    </div>
                );
            },
        },
        {
            accessorKey: "variance",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('kpi.variance')} />
            ),
            cell: ({ row }) => {
                const val = row.getValue("variance") as number;
                return <div className="text-center">{val !== 0 ? `${val > 0 ? '+' : ''}${val?.toFixed(1)}%` : '0.0%'}</div>;
            },
        },
    ];

    const monthColumns: ColumnDef<KPIItem>[] = sortedMonths.map(month => ({
        id: `month_${month}`,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title={month} />
        ),
        accessorFn: (row) => row.monthly[month],
        size: 70,
        cell: ({ row }) => {
            const val = row.original.monthly[month];
            return <div className="text-center">{val != null ? `${val}%` : '—'}</div>;
        }
    }));

    return [...baseColumns, ...monthColumns];
};
