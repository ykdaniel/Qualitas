import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistFromItpPath, itpReopenPath, RETURN_ITP_PARAM, REOPEN_ITP_PARAM } from '../src/utils/itpReturnLink';

test('checklistFromItpPath without an ITP id keeps the previous link shape', () => {
    assert.equal(checklistFromItpPath('QTS-RKS-TBC-CHK-000001'), '/checklist?openId=QTS-RKS-TBC-CHK-000001&from=itp');
    assert.equal(checklistFromItpPath('QTS-RKS-TBC-CHK-000001', null), '/checklist?openId=QTS-RKS-TBC-CHK-000001&from=itp');
});

test('checklistFromItpPath carries the source ITP id', () => {
    const url = new URL(checklistFromItpPath('CHK-1', 'itp-uuid-1'), 'http://x');
    assert.equal(url.pathname, '/checklist');
    assert.equal(url.searchParams.get('openId'), 'CHK-1');
    assert.equal(url.searchParams.get('from'), 'itp');
    assert.equal(url.searchParams.get(RETURN_ITP_PARAM), 'itp-uuid-1');
});

test('special characters are encoded, not interpreted as extra parameters', () => {
    const url = new URL(checklistFromItpPath('A&b=c#d', 'x&from=itr'), 'http://x');
    assert.equal(url.searchParams.get('openId'), 'A&b=c#d');
    assert.equal(url.searchParams.get('from'), 'itp');
    assert.equal(url.searchParams.get(RETURN_ITP_PARAM), 'x&from=itr');
    assert.equal(url.hash, '');
});

test('itpReopenPath always targets /itp with the reopen parameter only', () => {
    const url = new URL(itpReopenPath('//evil.example/?a=1'), 'http://x');
    assert.equal(url.origin, 'http://x');
    assert.equal(url.pathname, '/itp');
    assert.equal(url.searchParams.get(REOPEN_ITP_PARAM), '//evil.example/?a=1');
    assert.equal([...url.searchParams.keys()].length, 1);
});
