import { ColumnDef } from "@tanstack/react-table";
import { MeetingMinutesItem } from "../../store/meetingMinutesStore";
import { DataTableColumnHeader } from "@/components/Shared/DataTable/DataTableColumnHeader";
import { Button } from "@/components/ui/button";
import { Trash2, Ban } from "lucide-react";

// One row per closed discussion sub-item, aggregated across every
// currently-loaded meeting — see MeetingMinutes.tsx's "已結案項目" view.
export interface ClosedItemRow {
    meetingId: string;
    documentNumber: string;
    meetingTitle: string;
    meetingDate: string;
    itemNo: string;
    content: string;
    owner: string;
    topicTitle: string;
}

export const createClosedItemsColumns = (
    t: (key: string) => string,
): ColumnDef<ClosedItemRow>[] => [
        {
            accessorKey: "topicTitle",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.closedItemsTopic')} />
            ),
            cell: ({ row }) => <div>{row.getValue("topicTitle") || '-'}</div>,
        },
        {
            accessorKey: "content",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.topicDiscussion')} />
            ),
            cell: ({ row }) => (
                <div style={{ whiteSpace: 'pre-wrap' }}>
                    <span style={{ fontWeight: 600, marginRight: 6 }}>{row.original.itemNo}</span>
                    {row.getValue("content") || '-'}
                </div>
            ),
        },
        {
            accessorKey: "owner",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.itemOwner')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("owner") || '-'}</div>,
            size: 120,
        },
        {
            id: "meeting",
            header: t('meetingMinutes.closedItemsMeeting'),
            cell: ({ row }) => (
                <div>
                    <div>{row.original.documentNumber}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{row.original.meetingTitle}</div>
                </div>
            ),
            size: 200,
        },
        {
            accessorKey: "meetingDate",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title={t('meetingMinutes.meetingDate')} />
            ),
            cell: ({ row }) => <div className="text-center">{row.getValue("meetingDate") || '-'}</div>,
            size: 110,
        },
    ];

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
            cell: ({ row }) => <div className="text-center">{row.getValue("documentNumber")} ({row.original.rev ?? '1.0'})</div>,
            size: 180,
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
            cell: ({ row }) => <div className="text-center">{row.getValue("meetingDate") || '-'}</div>,
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
