import { create } from 'zustand';
import { getErrorStatusCode } from '../utils/errorUtils';
import type { RefusalAction } from '../utils/refusal';

/**
 * The one "operation refused / failed" dialog (REFUSAL-DIALOG-2026-001), mounted once in App.tsx next to the Toaster.
 * It keeps the raw error and translates it while rendering, so switching the language while it is open still works.
 * A newer refusal replaces the one on screen.
 */
interface RefusalEntry {
    id: number;
    action: RefusalAction;
    /** a failed request (most refusals) */
    error?: unknown;
    /** a refusal already known without a failed request, e.g. NOI's delete-check */
    coded?: { code: string; params: Record<string, unknown> };
}

interface RefusalState {
    current: RefusalEntry | null;
    show: (entry: Omit<RefusalEntry, 'id'>) => void;
    close: () => void;
}

let nextId = 1;

export const useRefusalStore = create<RefusalState>((set) => ({
    current: null,
    show: (entry) => set({ current: { ...entry, id: nextId++ } }),
    close: () => set({ current: null }),
}));

/** Show a refused or failed delete / save in the dialog. Not for 401: the API client is already logging the user out. */
export function showRefusal(error: unknown, action: RefusalAction): void {
    if (getErrorStatusCode(error) === 401) return;
    useRefusalStore.getState().show({ error, action });
}

/** Show a refusal the page already knows about (same codes and wording as the backend's coded refusals). */
export function showCodedRefusal(code: string, params: Record<string, unknown>, action: RefusalAction): void {
    useRefusalStore.getState().show({ coded: { code, params }, action });
}
