import test from 'node:test';
import assert from 'node:assert/strict';
import { hasEitherLanguage, missingRequiredItemFields, preferEnglishText } from '../src/utils/itpItemValidation';

test('English only, Chinese only, or both count as filled', () => {
    assert.equal(hasEitherLanguage({ en: 'Verify rebar', ch: '' }), true);
    assert.equal(hasEitherLanguage({ en: '', ch: '核對鋼筋' }), true);
    assert.equal(hasEitherLanguage({ en: 'Verify rebar', ch: '核對鋼筋' }), true);
    assert.equal(hasEitherLanguage({ ch: '只有中文' }), true);
});

test('empty, missing and whitespace-only values do not count', () => {
    assert.equal(hasEitherLanguage({ en: '', ch: '' }), false);
    assert.equal(hasEitherLanguage({}), false);
    assert.equal(hasEitherLanguage(undefined), false);
    assert.equal(hasEitherLanguage(null), false);
    assert.equal(hasEitherLanguage({ en: '   ', ch: '\n\t ' }), false);
    assert.equal(hasEitherLanguage({ en: '　', ch: ' ' }), false);   // full-width and no-break spaces
    assert.equal(hasEitherLanguage({ en: null, ch: null }), false);
});

test('a legacy plain-string Standard is judged by its own text', () => {
    assert.equal(hasEitherLanguage('ACI 318-19'), true);
    assert.equal(hasEitherLanguage('   '), false);
});

test('Activity and Standard are each required independently', () => {
    assert.deepEqual(missingRequiredItemFields({ activity: { en: 'A' }, standard: { ch: '標準' } }), []);
    assert.deepEqual(missingRequiredItemFields({ activity: { ch: '活動' }, standard: { en: ' ' } }), ['standard']);
    assert.deepEqual(missingRequiredItemFields({ activity: { en: ' ', ch: '' }, standard: 'S' }), ['activity']);
    assert.deepEqual(missingRequiredItemFields({}), ['activity', 'standard']);
});

test('preferEnglishText: English first, Chinese only when English is blank after trim', () => {
    assert.equal(preferEnglishText({ en: 'Check rebar', ch: '核對鋼筋' }), 'Check rebar');
    assert.equal(preferEnglishText({ en: 'Check rebar', ch: '' }), 'Check rebar');
    assert.equal(preferEnglishText({ en: '', ch: '核對鋼筋' }), '核對鋼筋');
    assert.equal(preferEnglishText({ en: '   ', ch: '核對鋼筋' }), '核對鋼筋');
    assert.equal(preferEnglishText({ ch: '只有中文' }), '只有中文');
});

test('preferEnglishText returns the original string untouched (no trimming, no copying)', () => {
    const v = { en: '', ch: '\u3000中文前有全形空白\n第二行 ' };
    assert.equal(preferEnglishText(v), '\u3000中文前有全形空白\n第二行 ');
    assert.deepEqual(v, { en: '', ch: '\u3000中文前有全形空白\n第二行 ' });
    assert.equal(preferEnglishText({ en: '  Padded EN  ', ch: '中' }), '  Padded EN  ');
});

test('preferEnglishText keeps the previous output when neither language has content', () => {
    assert.equal(preferEnglishText({ en: '', ch: '' }), '');
    assert.equal(preferEnglishText({ en: '  ', ch: ' ' }), '  ');
    assert.equal(preferEnglishText({}), '');
    assert.equal(preferEnglishText(undefined), '');
    assert.equal(preferEnglishText('Legacy string'), 'Legacy string');
});
