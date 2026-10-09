import * as React from "react"
import { useLanguage } from '../../../context/LanguageContext'
import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    OnChangeFn,
    RowSelectionState,
} from "@tanstack/react-table"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import { DataTablePagination } from "./DataTablePagination"
import { DataTableViewOptions } from "./DataTableViewOptions"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
    searchKey?: string
    searchPlaceholder?: string
    topRightContent?: React.ReactNode
    title?: React.ReactNode
    actions?: React.ReactNode
    getRowClassName?: (row: TData) => string
    rowSelection?: RowSelectionState
    onRowSelectionChange?: OnChangeFn<RowSelectionState>
    getRowId?: (originalRow: TData, index: number, parent?: any) => string
    onRowClick?: (row: TData) => void
    /** Optional: told whenever the column-header filters change (e.g. so a page can export what is filtered). Display unchanged. */
    onColumnFiltersChange?: (filters: ColumnFiltersState) => void
}

const DataTableInner = <TData, TValue>({
    columns,
    data,
    searchKey,
    searchPlaceholder = "Filter...",
    topRightContent,
    title,
    actions,
    getRowClassName,
    onRowClick,
    onColumnFiltersChange,
    ...props
}: DataTableProps<TData, TValue>) => {
    const { t } = useLanguage()
    const [sorting, setSorting] = React.useState<SortingState>([])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
        []
    )
    const [columnVisibility, setColumnVisibility] =
        React.useState<VisibilityState>({})
    const [rowSelection, setRowSelection] = React.useState({})
    React.useEffect(() => { onColumnFiltersChange?.(columnFilters) }, [columnFilters, onColumnFiltersChange])

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        onColumnFiltersChange: setColumnFilters,
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: props.onRowSelectionChange ?? setRowSelection,
        getRowId: props.getRowId,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection: props.rowSelection ?? rowSelection,
        },
    })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {title && <h2 className="text-xl font-semibold text-gray-800">{title}</h2>}
                    <DataTableViewOptions table={table} />
                </div>
                <div className="flex items-center gap-2">
                    {actions}
                    {searchKey && (
                        <div className="flex items-center py-4">
                            <Input
                                placeholder={searchPlaceholder}
                                value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
                                onChange={(event) =>
                                    table.getColumn(searchKey)?.setFilterValue(event.target.value)
                                }
                                className="max-w-sm"
                            />
                        </div>
                    )}
                    {topRightContent && <div>{topRightContent}</div>}
                </div>
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    const explicitSize = header.column.columnDef.size;
                                    return (
                                        <TableHead key={header.id} style={{
                                            textAlign: 'center',
                                            backgroundColor: '#4a4238',
                                            color: '#faf7f1',
                                            border: '1px solid #2d2a24',
                                            width: explicitSize,
                                            minWidth: explicitSize,
                                        }}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className={cn("even:bg-muted/30", getRowClassName?.(row.original), onRowClick && "cursor-pointer")}
                                    onClick={() => onRowClick?.(row.original)}
                                >
                                    {row.getVisibleCells().map((cell) => {
                                        const explicitSize = cell.column.columnDef.size;
                                        return (
                                        <TableCell
                                            key={cell.id}
                                            className="text-center border p-2"
                                            style={{
                                                width: explicitSize,
                                                minWidth: explicitSize,
                                            }}
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    {t('common.noData')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <DataTablePagination table={table} />
        </div>
    )
}

export const DataTable = React.memo(DataTableInner) as <TData, TValue>(
    props: DataTableProps<TData, TValue> & React.RefAttributes<HTMLDivElement>
) => JSX.Element;
