import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useProjectStore } from '../store/projectStore';

/**
 * Whether the "new record" buttons may be used (REF-PROJECT-SEQ-2026-001 B2, D7): every record is created in the
 * project the user works in, so a system administrator working in "All projects" cannot create one — the button is
 * disabled and says why. `allowShared` is for the ITP page, where an administrator in "All projects" creates a shared
 * template (D18). The server enforces the same rule; this only explains it before the user fills in a form.
 */
export function useCreateGate(allowShared = false): { disabled: boolean; title: string | undefined; sharedTemplate: boolean } {
    const { user } = useAuth();
    const { t } = useLanguage();
    const currentProject = useProjectStore(s => s.currentProject);
    const allProjects = !currentProject;
    if (allProjects && user?.is_admin && allowShared) {
        return { disabled: false, title: t('project.createSharedTemplate'), sharedTemplate: true };
    }
    if (allProjects) {
        return { disabled: true, title: t('project.chooseProjectToCreate'), sharedTemplate: false };
    }
    return { disabled: false, title: undefined, sharedTemplate: false };
}
