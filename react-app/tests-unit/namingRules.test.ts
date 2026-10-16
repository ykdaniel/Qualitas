import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRules, changedRules, exampleNumber, prefixProblem, toPayload } from '../src/components/DocumentNamingRules/namingRules';

// REF-PROJECT-SEQ-2026-001 B3 (D2): numbers carry the project code, no longer the contractor abbreviation.
test('example number uses the project code (ABC when none) and pads to the digit count', () => {
    assert.equal(exampleNumber('QTS-RKS-[PROJECT]-MOM-', 6), 'QTS-RKS-ABC-MOM-000001');
    assert.equal(exampleNumber('QTS-RKS-[PROJECT]-MOM-', 3, 'HL'), 'QTS-RKS-HL-MOM-001');
    assert.equal(exampleNumber('QTS-RKS-[ABBREV]-MOM-', 6, 'HL'), 'QTS-RKS-NA-MOM-000001');   // an old rule, shown before it is changed
});

test('example number replaces every [PROJECT], like the backend', () => {
    assert.equal(exampleNumber('[PROJECT]-X-[PROJECT]-', 2, 'HL'), 'HL-X-HL-01');
});

test('prefix checks match the backend: [PROJECT] required, [ABBREV] refused, KM exempt', () => {
    assert.equal(prefixProblem('ncr', 'QTS-RKS-[PROJECT]-NCR-'), null);
    assert.equal(prefixProblem('ncr', '  '), 'empty');
    assert.equal(prefixProblem('ncr', 'QTS-RKS-NCR-'), 'project');
    assert.equal(prefixProblem('ncr', 'QTS-[ABBREV]-[PROJECT]-NCR-'), 'abbrev');
    assert.equal(prefixProblem('km', 'QTS-KM-'), null);
    assert.equal(prefixProblem('KM', 'QTS-[ABBREV]-KM-'), null);
    assert.equal(prefixProblem('km', ''), 'empty');
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
    // spaces alone are not a change: the prefix is saved trimmed
    assert.deepEqual(changedRules(saved, saved.map((r) => ({ ...r, prefix: ` ${r.prefix}  ` }))), []);
});

test('the page shows exactly the rules the backend returns: known types in page order, then others; KM left out', () => {
    const displays = [
        { id: 'itp', moduleName: 'ITP' },
        { id: 'meeting', moduleName: 'Meeting Minutes', nameKey: 'meetingMinutes.title', noteKey: 'namingRules.note.meeting' },
        { id: 'fat', moduleName: 'FAT', unused: true },
    ];
    const rules = buildRules(displays, [
        { doc_type: 'wld', prefix: 'QTS-RKS-[PROJECT]-WLD-', sequence_digits: 5 },
        { doc_type: 'MEETING', prefix: 'QTS-RKS-[PROJECT]-MM-', sequence_digits: 4 },
        { doc_type: 'km', prefix: 'QTS-KM-', sequence_digits: 6 },
        { doc_type: 'itp', prefix: 'QTS-RKS-[PROJECT]-ITP-', sequence_digits: 6 },
    ]);
    // 'fat' is known to the page but the backend has no such rule: not shown (no frontend default any more)
    assert.deepEqual(rules.map((r) => [r.id, r.prefix, r.sequenceDigits, r.moduleName]), [
        ['itp', 'QTS-RKS-[PROJECT]-ITP-', 6, 'ITP'],
        ['meeting', 'QTS-RKS-[PROJECT]-MM-', 4, 'Meeting Minutes'],
        ['wld', 'QTS-RKS-[PROJECT]-WLD-', 5, 'WLD'],
    ]);
    assert.equal(rules[1].noteKey, 'namingRules.note.meeting');
    assert.deepEqual(buildRules(displays, []), []);
});

test('the save payload trims prefixes, leaves unused rules out and keeps digits within 1-6', () => {
    assert.deepEqual(toPayload([
        { id: 'ncr', moduleName: 'NCR', prefix: '  QTS-RKS-[PROJECT]-NCR- ', sequenceDigits: 6 },
        { id: 'fat', moduleName: 'FAT', unused: true, prefix: 'QTS-RKS-[ABBREV]-FAT-', sequenceDigits: 6 },
        { id: 'osd', moduleName: 'OSD', prefix: 'QTS-RKS-[PROJECT]-OSD-', sequenceDigits: 9 },
        { id: 'pqp', moduleName: 'PQP', prefix: 'QTS-RKS-[PROJECT]-PQP-', sequenceDigits: 0 },
    ]), [
        { doc_type: 'ncr', prefix: 'QTS-RKS-[PROJECT]-NCR-', sequence_digits: 6 },
        { doc_type: 'osd', prefix: 'QTS-RKS-[PROJECT]-OSD-', sequence_digits: 6 },
        { doc_type: 'pqp', prefix: 'QTS-RKS-[PROJECT]-PQP-', sequence_digits: 6 },
    ]);
});
