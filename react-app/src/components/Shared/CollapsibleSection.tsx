import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import formStyles from './FormShell.module.css';
import sectionStyles from './CollapsibleSection.module.css';

interface CollapsibleSectionProps {
    title: React.ReactNode;
    /** Whether the section starts expanded when it manages its own state (no `expanded` prop). */
    defaultExpanded?: boolean;
    /** Controlled mode: the parent owns the state, so it survives this component being remounted
     *  (e.g. the ITR form is swapped out for its print preview and back). */
    expanded?: boolean;
    onToggle?: (next: boolean) => void;
    /** Items saved in the section, shown after the title; 0 dims the title. Omitted / null = not known. */
    count?: number | null;
    /** Short marker for changes not saved yet (e.g. "2 unsaved"), shown in the header either way. */
    unsavedLabel?: React.ReactNode;
    /** One-line preview shown only while collapsed, so a closed section still shows what it holds. */
    summary?: React.ReactNode;
    /** Accessible text for the toggle; also shown beside the chevron. */
    expandLabel?: string;
    collapseLabel?: string;
    children: React.ReactNode;
}

/** Collapsible wrapper around the shared `formSection` card — toggles visibility only, no data/validation
 *  logic of its own. ATTACH-SECTION-UX-2026-001: a closed section used to look like an empty card (the open
 *  title's bottom margin, padding and rule stayed, the 16px chevron was easy to miss) and gave no hint of its
 *  content; it now shows a count, an unsaved marker and a summary, collapses to a single header row, and the
 *  whole row is the toggle. */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title, defaultExpanded = false, expanded: controlled, onToggle, count, unsavedLabel, summary,
    expandLabel, collapseLabel, children,
}) => {
    const [own, setOwn] = useState(defaultExpanded);
    const expanded = controlled ?? own;
    const bodyId = useId();
    const toggle = () => {
        const next = !expanded;
        if (controlled === undefined) setOwn(next);
        onToggle?.(next);
    };
    const toggleText = expanded ? collapseLabel : expandLabel;
    return (
        <div className={`${formStyles.formSection} ${expanded ? '' : sectionStyles.collapsedCard}`}>
            <button
                type="button"
                onClick={toggle}
                className={`${sectionStyles.header} ${expanded ? sectionStyles.headerOpen : ''}`}
                aria-expanded={expanded}
                aria-controls={expanded ? bodyId : undefined}
            >
                <span className={`${sectionStyles.title} ${count === 0 ? sectionStyles.titleEmpty : ''}`}>
                    {title}
                    {count != null && <span className={sectionStyles.count}>({count})</span>}
                </span>
                {unsavedLabel && <span className={sectionStyles.unsaved}>{unsavedLabel}</span>}
                <span className={sectionStyles.toggle}>
                    {toggleText && <span className={sectionStyles.toggleText}>{toggleText}</span>}
                    <ChevronDown size={20} className={`${sectionStyles.chevron} ${expanded ? sectionStyles.chevronOpen : ''}`} aria-hidden="true" />
                </span>
            </button>
            {!expanded && summary && <div className={sectionStyles.summary}>{summary}</div>}
            {expanded && <div id={bodyId}>{children}</div>}
        </div>
    );
};

export default CollapsibleSection;
