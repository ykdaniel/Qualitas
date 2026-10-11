// AUDIT-BTNFIX-2026-001: the shared DataTable's labels and the date-order warning go through t(). Every module's tables use
// these components, so: zh and en both define every key; a missing key or a table outside a LanguageProvider shows the
// original English text (never the raw key); the date-order warning keeps its English sentence without a t().
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { createTable, getCoreRowModel, getPaginationRowModel } from '@tanstack/react-table';
import { DataTablePagination } from '../src/components/Shared/DataTable/DataTablePagination';
import { DATA_TABLE_TEXT_EN } from '../src/components/Shared/DataTable/useDataTableText';
import { LanguageContext } from '../src/context/LanguageContext';
import { checkDateOrder } from '../src/utils/dateValidation';

// The two dictionaries, read from the source (`npm test` runs from react-app/): en is the first block, zh the second.
const src = (await import('node:fs')).readFileSync('src/context/LanguageContext.tsx', 'utf8').replace(/\r\n/g, '\n');
const zhStart = src.indexOf('\n  zh: {');
assert.ok(zhStart > 0, 'zh block not found');
const dict = (part: string) => Object.fromEntries([...part.matchAll(/^ {4}'([^']+)': '((?:[^'\\]|\\.)*)',$/gm)].map(m => [m[1], m[2]]));
const en = dict(src.slice(0, zhStart));
const zh = dict(src.slice(zhStart));
const keys = [...Object.keys(DATA_TABLE_TEXT_EN).map(k => `dataTable.${k}`), 'common.dateOrderWarning'];

const tFrom = (d: Record<string, string>) => (key: string, params?: Record<string, string | number>) =>
    Object.entries(params || {}).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), d[key] ?? key);

function renderPagination(t?: (key: string, params?: Record<string, string | number>) => string) {
    const table = createTable({
        data: Array.from({ length: 21 }, (_, id) => ({ id })),
        columns: [{ accessorKey: 'id' }],
        state: { pagination: { pageIndex: 1, pageSize: 10 }, rowSelection: {} },
        onStateChange: () => {}, renderFallbackValue: null,
        getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(),
    });
    const el = React.createElement(DataTablePagination, { table });
    return renderToStaticMarkup(t ? React.createElement(LanguageContext.Provider, { value: { language: 'zh', setLanguage: () => {}, t } }, el) : el);
}

test('zh and en define every DataTable / date-warning key, with the same placeholders', () => {
    for (const key of keys) {
        assert.ok(en[key], `en missing ${key}`);
        assert.ok(zh[key], `zh missing ${key}`);
        const ph = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join();
        assert.equal(ph(zh[key]), ph(en[key]), key);
    }
    for (const [k, v] of Object.entries(DATA_TABLE_TEXT_EN)) assert.equal(en[`dataTable.${k}`], v, `en text of dataTable.${k} = the fallback`);
});

test('pagination in Chinese', () => {
    const html = renderPagination(tFrom(zh));
    for (const s of ['第 2／3 頁', '每頁列數', '已選取 0／21 列', '上一頁', '下一頁']) assert.ok(html.includes(s), `${s} in ${html}`);
    assert.ok(!html.includes('Rows per page') && !html.includes('dataTable.'), html);
});

test('a missing key, or no LanguageProvider, falls back to the English text (never the raw key)', () => {
    for (const html of [renderPagination(key => key), renderPagination()]) {
        for (const s of ['Page 2 of 3', 'Rows per page', '0 of 21 row(s) selected.', 'Go to next page']) assert.ok(html.includes(s), `${s} in ${html}`);
        assert.ok(!html.includes('dataTable.'), html);
    }
});

test('date-order warning: translated with t(), English without it or when the key is missing', () => {
    assert.equal(checkDateOrder('2026-10-02', '2026-10-01', '開始日期', '結束日期', tFrom(zh)).message, '結束日期（2026-10-01）早於開始日期（2026-10-02）');
    const english = 'End (2026-10-01) is before Start (2026-10-02)';
    assert.equal(checkDateOrder('2026-10-02', '2026-10-01', 'Start', 'End').message, english);
    assert.equal(checkDateOrder('2026-10-02', '2026-10-01', 'Start', 'End', key => key).message, english);
    assert.equal(checkDateOrder('2026-10-01', '2026-10-02', 'Start', 'End', tFrom(zh)).valid, true);
});
