import test from 'node:test';
import assert from 'node:assert/strict';
import { kmDraftKey } from '../src/utils/kmDraftKey';
test('empty editor initialization does not mark a new draft dirty', () => {
    assert.equal(kmDraftKey({}, [{ content: '' }]), kmDraftKey({}, [{ content: '<p><br></p>' }]));
});
test('actual content and metadata edits remain dirty', () => {
    const empty = kmDraftKey({ title: '' }, [{ content: '' }]);
    assert.notEqual(empty, kmDraftKey({ title: 'New' }, [{ content: '' }]));
    assert.notEqual(empty, kmDraftKey({ title: '' }, [{ content: '<p>Hello</p>' }]));
    assert.notEqual(empty, kmDraftKey({ title: '' }, [{ content: '<p><img src="/image"></p>' }]));
});
