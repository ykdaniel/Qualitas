import type { ReactNode } from 'react';
import styles from './FormActions.module.css';

interface FormActionsProps {
    tools?: ReactNode;
    secondary?: ReactNode;
    cancel?: ReactNode;
    primary?: ReactNode;
}

/** Stable DOM and keyboard order: tools, workflow actions, cancel, save. */
export default function FormActions({ tools, secondary, cancel, primary }: FormActionsProps) {
    return (
        <div className={styles.bar} data-form-actions>
            {tools && <div className={styles.tools}>{tools}</div>}
            <div className={styles.main}>
                {secondary}
                {cancel}
                {primary}
            </div>
        </div>
    );
}
