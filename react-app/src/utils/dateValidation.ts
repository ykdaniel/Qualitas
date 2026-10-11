/**
 * 日期先後順序勾稽工具
 *
 * Soft check only — warns via toast, never blocks the field from being set.
 * Dates are corrected/backdated often enough in real usage (fixing a typo,
 * entering historical data) that hard-blocking like validateStatusTransition
 * does would be too strict here; flagging the inconsistency is the goal.
 */

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface DateOrderCheck {
  valid: boolean;
  message?: string;
}

/**
 * Checks that `laterValue` is not chronologically before `earlierValue`.
 * Either side may be empty (not yet filled in) — that's not a violation,
 * just an incomplete check.
 */
export const checkDateOrder = (
  earlierValue: string | undefined,
  laterValue: string | undefined,
  earlierLabel: string,
  laterLabel: string,
  // the caller's t() (AUDIT-BTNFIX-2026-001): the message in the user's language; without it, or if the key is missing,
  // the original English sentence
  t?: Translate
): DateOrderCheck => {
  if (!earlierValue || !laterValue) return { valid: true };
  const earlier = new Date(earlierValue);
  const later = new Date(laterValue);
  if (isNaN(earlier.getTime()) || isNaN(later.getTime())) return { valid: true };
  if (later < earlier) {
    const params = { later: laterLabel, laterValue, earlier: earlierLabel, earlierValue };
    const translated = t?.('common.dateOrderWarning', params);
    return {
      valid: false,
      message: translated && translated !== 'common.dateOrderWarning'
        ? translated
        : `${laterLabel} (${laterValue}) is before ${earlierLabel} (${earlierValue})`,
    };
  }
  return { valid: true };
};
