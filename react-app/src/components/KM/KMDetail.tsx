import React, { useRef, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { KMArticle } from '../../types/km';
import { useKMStore } from '../../store/kmStore';
import { BackButton } from '../ui/BackButton';
import { KMHistoryModal } from './KMHistoryModal';
import styles from './KMDetail.module.css';

interface KMDetailProps {
    article: KMArticle;
    onClose: () => void;
    onEdit: () => void;
    onSelectArticle?: (article: KMArticle) => void;
}

export const KMDetail: React.FC<KMDetailProps> = ({ article, onClose, onEdit, onSelectArticle }) => {
    const { t } = useLanguage();
    const { kmList } = useKMStore();
    const [isHistoryModalOpen, setIsHistoryModalOpen] = React.useState(false);

    // Determine the main book and its chapters
    const bookId = article.parent_id ? article.parent_id : article.id;
    const chapters = kmList.filter(km => km.parent_id === bookId || km.id === bookId);

    // Sort chapters by chapter_no (immutable)
    const sortedChapters = [...chapters].sort((a, b) => (a.chapter_no || '').localeCompare(b.chapter_no || ''));

    React.useEffect(() => {
        if (article && article.id) {
            setTimeout(() => {
                document.getElementById(`chapter-${article.id}`)?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }, [article]);

    const hasChapters = sortedChapters.length > 1;

    // JS-based sticky sidebar
    const sidebarRef = useRef<HTMLDivElement>(null);
    const layoutRef = useRef<HTMLDivElement>(null);
    const placeholderRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const sidebar = sidebarRef.current;
        const layout = layoutRef.current;
        if (!sidebar || !layout) return;

        // Find the nearest scrollable ancestor
        const getScrollParent = (el: HTMLElement): HTMLElement | Window => {
            let parent = el.parentElement;
            while (parent) {
                const style = getComputedStyle(parent);
                if (/(auto|scroll)/.test(style.overflow + style.overflowY)) {
                    return parent;
                }
                parent = parent.parentElement;
            }
            return window;
        };

        const scrollParent = getScrollParent(sidebar);
        const sidebarTopOffset = 24;
        let isFixed = false;

        // Create a placeholder to reserve space when sidebar is fixed
        const placeholder = document.createElement('div');
        placeholder.style.display = 'none';
        placeholder.style.width = '320px';
        placeholder.style.flexShrink = '0';
        sidebar.parentElement?.insertBefore(placeholder, sidebar.nextSibling);
        placeholderRef.current = placeholder;

        const handleScroll = () => {
            const layoutRect = layout.getBoundingClientRect();

            if (layoutRect.top < sidebarTopOffset) {
                if (!isFixed) {
                    // Record left position BEFORE switching to fixed
                    const sidebarRect = sidebar.getBoundingClientRect();
                    sidebar.style.position = 'fixed';
                    sidebar.style.top = `${sidebarTopOffset}px`;
                    sidebar.style.left = `${sidebarRect.left}px`;
                    sidebar.style.width = `${sidebarRect.width}px`;
                    placeholder.style.display = 'block';
                    placeholder.style.height = `${sidebarRect.height}px`;
                    isFixed = true;
                }
            } else {
                if (isFixed) {
                    sidebar.style.position = '';
                    sidebar.style.top = '';
                    sidebar.style.left = '';
                    sidebar.style.width = '';
                    placeholder.style.display = 'none';
                    isFixed = false;
                }
            }
        };

        const target = scrollParent === window ? window : scrollParent;
        target.addEventListener('scroll', handleScroll, { passive: true });
        const handleResize = () => { if (isFixed) { isFixed = false; handleScroll(); } };
        window.addEventListener('resize', handleResize, { passive: true });
        handleScroll();

        return () => {
            target.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
            placeholder.remove();
            if (sidebar) {
                sidebar.style.position = '';
                sidebar.style.top = '';
                sidebar.style.left = '';
                sidebar.style.width = '';
            }
        };
    }, []);

    return (
        <div className={styles.container}>
            {/* Top Navigation Bar: Back Button (Left) & Edit Button (Right) */}
            <div className={styles.topNav}>
                <BackButton
                    onClick={onClose}
                    className="!bg-white !border !border-slate-200 !text-slate-600 hover:!bg-slate-50 hover:!text-slate-900 rounded-full"
                />
                <button className={styles.editBtn} onClick={onEdit}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    {t('common.edit') || '編輯內容'}
                </button>
            </div>

            {/* Hero Title Card */}
            <div className={styles.heroCard}>
                <div className={styles.metaRow}>
                    <span className={styles.categoryBadge}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        {article.category || 'Quality'}
                    </span>
                    <span className={styles.metaItem}># {article.articleNo}</span>
                    <span className={styles.metaItem}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        {article.updated_at}
                    </span>
                </div>
                <div className={styles.titleWrapper}>
                    <div className={styles.titleIcon}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    </div>
                    <h1 className={styles.title}>{article.title}</h1>
                </div>
                {article.tags && (
                    <div className={styles.tagsContainer}>
                        {article.tags.split(',').map(tag => (
                            <span key={tag.trim()} className={styles.tag}>{tag.trim()}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* Layout Wrapper: Left Document, Right Sidebar */}
            <div className={styles.layoutWrapper} ref={layoutRef}>
                {/* Main Content Area */}
                <div className={styles.mainContent}>
                    <div className={styles.contentHeader}>
                        <div className={styles.contentIcon}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                        </div>
                        <h3>{t('km.documentDetails') || '文件內容 (Document Details)'}</h3>
                    </div>
                    <div className={styles.contentBody}>
                        {sortedChapters.map((ch, index) => (
                            <div key={ch.id} id={`chapter-${ch.id}`} className={styles.chapterSection}>
                                {index > 0 && <hr className={styles.chapterDivider} />}
                                {hasChapters && (
                                    <h2 className={styles.chapterTitle}>
                                        {ch.chapter_no ? `${ch.chapter_no} ` : ''}{ch.title}
                                    </h2>
                                )}
                                <div className={`ql-editor ${styles.editorContainer}`}>
                                    <div dangerouslySetInnerHTML={{ __html: ch.content }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Sidebars & TOC */}
                <div className={styles.rightLayout} ref={sidebarRef}>
                    {/* Version History Card */}
                    <div className={styles.sideCard}>
                        <div className={styles.sideCardHeader}>
                            <span>版本數據</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.fadedIcon}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                        </div>
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>目前版本 (Current)</span>
                            <span className={styles.statValue}>v{article.version_no || 1}.0</span>
                        </div>
                        <button
                            style={{
                                width: '100%',
                                marginTop: '12px',
                                padding: '8px',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                color: '#334155',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                            onClick={() => setIsHistoryModalOpen(true)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            檢視歷史版本 (History)
                        </button>
                    </div>

                    {/* Table of Contents (If chapters exist) */}
                    {hasChapters && (
                        <div className={styles.sideCard}>
                            <div className={styles.sideCardHeader}>
                                <span>章節導覽</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.fadedIcon}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                            </div>
                            <ul className={styles.tocList}>
                                {sortedChapters.map(ch => (
                                    <li key={ch.id} className={styles.tocItem}>
                                        <button
                                            onClick={() => {
                                                document.getElementById(`chapter-${ch.id}`)?.scrollIntoView({ behavior: 'smooth' });
                                                if (onSelectArticle) onSelectArticle(ch);
                                            }}
                                            className={`${styles.tocButton} ${ch.id === article.id ? styles.tocButtonActive : ''}`}
                                        >
                                            <div className={styles.tocChapterMeta}>
                                                {ch.chapter_no ? `Chapter ${ch.chapter_no}` : (ch.parent_id ? 'Section' : 'Main Text')}
                                            </div>
                                            <div>{ch.title}</div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Attachments Card (Matching Mockup) */}
                    <div className={styles.sideCard}>
                        <div className={styles.sideCardHeader}>
                            <span>附件檔案</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.fadedIcon}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        </div>
                        <div className={styles.attachmentList}>
                            {article.attachments && (() => {
                                try {
                                    const parsedAttachments = typeof article.attachments === 'string'
                                        ? JSON.parse(article.attachments)
                                        : article.attachments;

                                    if (Array.isArray(parsedAttachments) && parsedAttachments.length > 0) {
                                        return parsedAttachments.map((att: any, idx: number) => (
                                            <div key={idx} className={styles.attachmentItem}>
                                                <div className={`${styles.attachmentIconBox} ${styles.iconBlue}`}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                                </div>
                                                <div className={styles.attachmentInfo}>
                                                    <span className={styles.attachmentName}>{att.name || att.filename || `File_${idx + 1}`}</span>
                                                    <span className={styles.attachmentSize}>{att.size || 'Unknown size'}</span>
                                                </div>
                                            </div>
                                        ));
                                    }
                                } catch (e) {
                                    console.error('Failed to parse attachments', e);
                                }
                            })()}

                            {(!article.attachments || article.attachments === '[]') && (
                                <div className={styles.emptyAttachment}>
                                    無附件檔案
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* History Modal Drawer */}
            <KMHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                articleId={article.id}
            />
        </div>
    );
};
