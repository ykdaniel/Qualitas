import { useContext } from 'react';
import { LanguageContext } from '../../../context/LanguageContext';

// The shared DataTable's own labels (pagination, View menu, column header menu), translated through the `dataTable.*`
// keys (AUDIT-BTNFIX-2026-001). Every module's tables use these components, so a key that is missing — or a table
// rendered outside a LanguageProvider (unit tests) — falls back to the original English text, never to the raw key.
export const DATA_TABLE_TEXT_EN = {
    rowsSelected: '{selected} of {total} row(s) selected.',
    rowsPerPage: 'Rows per page',
    pageOf: 'Page {page} of {pages}',
    firstPage: 'Go to first page',
    previousPage: 'Go to previous page',
    nextPage: 'Go to next page',
    lastPage: 'Go to last page',
    view: 'View',
    toggleColumns: 'Toggle columns',
    sortAsc: 'Sort Asc',
    sortDesc: 'Sort Desc',
    hideColumn: 'Hide Column',
    filter: 'Filter',
    selectPlaceholder: 'Select...',
    all: 'All',
    filterColumn: 'Filter {title}...',
    filterPlaceholder: 'Filter...',
} as const satisfies Record<string, string>;   // `as const`: a mistyped key is a type error, not a blank label

const fill = (text: string, params?: Record<string, string | number>) =>
    params ? Object.entries(params).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), text) : text;

export function useDataTableText() {
    const context = useContext(LanguageContext);
    return (key: keyof typeof DATA_TABLE_TEXT_EN, params?: Record<string, string | number>): string => {
        const fullKey = `dataTable.${key}`;
        const translated = context?.t(fullKey, params);
        return translated && translated !== fullKey ? translated : fill(DATA_TABLE_TEXT_EN[key], params);
    };
}
