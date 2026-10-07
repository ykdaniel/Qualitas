import { useProjectStore } from '../store/projectStore';

/**
 * Returns the current project_id filter param if a project is selected.
 * Intended for use in store fetch methods to scope queries by project.
 */
export const getProjectFilterParams = (): { project_id: string } | Record<string, never> => {
    const { currentProject } = useProjectStore.getState();
    if (currentProject) {
        return { project_id: currentProject.id };
    }
    return {};
};

// A stable scope identifier (never `undefined`) for stores to tag which scope a fetch's result
// belongs to — see e.g. itpStore.ts's `itpDataScopeId`. "All Projects" gets its own fixed string
// rather than `null`/`undefined` so "no project selected yet" (the initial state, before ANY fetch
// has tagged data) stays distinguishable from "All Projects was the selected scope".
export const CURRENT_SCOPE_ALL = '__all__';
export const getCurrentProjectScopeId = (): string =>
    useProjectStore.getState().currentProject?.id ?? CURRENT_SCOPE_ALL;
