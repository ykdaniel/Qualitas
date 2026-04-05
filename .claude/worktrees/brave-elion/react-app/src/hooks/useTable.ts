import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig<T> {
    key: keyof T;
    direction: SortDirection;
}

export interface UseTableProps<T> {
    data: T[];
    defaultSort?: SortConfig<T>;
    searchQuery?: string;
    searchKeys?: (keyof T)[];
}

export const useTable = <T extends Record<string, any>>({
    data,
    defaultSort = { key: 'id', direction: 'asc' } as any,
    searchQuery = '',
    searchKeys = [],
}: UseTableProps<T>) => {
    const [sortConfig, setSortConfig] = useState<SortConfig<T>>(defaultSort);
    const [filters, setFilters] = useState<Record<string, any>>({});

    const handleSort = (key: keyof T) => {
        setSortConfig((current) => ({
            key,
            direction:
                current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const handleFilter = (key: keyof T, value: any) => {
        setFilters((prev) => {
            const newFilters = { ...prev, [key]: value };
            if (value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
                delete newFilters[key as string];
            }
            return newFilters;
        });
    };

    const processedData = useMemo(() => {
        let result = [...data];

        // 1. Filtering (Column specific)
        Object.keys(filters).forEach((key) => {
            const value = filters[key];
            if (value) {
                result = result.filter((item) => {
                    const itemValue = item[key];
                    if (itemValue === undefined || itemValue === null) return false;

                    // String filter (partial match, case insensitive)
                    if (typeof value === 'string' && typeof itemValue === 'string') {
                        return itemValue.toLowerCase().includes(value.toLowerCase());
                    }
                    // Exact match for other types (boolean, numbers, strict string match requirements could be handled here if needed)
                    if (typeof value !== 'object') {
                        return itemValue == value;
                    }

                    return true;
                });
            }
        });

        // 2. Global Search
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            result = result.filter((item) =>
                searchKeys.some((key) => {
                    const val = item[key];
                    return val ? String(val).toLowerCase().includes(lowerQuery) : false;
                })
            );
        }

        // 3. Sorting
        if (sortConfig.key) {
            result.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue === bValue) return 0;

                // Handle null/undefined values
                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;

                const comparison = aValue < bValue ? -1 : 1;
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [data, sortConfig, filters, searchQuery, searchKeys]);

    return {
        processedData,
        sortConfig,
        filters,
        handleSort,
        handleFilter,
    };
};
