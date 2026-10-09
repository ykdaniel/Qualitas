import { useEffect, useState, useCallback } from 'react';
import api, { ProjectApi } from '../services/api';

/** Fresh, server-scoped options per creation modal; never use the persisted dashboard filter. */
export function useCreationProjects(enabled: boolean) {
    const [projects, setProjects] = useState<ProjectApi[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => setAttempt(value => value + 1), []);
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setLoading(true);
        setError(false);
        const load = async () => {
            try {
                const all: ProjectApi[] = [];
                const limit = 200;
                for (let skip = 0; ; skip += limit) {
                    const { data } = await api.get<ProjectApi[]>('/projects/', { params: { skip, limit } });
                    all.push(...data);
                    if (data.length < limit) break;
                }
                if (!cancelled) setProjects(all);
            } catch {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [enabled, attempt]);
    return { projects, loading, error, retry };
}
