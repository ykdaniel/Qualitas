import {
    ArrowDownIcon,
    ArrowUpIcon,
    CaretSortIcon,
    EyeNoneIcon,
} from "@radix-ui/react-icons"
import { Column } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Filter } from "lucide-react"

interface DataTableColumnHeaderProps<TData, TValue>
    extends React.HTMLAttributes<HTMLDivElement> {
    column: Column<TData, TValue>
    title: string
    filterOptions?: { label: string; value: string }[]
}

export function DataTableColumnHeader<TData, TValue>({
    column,
    title,
    className,
    filterOptions,
}: DataTableColumnHeaderProps<TData, TValue>) {
    if (!column.getCanSort() && !column.getCanFilter()) {
        return <div className={cn(className)}>{title}</div>
    }

    return (
        <div className={cn("flex items-center space-x-2 justify-center", className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-white hover:text-white hover:bg-[#2d4a6f]"
                    >
                        <span>{title}</span>
                        {column.getIsSorted() === "desc" ? (
                            <ArrowDownIcon className="ml-2 h-4 w-4" />
                        ) : column.getIsSorted() === "asc" ? (
                            <ArrowUpIcon className="ml-2 h-4 w-4" />
                        ) : (
                            <CaretSortIcon className="ml-2 h-4 w-4" />
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                    <div className="flex flex-col gap-1">
                        {column.getCanSort() && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="justify-start font-normal h-8 px-2"
                                    onClick={() => column.toggleSorting(false)}
                                >
                                    <ArrowUpIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                                    Sort Asc
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="justify-start font-normal h-8 px-2"
                                    onClick={() => column.toggleSorting(true)}
                                >
                                    <ArrowDownIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                                    Sort Desc
                                </Button>
                            </>
                        )}

                        <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start font-normal h-8 px-2"
                            onClick={() => column.toggleVisibility(false)}
                        >
                            <EyeNoneIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                            Hide Column
                        </Button>

                        {(column.getCanSort() || column.getCanHide()) && column.getCanFilter() && (
                            <div className="h-px bg-muted my-1" />
                        )}

                        {column.getCanFilter() && (
                            <div className="px-2 py-1.5 space-y-2">
                                <div className="flex items-center text-xs font-medium text-muted-foreground">
                                    <Filter className="mr-1 h-3 w-3" />
                                    Filter
                                </div>
                                {filterOptions ? (
                                    <Select
                                        value={(column.getFilterValue() as string) ?? "ALL"}
                                        onValueChange={(value) =>
                                            column.setFilterValue(value === "ALL" ? "" : value)
                                        }
                                    >
                                        <SelectTrigger className="h-8 w-full">
                                            <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All</SelectItem>
                                            {filterOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        placeholder={`Filter ${title}...`}
                                        value={(column.getFilterValue() as string) ?? ""}
                                        onChange={(event) =>
                                            column.setFilterValue(event.target.value)
                                        }
                                        className="h-8"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}
