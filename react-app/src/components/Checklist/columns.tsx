import { ColumnDef } from "@tanstack/react-table";
import { ChecklistRecord, isTemplateHistoricallyProtected } from "../../store/checklistStore";
import { Trash2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";


// Template library list — deliberately shows only what identifies and
// sizes a TEMPLATE (recordsNo / activity / real backend version / item
// count). No Pass/Fail/pass-rate stats and no ITR/inspection-date columns
// here — those belong to an ITR-linked instance, edited entirely within
// the ITR module, never on this page (see Checklist.tsx's page intro).
export const createColumns = (
    onDelete: (id: string) => void,
    t: (key: string) => string
): ColumnDef<ChecklistRecord>[] => [
        {
            id: "index",
            header: "#",
            cell: ({ row }) => <span className="font-mono text-slate-500">{row.index + 1}</span>,
            size: 50,
        },
        {
            accessorKey: "recordsNo",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('common.referenceNo')} />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-900">{row.original.recordsNo}</span>
                    {/* §17 hardening: a template that carries real historical
                        inspection results (legacy data, or unrecoverable
                        provenance) — flagged so it reads as "handle with
                        care" before the user even opens it. */}
                    {isTemplateHistoricallyProtected(row.original) && (
                        <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200"
                            title={t('checklist.historicalDataBanner') || 'Contains historical inspection data — original content preserved'}
                        >
                            <History size={10} />
                        </span>
                    )}
                </div>
            )
        },
        {
            accessorKey: "activity",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('checklist.activity') || t('common.activity')} />
            ),
            cell: ({ row }) => <span className="font-medium">{row.original.activity}</span>
        },
        {
            id: "version",
            accessorFn: (row) => row.version ?? null,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('checklist.versionLabel') || 'Version'} />
            ),
            cell: ({ row }) => {
                const v = row.original.version;
                return (
                    <div className="text-center font-bold text-slate-600">
                        {v === null || v === undefined
                            ? <span className="text-slate-400 font-normal">{t('checklist.versionUnknown') || 'Unknown'}</span>
                            : `v${v}`}
                    </div>
                );
            }
        },
        {
            id: "itemCount",
            accessorFn: (row) => Array.isArray(row.data?.items) ? row.data.items.length : 0,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('checklist.itemCount') || 'Items'} />
            ),
            cell: ({ row }) => {
                const count = Array.isArray(row.original.data?.items) ? row.original.data.items.length : 0;
                return <div className="text-center text-slate-600">{count}</div>;
            }
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => (
                <div className="flex items-center justify-center">
                    {/* Delete entry point hidden for a historically-protected
                        template — the backend already rejects the delete
                        outright (_instance_has_historical_evidence), but a
                        visible button that always fails is bad UX; per the
                        2026-09-19 fix, no delete entry point at all for these. */}
                    {!isTemplateHistoricallyProtected(row.original) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={(e) => { e.stopPropagation(); onDelete(row.original.id); }}
                            title="Delete"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            )
        }
    ];
