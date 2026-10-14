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

/**
 * The project a new record is created in (REF-PROJECT-SEQ-2026-001 B2, D3): the project the user works in — a
 * non-admin's sign-in project, an admin's project menu choice. A payload that already names one keeps it (a record
 * derived from another). null when an admin works in "All projects": the server then refuses the create (D7), except
 * for an ITP, which becomes a shared template (D18).
 */
export const withCurrentProject = <T extends object>(payload: T): T & { project_id: string | null } => {
    const named = (payload as { project_id?: string | null }).project_id;
    return { ...payload, project_id: named || useProjectStore.getState().currentProject?.id || null };
};
