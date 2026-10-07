import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { createTable, getCoreRowModel, getPaginationRowModel } from '@tanstack/react-table';
import { DataTablePagination } from '../src/components/Shared/DataTable/DataTablePagination';

for (const [count, pageIndex, expected] of [[0, 0, 'Page 0 of 0'], [1, 0, 'Page 1 of 1'], [21, 1, 'Page 2 of 3'] ] as const) {
    test(`pagination with ${count} records at index ${pageIndex}`, () => {
        const table = createTable({
            data: Array.from({ length: count }, (_, id) => ({ id })),
            columns: [{ accessorKey: 'id' }],
            state: { pagination: { pageIndex, pageSize: 10 }, rowSelection: {} },
            onStateChange: () => {}, renderFallbackValue: null,
            getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(),
        });
        const html = renderToStaticMarkup(React.createElement(DataTablePagination, { table }));
        assert.ok(html.includes(expected), html);
        if (!count) assert.equal((html.match(/disabled=""/g) || []).length, 4);
    });
}
