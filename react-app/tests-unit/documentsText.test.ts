// KM-DOCS-2026-001 D2: the register's own texts — every key exists in both languages, placeholders are filled, the type and
// status labels cover every company type and every document / version status the backend answers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DOCUMENTS_TEXT_KEYS, documentsText } from '../src/components/Documents/documentsText';
import { COMPANY_DOC_TYPES } from '../src/types/documents';

test('zh and en have exactly the same keys', () => {
    assert.deepEqual([...DOCUMENTS_TEXT_KEYS.zh].sort(), [...DOCUMENTS_TEXT_KEYS.en].sort());
});

test('placeholders are replaced in both languages', () => {
    assert.equal(documentsText('zh', 'savedCreated', { docNo: 'QTS-KM-000007' }), '已登錄 QTS-KM-000007。');
    assert.equal(documentsText('en', 'tooLarge', { name: 'a.pdf', mb: 50 }), 'a.pdf exceeds the 50 MB limit.');
    assert.equal(documentsText('en', 'versionOption', { label: '1.0', status: 'Draft', summary: '' }), 'Rev 1.0 (Draft) ');
});

test('every company document type and every status has a label', () => {
    for (const t of COMPANY_DOC_TYPES) {
        for (const lang of ['zh', 'en']) assert.notEqual(documentsText(lang, `type.${t}` as never), `type.${t}`);
    }
    for (const s of ['draft', 'current', 'archived', 'superseded', 'submitted', 'approved', 'void']) {
        for (const lang of ['zh', 'en']) assert.notEqual(documentsText(lang, `status.${s}` as never), `status.${s}`);
    }
});

test('an unknown language falls back to English and an unknown key to itself', () => {
    assert.equal(documentsText('fr', 'save'), 'Save');
    assert.equal(documentsText('zh', 'no.such.key' as never), 'no.such.key');
});
