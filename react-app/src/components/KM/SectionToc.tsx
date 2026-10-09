/**
 * Collapsible inline Table of Contents rendered above a KM chapter's body.
 *
 * Consumed by KMDetail → ChapterSection. Fed by extractSectionToc, which
 * is what actually detects which paragraphs should become anchor targets
 * and injects matching id attributes into the chapter HTML.
 */

import React, { useState } from 'react';
import type { SectionTocEntry } from '../../utils/extractSectionToc';

interface SectionTocProps {
    entries: SectionTocEntry[];
    /** Start collapsed if true. Default false (shown open). */
    defaultCollapsed?: boolean;
}

const INDENT_PER_LEVEL = 18;

export const SectionToc: React.FC<SectionTocProps> = ({
    entries,
    defaultCollapsed = false,
}) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    if (entries.length === 0) return null;

    const scrollTo = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div
            style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#f8fafc',
                padding: '12px 16px',
                margin: '0 0 20px 0',
            }}
        >
            <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#334155',
                    fontFamily: 'inherit',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 600,
                        fontSize: '0.92rem',
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    <span>目錄 Contents</span>
                    <span
                        style={{
                            fontSize: '0.78rem',
                            color: '#64748b',
                            fontWeight: 500,
                        }}
                    >
                        ({entries.length})
                    </span>
                </div>
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease',
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {!collapsed && (
                <ul
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '12px 0 0 0',
                    }}
                >
                    {entries.map((entry) => (
                        <li key={entry.id} style={{ margin: 0 }}>
                            <button
                                type="button"
                                onClick={() => scrollTo(entry.id)}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    background: 'none',
                                    border: 'none',
                                    padding: `4px 4px 4px ${(entry.level - 1) * INDENT_PER_LEVEL}px`,
                                    color: '#0369a1',
                                    cursor: 'pointer',
                                    fontSize: entry.level === 1 ? '0.88rem' : '0.83rem',
                                    fontWeight: entry.level === 1 ? 600 : 400,
                                    textAlign: 'left',
                                    fontFamily: 'inherit',
                                    borderRadius: 3,
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.background =
                                        '#e0f2fe';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.background =
                                        'none';
                                }}
                                title={`跳到 ${entry.number} ${entry.title}`}
                            >
                                <span style={{ color: '#475569', marginRight: 8 }}>
                                    {entry.number}
                                </span>
                                {entry.title}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
