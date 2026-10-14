/**
 * Pure helpers for the Document Naming Rules page (NAMING-RULES-MEETING-2026-001), kept out of the component so
 * they can be unit-tested.
 */

/** Shown in place of [ABBREV] in examples of an old rule (numbers no longer carry the contractor). */
export const EXAMPLE_ABBREV = 'NA';

/** Shown in place of [PROJECT] when no project is chosen (an administrator in "All projects"). */
export const EXAMPLE_PROJECT = 'ABC';

/** Doc types numbered by their own rule, exempt from the [PROJECT] / [ABBREV] checks (routers/settings.py). */
export const NAMING_RULE_EXEMPT = new Set(['km']);

export type PrefixProblem = 'empty' | 'abbrev' | 'project' | null;

/**
 * What is wrong with a prefix, checked the same way as routers/settings.py update_naming_rules (REF-PROJECT-SEQ-2026-001
 * B3, D2): document numbers carry the project — QTS-RKS-[PROJECT]-<TYPE>- — so [PROJECT] is required and [ABBREV] (the
 * contractor) is refused; KM is exempt.
 */
export const prefixProblem = (id: string, prefix: string): PrefixProblem => {
    const value = (prefix ?? '').trim();
    if (!value) return 'empty';
    if (NAMING_RULE_EXEMPT.has(id.toLowerCase())) return null;
    if (value.includes('[ABBREV]')) return 'abbrev';
    if (!value.includes('[PROJECT]')) return 'project';
    return null;
};

export interface NamingRuleValue {
    id: string;
    prefix: string;
    sequenceDigits: number;
}

export interface NamingRuleChange<T extends NamingRuleValue> {
    rule: T;
    before: NamingRuleValue;
}

/** The first number a rule would produce in a project. Replaces every [PROJECT], as generate_reference_no does (Python
 *  str.replace); an old rule's [ABBREV] shows as NA. */
export const exampleNumber = (prefix: string, sequenceDigits: number, projectCode: string = EXAMPLE_PROJECT): string =>
    prefix.split('[PROJECT]').join(projectCode).split('[ABBREV]').join(EXAMPLE_ABBREV) + String(1).padStart(sequenceDigits, '0');

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

// KM numbers articles with its own rule (repositories/km_repository.py), without a project; it is not managed on this page.
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
