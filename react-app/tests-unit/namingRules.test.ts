import test from 'node:test';
import assert from 'node:assert/strict';
import { changedRules, exampleNumber, mergeRules } from '../src/components/DocumentNamingRules/namingRules';

test('example number uses NA and pads to the digit count', () => {
    assert.equal(exampleNumber('QTS-RKS-[ABBREV]-MOM-', 6), 'QTS-RKS-NA-MOM-000001');
    assert.equal(exampleNumber('QTS-RKS-[ABBREV]-MOM-', 3), 'QTS-RKS-NA-MOM-001');
});

test('example number replaces every [ABBREV], like the backend', () => {
    assert.equal(exampleNumber('[ABBREV]-X-[ABBREV]-', 2, 'HL'), 'HL-X-HL-01');
});

test('changed rules lists only edited rules, with their saved values', () => {
    const saved = [
        { id: 'itp', prefix: 'QTS-RKS-[ABBREV]-ITP-', sequenceDigits: 6 },
        { id: 'meeting', prefix: 'QTS-RKS-[ABBREV]-MOM-', sequenceDigits: 6 },
        { id: 'osd', prefix: 'QTS-RKS-[ABBREV]-OSD-', sequenceDigits: 6 },
    ];
    const current = [
        { ...saved[0] },
        { ...saved[1], prefix: 'QTS-RKS-[ABBREV]-MM-' },
        { ...saved[2], sequenceDigits: 4 },
    ];
    const changes = changedRules(saved, current);
    assert.deepEqual(changes.map((c) => c.rule.id), ['meeting', 'osd']);
    assert.equal(changes[0].before.prefix, 'QTS-RKS-[ABBREV]-MOM-');
    assert.equal(changes[1].before.sequenceDigits, 6);
    assert.deepEqual(changedRules(saved, saved.map((r) => ({ ...r }))), []);
});

test('merge keeps page order, applies stored values and appends rules the page does not know (except KM)', () => {
    const defs = [
        { id: 'itp', prefix: 'QTS-RKS-[ABBREV]-ITP-', sequenceDigits: 6, moduleName: 'ITP' },
        { id: 'meeting', prefix: 'QTS-RKS-[ABBREV]-MOM-', sequenceDigits: 6, moduleName: 'Meeting Minutes' },
    ];
    const merged = mergeRules(defs, [
        { doc_type: 'wld', prefix: 'QTS-RKS-[ABBREV]-WLD-', sequence_digits: 5 },
        { doc_type: 'MEETING', prefix: 'QTS-RKS-[ABBREV]-MM-', sequence_digits: 4 },
        { doc_type: 'km', prefix: 'QTS-KM-', sequence_digits: 6 },
    ], (rule) => ({ ...rule, moduleName: rule.id.toUpperCase() }));
    assert.deepEqual(merged.map((r) => [r.id, r.prefix, r.sequenceDigits, r.moduleName]), [
        ['itp', 'QTS-RKS-[ABBREV]-ITP-', 6, 'ITP'],
        ['meeting', 'QTS-RKS-[ABBREV]-MM-', 4, 'Meeting Minutes'],
        ['wld', 'QTS-RKS-[ABBREV]-WLD-', 5, 'WLD'],
    ]);
});
