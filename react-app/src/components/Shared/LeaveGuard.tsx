import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import ConfirmModal from './ConfirmModal';

type GuardState = { dirty: boolean; busy: boolean };
type GuardContext = {
    update: (id: string, state?: GuardState) => void;
    release: (id: string, all: boolean) => void;
    hasOtherChanges: (id: string) => boolean;
    request: (action: () => void, state: GuardState, all?: boolean) => void;
};
const Context = createContext<GuardContext | null>(null);

/** One router blocker for all mounted editors, including nested editors. */
export function LeaveGuardProvider({ children }: { children: React.ReactNode }) {
    const { t } = useLanguage();
    const { isAuthenticated } = useAuth();
    const guards = useRef(new Map<string, GuardState>());
    const [busy, setBusy] = useState(false);
    const [action, setAction] = useState<(() => void) | null>(null);
    const blocker = useBlocker(() => isAuthenticated && [...guards.current.values()].some(g => g.dirty || g.busy));
    const update = useCallback((id: string, state?: GuardState) => {
        if (state) guards.current.set(id, state);
        else guards.current.delete(id);
        setBusy([...guards.current.values()].some(g => g.busy));
    }, []);
    const request = useCallback((next: () => void, state: GuardState, all = false) => {
        const states = all ? [...guards.current.values(), state] : [state];
        if (states.some(g => g.busy)) return;
        if (states.some(g => g.dirty)) setAction(() => next);
        else next();
    }, []);
    const release = useCallback((id: string, all: boolean) => {
        if (all) guards.current.clear();
        else guards.current.delete(id);
        setBusy([...guards.current.values()].some(g => g.busy));
    }, []);
    const hasOtherChanges = useCallback((id: string) => [...guards.current.entries()].some(([key, state]) => key !== id && (state.dirty || state.busy)), []);
    const value = useMemo(() => ({ update, request, release, hasOtherChanges }), [update, request, release, hasOtherChanges]);
    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (![...guards.current.values()].some(g => g.dirty || g.busy)) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, []);
    useEffect(() => {
        // A navigation requested during Save can resume once every editor has
        // confirmed success and unregistered; do not show a stale discard warning.
        if (blocker.state === 'blocked' && ![...guards.current.values()].some(g => g.dirty || g.busy)) {
            blocker.proceed();
        }
    }, [blocker, busy]);
    const blocked = blocker.state === 'blocked';
    return <Context.Provider value={value}>
        {children}
        <ConfirmModal isOpen={blocked || !!action} title={t('common.unsavedChanges')}
            message={t('km.leaveUnsaved')} pending={busy} confirmText={busy ? t('common.saving') : t('common.leave')} cancelText={t('common.stayAndSave')}
            onCancel={() => { setAction(null); if (blocker.state === 'blocked') blocker.reset(); }}
            onConfirm={() => {
                // A request that started while confirmation was open must finish first.
                if ([...guards.current.values()].some(g => g.busy)) return;
                const next = action;
                setAction(null);
                if (blocker.state === 'blocked') blocker.proceed();
                else next?.();
            }} />
    </Context.Provider>;
}

export function useLeaveGuard(dirty: boolean, busy = false) {
    const context = useContext(Context);
    if (!context) throw new Error('LeaveGuardProvider is required');
    const id = useId();
    useLayoutEffect(() => {
        context.update(id, { dirty, busy });
        return () => context.update(id);
    }, [context, id, dirty, busy]);
    return {
        requestClose: (action: () => void, all = false) => context.request(() => {
            // Confirmed close may synchronously navigate (deep-link back button).
            // Unregister before it does, otherwise the same edit prompts twice.
            context.release(id, all);
            action();
        }, { dirty, busy }, all),
        requestAction: (action: () => void) => context.request(action, { dirty, busy }),
        release: () => context.update(id),
        hasOtherChanges: () => context.hasOtherChanges(id),
    };
}

/** For forms initialized synchronously; async editors must supply their own dirty state. */
export function useDraftGuard(value: unknown, busy = false, enabled = true) {
    const key = JSON.stringify(value);
    const [baseline, setBaseline] = useState(key);
    const guard = useLeaveGuard(enabled && key !== baseline, busy);
    return { ...guard, markSaved: () => setBaseline(key) };
}

/** Local item panels stay mounted in their parent; reset only when a panel opens. */
export function useItemDraftGuard(value: unknown | null) {
    const open = value !== null;
    const key = JSON.stringify(value);
    const [session, setSession] = useState({ open, baseline: key });
    if (session.open !== open) setSession({ open, baseline: key });
    return useLeaveGuard(open && session.open && key !== session.baseline);
}
