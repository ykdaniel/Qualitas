import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRefusalStore } from '../../store/refusalStore';
import { describeCoded, describeRefusal } from '../../utils/refusal';
import actionStyles from './FormActions.module.css';
import styles from './RefusalDialog.module.css';

/**
 * "Cannot delete / Cannot save" dialog (REFUSAL-DIALOG-2026-001). Mounted once in App.tsx; opened with showRefusal().
 * It never closes by itself and a click on the backdrop does not close it: only "OK", × or Esc.
 */
export default function RefusalDialog() {
    const current = useRefusalStore((s) => s.current);
    const close = useRefusalStore((s) => s.close);
    const { t, language } = useLanguage();
    const okRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const view = !current ? null : current.coded
        ? describeCoded(current.coded.code, current.coded.params, t, current.action)
        : describeRefusal(current.error, t, current.action, language);
    const visible = view !== null;

    useEffect(() => {
        if (!current) return;
        if (!visible) {
            // nothing to show (a 401, or a code without wording): drop it, so no invisible dialog keeps eating Esc
            close();
            return;
        }
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        okRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            } else if (e.key === 'Tab') {
                // keep the focus inside the dialog (it has only two buttons: × and OK)
                const buttons = Array.from(dialogRef.current?.querySelectorAll('button') ?? []);
                if (buttons.length === 0) return;
                e.preventDefault();
                const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next = e.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
                buttons[next].focus();
            }
        };
        // capture: the Esc must close this dialog, not a modal underneath it
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            if (opener?.isConnected) opener.focus();
        };
    }, [current, visible, close]);

    if (!view) return null;

    return createPortal(
        <div className={styles.overlay}>
            <div
                ref={dialogRef}
                className={styles.dialog}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="refusal-dialog-title"
                aria-describedby="refusal-dialog-message"
                data-testid="refusal-dialog"
            >
                <div className={styles.header}>
                    <AlertTriangle className={styles.icon} size={20} aria-hidden="true" />
                    <h2 id="refusal-dialog-title">{view.title}</h2>
                    <button type="button" className={styles.close} aria-label={t('refusal.close')} onClick={close}>×</button>
                </div>
                <div className={styles.body}>
                    <p id="refusal-dialog-message" className={styles.message}>{view.message}</p>
                    {view.items && (
                        <ul className={styles.items}>
                            {view.items.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                    )}
                    {view.original && <p className={styles.original} lang="en">{view.original}</p>}
                </div>
                <div className={styles.footer}>
                    <button ref={okRef} type="button" className={actionStyles.primary} onClick={close}>
                        {t('refusal.ok')}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
