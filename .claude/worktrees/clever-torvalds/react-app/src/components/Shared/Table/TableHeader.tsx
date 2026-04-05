import React, { useState, useRef, useEffect } from 'react';
import styles from './TableHeader.module.css';
import { SortConfig } from '../../../hooks/useTable';

export type FilterType = 'text' | 'select' | 'date';

interface TableHeaderProps<T> {
    label: string;
    field: keyof T;
    sortConfig: SortConfig<T>;
    onSort: (key: keyof T) => void;
    filterValue?: any;
    onFilter?: (value: any) => void;
    filterType?: FilterType;
    filterOptions?: { label: string; value: string }[];
    className?: string; // Allow passing external styles
    center?: boolean;
}

export const TableHeader = <T,>({
    label,
    field,
    sortConfig,
    onSort,
    filterValue,
    onFilter,
    filterType,
    filterOptions,
    className,
    center,
}: TableHeaderProps<T>) => {
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    // Close popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSortClick = () => {
        onSort(field);
    };

    const isSorted = sortConfig.key === field;
    const isFiltered = filterValue !== undefined && filterValue !== '' && filterValue !== null;

    return (
        <th className={className}>
            <div className={styles.headerContainer} style={center ? { justifyContent: 'center' } : undefined}>
                <div className={styles.labelContainer} onClick={handleSortClick}>
                    {label}
                    <span className={`${styles.sortIcon} ${isSorted ? styles.active : ''}`}>
                        {isSorted ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                    </span>
                </div>

                {onFilter && (
                    <div className={styles.filterWrapper} ref={filterRef}>
                        <button
                            className={`${styles.filterButton} ${isFiltered ? styles.active : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsFilterOpen(!isFilterOpen);
                            }}
                            title="Filter"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                            </svg>
                        </button>
                        {isFilterOpen && (
                            <div className={styles.filterPopup} onClick={e => e.stopPropagation()}>
                                {filterType === 'select' ? (
                                    <select
                                        className={styles.filterSelect}
                                        value={filterValue || ''}
                                        onChange={(e) => onFilter(e.target.value)}
                                    >
                                        <option value="">All</option>
                                        {filterOptions?.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type={filterType === 'date' ? 'date' : 'text'}
                                        className={styles.filterInput}
                                        placeholder={`Filter ${label}...`}
                                        value={filterValue || ''}
                                        onChange={(e) => onFilter(e.target.value)}
                                        autoFocus
                                    />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </th>
    );
};
