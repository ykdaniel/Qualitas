import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import formStyles from './FormShell.module.css';

interface CollapsibleSectionProps {
    title: React.ReactNode;
    /** Whether the section starts expanded. Callers typically pass something
     *  like `existingAttachments.length > 0` so a section that already has
     *  content opens by default, and an empty one starts tucked away. */
    defaultExpanded?: boolean;
    children: React.ReactNode;
}

/** Minimal collapsible wrapper around the shared `formSection` card — toggles
 *  visibility only, no data/validation logic of its own. Modeled on the
 *  expand/collapse pattern ITRModals.tsx's Linked Checklists list already
 *  uses for each instance row; this is the same idea factored out so other
 *  sections (and other modules) can reuse it instead of duplicating the
 *  toggle state + chevron each time. */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, defaultExpanded = false, children }) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    return (
        <div className={formStyles.formSection}>
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className={formStyles.sectionTitle}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, paddingBottom: 10 }}
                aria-expanded={expanded}
            >
                {title}
                <ChevronDown
                    size={16}
                    style={{ marginLeft: 'auto', transition: 'transform 0.15s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
            </button>
            {expanded && children}
        </div>
    );
};

export default CollapsibleSection;
