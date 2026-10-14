import { useId } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useProjectStore } from '../../store/projectStore';
import styles from './FormShell.module.css';

type Props = {
    /** Kept for the callers' signature; the project is no longer chosen on the form. */
    state?: unknown;
    value?: string | null;
    onChange?: (value: string) => void;
};

/**
 * The project a new record is created in, shown read-only (REF-PROJECT-SEQ-2026-001 B2, D3): it is always the project
 * the user works in (project menu for an admin, the sign-in project for everyone else) — never chosen per record.
 * In "All projects" (admin) it reads "Shared template" (the ITP page, D18).
 */
export function CreationProjectField(_props: Props) {
    const { t } = useLanguage();
    const id = useId();
    const currentProject = useProjectStore(s => s.currentProject);
    const label = currentProject
        ? `${currentProject.code ? `${currentProject.code} — ` : ''}${currentProject.name}`
        : t('project.sharedTemplate');
    return <div className={styles.formGroup}>
        <label htmlFor={id}>{t('project.label')}</label>
        <input id={id} className={styles.formInput} value={label} readOnly
            style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }} />
    </div>;
}
