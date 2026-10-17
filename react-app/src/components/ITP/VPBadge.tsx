/** Verification-point codes offered for new entries (ITP-VP-CODES-2026-001); an empty value shows as "-". */
export const VP_CODES = ['H', 'W', 'R', 'S', 'N/A'] as const;

/** Retired outright (user's decision 2026-10-17): start-up migration step 30 clears every "Q" to empty, so the editor
 *  does not keep it as an older code either. */
const RETIRED_CODES = ['Q'];

const isStandardCode = (value: string) => (VP_CODES as readonly string[]).includes(value);
const isRetiredCode = (value: string) => RETIRED_CODES.includes(value.trim().toUpperCase());

/** S and N/A are not in the itp.itemPanel.vpLegend translation yet; this local text is appended to it until the
 *  legend key moves into LanguageContext (after REFUSAL 2b-2). */
export const VP_LEGEND_EXTRA: Record<'en' | 'zh', string> = {
    en: 'S = Surveillance (periodic site patrol, no notice for each inspection) · N/A = Not applicable',
    zh: 'S＝Surveillance（巡查點，不定期現場巡查，不需逐次通知）．N/A＝不適用',
};

/** Options for a VP select. A cell holding an older code that is no longer offered (※, W/R, I, ■ …) also gets its
 *  own value as an option, so the select shows it as-is and a save leaves it untouched — it is never offered to other
 *  cells. A literal "-" already reads as the empty "-" option; a retired code (Q) gets no option of its own. */
export const VPOptions = ({ value }: { value?: string }) => {
    const legacy = value && value !== '-' && !isStandardCode(value) && !isRetiredCode(value) ? value : null;
    return (
        <>
            <option value="">-</option>
            {VP_CODES.map(code => <option key={code} value={code}>{code}</option>)}
            {legacy && <option value={legacy}>{legacy} (legacy)</option>}
        </>
    );
};

const styles: { [key: string]: string } = {
    H: "bg-rose-100 text-rose-700 border-rose-200 font-bold ring-1 ring-rose-200 shadow-sm",
    W: "bg-amber-100 text-amber-700 border-amber-200 font-bold ring-1 ring-amber-200 shadow-sm",
    R: "bg-sky-100 text-sky-700 border-sky-200 font-bold ring-1 ring-sky-200 shadow-sm",
    S: "bg-violet-100 text-violet-700 border-violet-200 font-bold ring-1 ring-violet-200 shadow-sm",
    "N/A": "bg-slate-50 text-slate-500 border-slate-200 font-medium text-xs ring-1 ring-slate-200",
};
// Older codes still in the data (Q, ※, W/R, ■ …): muted, so they read as "not a standard code".
const LEGACY_STYLE = "bg-slate-100 text-slate-600 border-slate-200 font-medium ring-1 ring-slate-200";

const VPBadge = ({ type, print: isPrint }: { type: string; print?: boolean }) => {
    if (!type || type === '-') return <span className="text-slate-200 font-light">-</span>;

    // min-w + px instead of a fixed width, so N/A and W/R fit without squeezing.
    if (isPrint) {
        return (
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-0.5 border border-slate-300 rounded font-bold text-xs whitespace-nowrap">
                {type}
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center justify-center min-w-8 h-8 px-1 rounded-lg text-sm whitespace-nowrap transition-all ${styles[type] || LEGACY_STYLE}`}>
            {type}
        </span>
    );
};

export default VPBadge;
