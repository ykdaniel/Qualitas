/**
 * 日期先後順序勾稽工具
 *
 * Soft check only — warns via toast, never blocks the field from being set.
 * Dates are corrected/backdated often enough in real usage (fixing a typo,
 * entering historical data) that hard-blocking like validateStatusTransition
 * does would be too strict here; flagging the inconsistency is the goal.
 */

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
  laterLabel: string
): DateOrderCheck => {
  if (!earlierValue || !laterValue) return { valid: true };
  const earlier = new Date(earlierValue);
  const later = new Date(laterValue);
  if (isNaN(earlier.getTime()) || isNaN(later.getTime())) return { valid: true };
  if (later < earlier) {
    return {
      valid: false,
      message: `${laterLabel} (${laterValue}) is before ${earlierLabel} (${earlierValue})`,
    };
  }
  return { valid: true };
};
