import { useId } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useCreationProjects } from '../../hooks/useCreationProjects';
import styles from './FormShell.module.css';

type Props = {
    state: ReturnType<typeof useCreationProjects>;
    value?: string | null;
    onChange: (value: string) => void;
};

export function CreationProjectField({ state, value, onChange }: Props) {
    const { language } = useLanguage();
    const id = useId();
    const zh = language === 'zh';
    return <div className={styles.formGroup}>
        <label htmlFor={id}>{zh ? '專案' : 'Project'}</label>
        <select id={id} className={styles.formSelect} value={value || ''}
            disabled={state.loading || state.error} onChange={event => onChange(event.target.value)}>
            <option value="">{zh ? '請選擇專案' : 'Select a project'}</option>
            {state.projects.map(project => <option key={project.id} value={project.id}>
                {project.code ? `${project.code} — ` : ''}{project.name}
            </option>)}
        </select>
        {state.loading && <p role="status">{zh ? '正在載入專案…' : 'Loading projects…'}</p>}
        {state.error ? <p role="alert">
            {zh ? '專案清單載入失敗，請重試後再儲存。' : 'Projects could not be loaded. Retry before saving.'}
            <button type="button" onClick={state.retry}>{zh ? '重試' : 'Retry'}</button>
        </p> : <p>{zh
            ? '若帳號限定於多個專案，請選擇本筆紀錄所屬專案；留空時沿用系統既有規則。'
            : 'If your account is restricted to multiple projects, choose one for this record. Leaving this blank keeps the existing default rules.'}</p>}
    </div>;
}
