/**
 * DataTable columns for the approved-material register (MATERIAL-SUBMITTAL M6): the same shared table as the other modules
 * (OSD / NCR columns.tsx). Sorting, column hiding and the header filters work on the LOADED rows, exactly as elsewhere;
 * the server-side search stays in the page toolbar.
 */
import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/Shared/DataTable/DataTableColumnHeader';
import type { ApprovedMaterial } from '../../services/materialApi';
import type { useMaterialText } from './materialText';
import { StatusBadge } from './parts';

type MaterialText = ReturnType<typeof useMaterialText>;
const dash = (v: string | null | undefined) => (v && v.trim() ? v : '—');
const inList = (row: { getValue: (id: string) => unknown }, id: string, value: unknown) =>
    Array.isArray(value) ? value.includes(row.getValue(id)) : !value || row.getValue(id) === value;

const indexColumn = <T,>(): ColumnDef<T> => ({
    id: 'index',
    header: '#',
    cell: ({ row }) => <div className="text-center">{row.index + 1}</div>,
    enableSorting: false,
    enableColumnFilter: false,
    enableHiding: false,
    size: 50,
});

const textColumn = <T,>(id: string, title: string, get: (r: T) => string | null | undefined, nowrap = false): ColumnDef<T> => ({
    id,
    accessorFn: (r) => get(r) ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ getValue }) => <div className={nowrap ? 'text-center whitespace-nowrap' : 'text-center'}>{dash(getValue() as string)}</div>,
});

/** Approved materials: the approved revision's content (not the latest revision, not the material master). */
// Same order as the other modules (OSD / NCR / ITR / OBS columns.tsx): # · number · status · contractor · content · dates.
// Manufacturer and supplier are kept in the form and the view only (user: brand + model + spec identify the approved product).
export const createApprovedColumns = (mt: MaterialText): ColumnDef<ApprovedMaterial>[] => [
    indexColumn<ApprovedMaterial>(),
    {
        accessorKey: 'documentNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} title={mt('recordNo')} />,
        cell: ({ row }) => <div className="text-center whitespace-nowrap" data-testid={`approved-${row.original.documentNumber}`}>{row.original.documentNumber}</div>,
        size: 180,
    },
    {
        id: 'result',
        accessorFn: (r) => r.result,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title={mt('approvedResult')}
                                   filterOptions={(['Approved', 'ApprovedWithComments'] as const).map((s) => ({ label: mt(`status.${s}`), value: s }))} />
        ),
        cell: ({ row }) => <div className="flex justify-center"><StatusBadge status={row.original.result} /></div>,
        filterFn: (row, id, value) => inList(row, id, value),
    },
    textColumn<ApprovedMaterial>('vendor', mt('vendor'), (r) => r.vendorName),
    textColumn<ApprovedMaterial>('name', mt('materialName'), (r) => r.name),
    textColumn<ApprovedMaterial>('category', mt('category'), (r) => r.category),
    textColumn<ApprovedMaterial>('brand', mt('brand'), (r) => r.brand),
    textColumn<ApprovedMaterial>('model', mt('model'), (r) => r.model),
    textColumn<ApprovedMaterial>('specification', mt('specification'), (r) => r.specification),
    textColumn<ApprovedMaterial>('approvedDate', mt('approvedDate'), (r) => r.approvedDate, true),
];
