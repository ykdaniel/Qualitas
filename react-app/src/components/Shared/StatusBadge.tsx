import React from 'react';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
    status: string; // Used for styling (case-insensitive)
    label?: string; // Text to display (defaults to status if not provided)
    className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className }) => {
    const s = (status || '').toLowerCase().replace(/\s+/g, '');
    const displayLabel = label || status || '-';

    let badgeClass = styles.badge;

    // Check specific status classes
    if (styles[s]) {
        badgeClass = `${styles.badge} ${styles[s]}`;
    } else {
        // Fallback or default
        badgeClass = `${styles.badge} ${styles.default}`;
    }

    if (className) {
        badgeClass = `${badgeClass} ${className}`;
    }

    return (
        <span className={badgeClass}>
            {displayLabel}
        </span>
    );
};
