import React from 'react';
import { CheckCircle, XCircle, MinusCircle, Circle, HelpCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { classifyResult, RESULT_CODE, ResultKind } from '../../utils/checklistResult';

// Shared display/selection for a Checklist item's result (2026-09-19).
// Four explicit choices — no cycling button, nothing pre-selected as Pass.

const KIND_STYLE: Record<ResultKind, { on: string; icon: React.ReactNode }> = {
    unfilled: { on: 'bg-slate-200 text-slate-700 border-slate-400', icon: <Circle size={12} /> },
    pass: { on: 'bg-green-100 text-green-700 border-green-400', icon: <CheckCircle size={12} /> },
    fail: { on: 'bg-red-100 text-red-700 border-red-400', icon: <XCircle size={12} /> },
    na: { on: 'bg-sky-100 text-sky-700 border-sky-400', icon: <MinusCircle size={12} /> },
    unknown: { on: 'bg-orange-100 text-orange-700 border-orange-400', icon: <HelpCircle size={12} /> },
};

export const useResultLabel = () => {
    const { t } = useLanguage();
    return (raw: unknown): string => {
        const kind = classifyResult(raw);
        if (kind === 'unknown') return t('checklist.result.unknown', { value: String(raw) });
        return t(`checklist.result.${kind}`);
    };
};

/** Read-only chip (print-like, lists, locked snapshots). */
export const ResultBadge: React.FC<{ value: unknown }> = ({ value }) => {
    const label = useResultLabel();
    const kind = classifyResult(value);
    return (
        <span
            data-result-kind={kind}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${kind === 'unfilled' ? 'bg-white text-slate-500 border-slate-300' : KIND_STYLE[kind].on}`}
        >
            {KIND_STYLE[kind].icon}{label(value)}
        </span>
    );
};

const ORDER: Exclude<ResultKind, 'unknown'>[] = ['unfilled', 'pass', 'fail', 'na'];

/** Four-way selector. An item whose stored value is an unknown code has NO
 *  option selected and shows the raw value — it is replaced only when the
 *  user explicitly picks one of the four. */
export const ResultSelect: React.FC<{
    value: unknown;
    onChange: (code: string) => void;
    disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
    const { t } = useLanguage();
    const label = useResultLabel();
    const current = classifyResult(value);
    return (
        <div className="flex flex-col items-start gap-1">
            <div role="radiogroup" className="inline-flex rounded-md border border-slate-200 overflow-hidden" data-result-kind={current}>
                {ORDER.map((kind) => {
                    const selected = current === kind;
                    return (
                        <button
                            key={kind}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            data-result-option={kind}
                            disabled={disabled}
                            onClick={() => { if (!selected) onChange(RESULT_CODE[kind]); }}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold border-r last:border-r-0 border-slate-200 transition-colors ${selected ? KIND_STYLE[kind].on : 'bg-white text-slate-500 hover:bg-slate-50'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                            {KIND_STYLE[kind].icon}{t(`checklist.result.${kind}`)}
                        </button>
                    );
                })}
            </div>
            {current === 'unknown' && (
                <span data-result-unknown className="inline-flex items-center gap-1 text-xs font-bold text-orange-700">
                    <HelpCircle size={12} />{label(value)}
                </span>
            )}
        </div>
    );
};
