import test from 'node:test';
import assert from 'node:assert/strict';
import { createColumns } from '../src/components/KM/columns';

test('KM delete action is absent by default and without delete permission', () => {
    for (const columns of [createColumns(() => {}, key => key), createColumns(() => {}, key => key, false)]) {
        const cell = columns.find(column => column.id === 'actions')?.cell as Function;
        assert.equal(cell({ row: { original: { id: 'article-id' } } }), null);
    }
});

test('KM authorized delete action targets its own article without triggering the row', () => {
    let deleted: string | undefined;
    let stopped = false;
    const columns = createColumns(id => { deleted = id; }, key => key, true);
    const cell = columns.find(column => column.id === 'actions')?.cell as Function;
    const rendered = cell({ row: { original: { id: 'article-id' } } });
    rendered.props.children.props.onClick({ stopPropagation: () => { stopped = true; } });
    assert.equal(deleted, 'article-id');
    assert.equal(stopped, true);
});
