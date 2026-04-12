import { useState, useEffect, useRef } from 'react';
import { useProjectStore, Project } from '../../store/projectStore';
import { useLanguage } from '../../context/LanguageContext';
import { ChevronDown, Check, FolderOpen } from 'lucide-react';
import styles from './ProjectSelector.module.css';

const ProjectSelector = () => {
    const { projectList, currentProject, setCurrentProject, fetchProjects } = useProjectStore();
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (projectList.length === 0) {
            void fetchProjects();
        }
    }, [projectList.length, fetchProjects]);

    const handleSelect = (project: Project | null) => {
        setCurrentProject(project);
        setOpen(false);
    };

    const triggerLabel = currentProject
        ? currentProject.name
        : t('project.allProjects');

    return (
        <div className={styles.wrapper} ref={wrapperRef}>
            <button
                className={styles.trigger}
                onClick={() => setOpen(prev => !prev)}
                title={t('project.selector')}
            >
                <FolderOpen size={16} />
                {currentProject && (
                    <span className={styles.triggerCode}>{currentProject.code}</span>
                )}
                <span className={styles.triggerLabel}>{triggerLabel}</span>
                <ChevronDown
                    size={14}
                    className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                />
            </button>

            {open && (
                <>
                    <div className={styles.backdrop} onClick={() => setOpen(false)} />
                    <div className={styles.dropdown}>
                        {/* All Projects option */}
                        <button
                            className={`${styles.dropdownItem} ${!currentProject ? styles.dropdownItemActive : ''}`}
                            onClick={() => handleSelect(null)}
                        >
                            <span className={styles.allProjectsIcon}>*</span>
                            <span className={styles.itemName}>{t('project.allProjects')}</span>
                            {!currentProject && (
                                <Check size={14} className={styles.checkMark} />
                            )}
                        </button>

                        {projectList.length > 0 && <div className={styles.separator} />}

                        {/* Project list */}
                        {projectList.map(project => {
                            const isActive = currentProject?.id === project.id;
                            return (
                                <button
                                    key={project.id}
                                    className={`${styles.dropdownItem} ${isActive ? styles.dropdownItemActive : ''}`}
                                    onClick={() => handleSelect(project)}
                                >
                                    <span className={styles.itemCode}>{project.code}</span>
                                    <span className={styles.itemName}>{project.name}</span>
                                    {isActive && (
                                        <Check size={14} className={styles.checkMark} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default ProjectSelector;
