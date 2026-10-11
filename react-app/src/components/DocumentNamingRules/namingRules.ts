/**
 * Pure helpers for the Document Naming Rules page (NAMING-RULES-MEETING-2026-001), kept out of the component so
 * they can be unit-tested.
 */

/** Shown in place of [ABBREV] in the examples: what a document without a vendor actually gets (core/utils.py). */
export const EXAMPLE_ABBREV = 'NA';

export interface NamingRuleValue {
    id: string;
    prefix: string;
    sequenceDigits: number;
}

export interface NamingRuleChange<T extends NamingRuleValue> {
    rule: T;
    before: NamingRuleValue;
}

/** The first number a rule would produce. Replaces every [ABBREV], as generate_reference_no does (Python str.replace). */
export const exampleNumber = (prefix: string, sequenceDigits: number, abbrev: string = EXAMPLE_ABBREV): string =>
    prefix.split('[ABBREV]').join(abbrev) + String(1).padStart(sequenceDigits, '0');

/** The rules whose prefix or digit count differs from what was last loaded or saved, in page order. */
export const changedRules = <T extends NamingRuleValue>(saved: NamingRuleValue[], current: T[]): NamingRuleChange<T>[] => {
    const byId = new Map(saved.map((rule) => [rule.id, rule]));
    return current.flatMap((rule) => {
        const before = byId.get(rule.id);
        if (!before || (before.prefix === rule.prefix && before.sequenceDigits === rule.sequenceDigits)) return [];
        return [{ rule, before }];
    });
};

/** A rule as GET /settings/naming-rules returns it. */
export interface ApiNamingRule {
    doc_type: string;
    prefix: string;
    sequence_digits: number;
}

// KM numbers articles with its own vendor-less rule (repositories/km_repository.py), which the [ABBREV] check here and in the
// backend would reject, so it is not managed on this page.
const NOT_MANAGED_HERE = new Set(['km']);

/**
 * The page's rules: every known definition with the stored values, then any rule the backend has that the page does not
 * know yet (e.g. a newly added module), so a new doc type shows up here without a frontend change.
 */
export const mergeRules = <T extends NamingRuleValue>(
    defs: T[], apiRules: ApiNamingRule[], makeExtra: (rule: NamingRuleValue) => T,
): T[] => {
    const byType = new Map(apiRules.map((rule) => [rule.doc_type.toLowerCase(), rule]));
    const known = defs.map((def) => {
        const stored = byType.get(def.id.toLowerCase());
        return stored ? { ...def, prefix: stored.prefix, sequenceDigits: stored.sequence_digits } : def;
    });
    const knownIds = new Set(defs.map((def) => def.id.toLowerCase()));
    const extras = apiRules
        .filter((rule) => !knownIds.has(rule.doc_type.toLowerCase()) && !NOT_MANAGED_HERE.has(rule.doc_type.toLowerCase()))
        .map((rule) => makeExtra({ id: rule.doc_type.toLowerCase(), prefix: rule.prefix, sequenceDigits: rule.sequence_digits }));
    return [...known, ...extras];
};
