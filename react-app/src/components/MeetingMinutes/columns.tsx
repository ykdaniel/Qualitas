import { ColumnDef } from "@tanstack/react-table";
import { MeetingMinutesItem } from "../../store/meetingMinutesStore";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Trash2, Ban } from "lucide-react";
import { formatMinutesDate, type RegisterItemRow } from "./discussionLog";

// One row per open or closed discussion item across meetings — see MeetingMinutes.tsx's item views and
// discussionLog.ts's collectRegisterItems (open: newest occurrence of each meeting; closed: every meeting but Void).
export const createItemColumns = (
    t: (key: string) => string,
    which: 'open' | 'closed',
): ColumnDef<RegisterItemRow>[] => [
        {
            accessorKey: "itemNo",
            header: '#',
            cell: ({ row }) => <div style={{ fontWeight: 600 }}>{row.original.itemNo}</div>,
            size: 60,
        },
        {
            accessorKey: "content",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.colDiscussion')} />
            ),
            cell: ({ row }) => (
                <div style={{ whiteSpace: 'pre-wrap', textAlign: 'left', minWidth: 360 }}>
                    {row.original.topicTitle && <div style={{ color: '#64748b', fontSize: 12 }}>{row.original.topicTitle}</div>}
                    {row.original.content || '-'}
                </div>
            ),
        },
        {
            accessorKey: "owner",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.colActionBy')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.original.owner || '-'}</div>,
            size: 130,
        },
        {
            accessorKey: "raisedDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.raisedDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{formatMinutesDate(row.original.raisedDate) || '-'}</div>,
            size: 110,
        },
        {
            accessorKey: "targetDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.targetDate')} />
            ),
            cell: ({ row }) => (
                <div className="text-center" data-overdue={row.original.overdue ? '' : undefined}
                    style={row.original.overdue ? { color: '#b91c1c', fontWeight: 700 } : undefined}>
                    {formatMinutesDate(row.original.targetDate) || '-'}
                    {row.original.overdue && (
                        <div><span style={{ display: 'inline-block', marginTop: 2, padding: '0 6px', borderRadius: 4, background: '#fee2e2', color: '#b91c1c', fontSize: 11 }}>{t('meetingMinutes.overdue')}</span></div>
                    )}
                </div>
            ),
            size: 120,
        },
        {
            accessorKey: "status",
            header: t('meetingMinutes.itemStatus'),
            cell: ({ row }) => <div className="text-center">{row.original.status === 'Closed' ? t('meetingMinutes.itemStatusClosed') : t('meetingMinutes.itemStatusOpen')}</div>,
            size: 80,
        },
        {
            id: "meeting",
            header: t('meetingMinutes.colSourceMeeting'),
            cell: ({ row }) => (
                <div>
                    <div>{row.original.documentNumber}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{row.original.meetingTitle}</div>
                    {which === 'closed' && <div style={{ color: '#64748b', fontSize: 12 }}>{formatMinutesDate(row.original.meetingDate)}</div>}
                </div>
            ),
            size: 200,
        },
        {
            // the meeting's revision in a column of its own, not in brackets after the number (user, 2026-10-11)
            id: "rev",
            header: t('meetingMinutes.rev'),
            cell: ({ row }) => <div className="text-center">{row.original.rev || '-'}</div>,
            size: 60,
        },
    ];

/** Revisions in number order — "10.0" after "2.0" — whatever text a revision holds. */
const compareRev = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export const createColumns = (
    confirmDelete: (id: string) => void,
    confirmVoid: (id: string) => void,
    t: (key: string) => string,
    getActiveContractors: () => { name: string }[]
): ColumnDef<MeetingMinutesItem>[] => [
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
                <DataTableColumnHeader column={column} title={t('meetingMinutes.refNo')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("documentNumber")}</div>,
            size: 160,
        },
        {
            // user, 2026-10-11: "版次不要放在reference 要多一欄位顯示版次"
            id: "rev",
            accessorFn: row => row.rev ?? '1.0',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.rev')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.original.rev ?? '1.0'}</div>,
            sortingFn: (a, b) => compareRev(a.getValue<string>("rev"), b.getValue<string>("rev")),
            size: 70,
        },
        {
            accessorKey: "status",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('meetingMinutes.status')}
                    filterOptions={[
                        { label: 'Draft', value: 'Draft' },
                        { label: 'Published', value: 'Published' },
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
            accessorKey: "title",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.meetingTitle')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("title") || '-'}</div>,
        },
        {
            accessorKey: "meetingType",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.meetingType')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("meetingType") || '-'}</div>,
        },
        {
            accessorKey: "meetingDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.meetingDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{formatMinutesDate(row.getValue("meetingDate")) || '-'}</div>,
        },
        {
            accessorKey: "location",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.location')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("location") || '-'}</div>,
        },
        {
            accessorKey: "organizer",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.organizer')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("organizer") || '-'}</div>,
        },
        {
            accessorKey: "vendor",
            header: ({ column }) => (
                <DataTableColumnHeader
                    column={column}
                    title={t('common.contractor')}
                    filterOptions={getActiveContractors().map(c => ({ label: c.name, value: c.name }))}
                />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("vendor") || '-'}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            id: "actions",
            header: t('common.operations'),
            cell: ({ row }) => {
                const meeting = row.original;
                return (
                    <div className="flex items-center justify-center">
                        {meeting.status === 'Published' && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-100"
                                onClick={(e) => { e.stopPropagation(); confirmVoid(meeting.id); }}
                                title={t('meetingMinutes.voidAction')}
                            >
                                <Ban className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                            onClick={(e) => { e.stopPropagation(); confirmDelete(meeting.id); }}
                            title={t('common.delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];
