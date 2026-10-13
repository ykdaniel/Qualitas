import { ReactNode, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { selectProject } from '../../services/api';
import actionStyles from './FormActions.module.css';
import styles from './ProjectGate.module.css';

type Props = { children: ReactNode };

/**
 * Where a signed-in account works decides what it may see (REF-PROJECT-SEQ-2026-001 B1, business decisions D4–D6):
 * an admin or a non-admin working in a project gets the app; a non-admin assigned to several projects chooses one
 * first (switching later needs a new sign-in); a non-admin assigned to none — or whose project was taken away — gets
 * a notice and nothing else. The server enforces the same rules; this only spares the user empty pages.
 */
export default function ProjectGate({ children }: Props) {
    const { user, logout, refreshUser } = useAuth();
    const { t } = useLanguage();
    const [chosen, setChosen] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);

    const handleEnter = async () => {
        if (!chosen || busy) return;
        setBusy(true);
        setFailed(null);
        try {
            await selectProject(chosen);
            await refreshUser();
        } catch (err: any) {
            console.error('Failed to choose the project to work in:', err);
            const code = err?.response?.data?.code;
            setFailed(code ? t(`refusal.code.${code}`) : t('project.gate.selectFailed'));
        } finally {
            setBusy(false);
        }
    };

    const status = user?.project_status;
    if (!user || !status || status === 'admin' || status === 'working') return <>{children}</>;

    if (status === 'choose') {
        return (
            <div className={styles.page}>
                <div className={styles.card}>
                    <h2 className={styles.title}>{t('project.gate.chooseTitle')}</h2>
                    <p className={styles.body}>{t('project.gate.chooseHint')}</p>
                    <div className={styles.projectList} role="radiogroup">
                        {(user.projects || []).map(project => (
                            <label key={project.id} className={styles.projectOption}>
                                <input type="radio" name="workProject" value={project.id}
                                    checked={chosen === project.id} onChange={() => setChosen(project.id)} />
                                <span className={styles.projectCode}>{project.code}</span>
                                <span>{project.name}</span>
                            </label>
                        ))}
                    </div>
                    {failed && <p className={styles.error}>{failed}</p>}
                    <div className={styles.actions}>
                        <button type="button" className={actionStyles.secondary} onClick={logout}>{t('project.gate.signOut')}</button>
                        <button type="button" className={actionStyles.primary} disabled={!chosen || busy} onClick={handleEnter}>
                            {t('project.gate.enter')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const relogin = status === 'relogin';
    return (
        <div className={styles.page}>
            <div className={styles.card} role="alert">
                <h2 className={styles.title}>{t(relogin ? 'project.gate.reloginTitle' : 'project.gate.nonMemberTitle')}</h2>
                <p className={styles.body}>{t(relogin ? 'project.gate.reloginBody' : 'project.gate.nonMemberBody')}</p>
                <div className={styles.actions}>
                    <button type="button" className={actionStyles.primary} onClick={logout}>{t('project.gate.signOut')}</button>
                </div>
            </div>
        </div>
    );
}
