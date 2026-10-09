import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKMEditorSnapshot } from '../src/utils/kmEditorSnapshot';
import { kmService } from '../src/services/kmService';

test('editor snapshot preserves only the selected article and its own chapters', async () => {
    const original = kmService.getAll;
    try {
        const article = { id: 'main', title: 'Latest', version_no: 7 };
        const child = { id: 'child', parent_id: 'main', content: '<p>Content</p>' };
        kmService.getAll = async () => [article, child, { id: 'other', parent_id: 'different' }] as any;
        const snapshot = await loadKMEditorSnapshot('main');
        assert.deepEqual(snapshot, { article, children: [child] });
    } finally { kmService.getAll = original; }
});

test('failed and missing article loads reject instead of presenting an empty editable chapter', async () => {
    const original = kmService.getAll;
    try {
        kmService.getAll = async () => { throw new Error('network unavailable'); };
        await assert.rejects(loadKMEditorSnapshot('main'), /network unavailable/);
        kmService.getAll = async () => [];
        await assert.rejects(loadKMEditorSnapshot('main'), /unavailable/);
        kmService.getAll = async () => [{ id: 'main' }] as any;
        assert.deepEqual((await loadKMEditorSnapshot('main')).children, []);
    } finally { kmService.getAll = original; }
});
