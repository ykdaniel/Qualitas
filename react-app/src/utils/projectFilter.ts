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
