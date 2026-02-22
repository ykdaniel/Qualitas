import React, { useEffect, useState } from 'react';
import { diff_match_patch, DIFF_INSERT, DIFF_DELETE, DIFF_EQUAL } from 'diff-match-patch';
import { KMArticleHistory } from '../../types/km';
import { kmService } from '../../services/kmService';
import styles from './KMHistoryModal.module.css';

interface KMHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    articleId: string;
}

/** Strip HTML tags from a string to get plain text for diffing */
function stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

/** Compute word-level diff HTML between two plain-text strings */
function computeDiffHtml(oldText: string, newText: string): string {
    const dmp = new diff_match_patch();
    // Use line diff for better readability with long documents
    const a = dmp.diff_linesToChars_(oldText, newText);
    const diffs = dmp.diff_main(a.chars1, a.chars2, false);
    dmp.diff_charsToLines_(diffs, a.lineArray);
    dmp.diff_cleanupSemantic(diffs);

    let html = '';
    for (const [op, text] of diffs) {
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>');
        if (op === DIFF_INSERT) {
            html += `<ins style="background:#d4edda;color:#155724;text-decoration:none;border-radius:2px;padding:1px 2px;">${escaped}</ins>`;
        } else if (op === DIFF_DELETE) {
            html += `<del style="background:#f8d7da;color:#721c24;text-decoration:line-through;border-radius:2px;padding:1px 2px;">${escaped}</del>`;
        } else {
            html += `<span>${escaped}</span>`;
        }
    }
    return html;
}

type ModalMode = 'snapshot' | 'diff';

interface ModalState {
    version: KMArticleHistory;
    mode: ModalMode;
    prevVersion?: KMArticleHistory;
}

export const KMHistoryModal: React.FC<KMHistoryModalProps> = ({ isOpen, onClose, articleId }) => {
    const [history, setHistory] = useState<KMArticleHistory[]>([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState<ModalState | null>(null);

    useEffect(() => {
        if (isOpen && articleId) {
            fetchHistory();
        } else {
            setModal(null);
        }
    }, [isOpen, articleId]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await kmService.getHistory(articleId);
            setHistory(data);
        } catch (error) {
            console.error('Failed to fetch history:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // ─── Modal overlay (snapshot or diff) ───────────────────────────────────
    if (modal) {
        const { version, mode, prevVersion } = modal;
        const diffHtml = mode === 'diff' && prevVersion
            ? computeDiffHtml(stripHtml(prevVersion.content), stripHtml(version.content))
            : null;

        return (
            <div className={styles.overlay} onClick={() => setModal(null)}>
                <div className={styles.snapshotModal} onClick={e => e.stopPropagation()}>
                    <div className={styles.snapshotHeader}>
                        <div className={styles.snapshotTitle}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span className={styles.versionBadge}>v{version.version_no}.0</span>
                                {mode === 'diff' && prevVersion && (
                                    <>
                                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>←</span>
                                        <span className={styles.versionBadge} style={{ background: '#f1f5f9', color: '#475569' }}>
                                            v{prevVersion.version_no}.0
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>差異對比</span>
                                    </>
                                )}
                            </div>
                            <h3>{version.title}</h3>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {/* Toggle snapshot/diff */}
                            {prevVersion && (
                                <button
                                    onClick={() => setModal({ ...modal, mode: mode === 'diff' ? 'snapshot' : 'diff' })}
                                    style={{
                                        padding: '6px 12px',
                                        background: mode === 'diff' ? '#0ea5e9' : '#f1f5f9',
                                        color: mode === 'diff' ? '#fff' : '#334155',
                                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                                    }}
                                >
                                    {mode === 'diff' ? '📄 檢視快照' : '🔍 差異對比'}
                                </button>
                            )}
                            <button className={styles.closeBtn} onClick={() => setModal(null)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    </div>

                    {/* Legend for diff mode */}
                    {mode === 'diff' && (
                        <div style={{ padding: '10px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 16, fontSize: '0.82rem', flexWrap: 'wrap' }}>
                            <span><ins style={{ background: '#d4edda', color: '#155724', textDecoration: 'none', padding: '1px 6px', borderRadius: 3 }}>新增內容</ins></span>
                            <span><del style={{ background: '#f8d7da', color: '#721c24', padding: '1px 6px', borderRadius: 3 }}>刪除內容</del></span>
                            <span style={{ color: '#64748b' }}>— 與 v{prevVersion?.version_no}.0 相比</span>
                        </div>
                    )}

                    {mode === 'snapshot' && (
                        <div className={styles.snapshotWarning}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            您正在檢視歷史記錄快照 (唯讀模式)。建立時間：{version.created_at}
                        </div>
                    )}

                    <div className={styles.snapshotContent}>
                        {mode === 'snapshot' ? (
                            <div className="ql-editor" dangerouslySetInnerHTML={{ __html: version.content }} />
                        ) : (
                            <div style={{ lineHeight: 1.8, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                dangerouslySetInnerHTML={{ __html: diffHtml || '' }} />
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ─── Drawer ─────────────────────────────────────────────────────────────
    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
                <div className={styles.drawerHeader}>
                    <h2>版本歷史紀錄 (History)</h2>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className={styles.drawerBody}>
                    {loading ? (
                        <div className={styles.loading}>載入中...</div>
                    ) : history.length === 0 ? (
                        <div className={styles.empty}>尚無歷史紀錄</div>
                    ) : (
                        <div className={styles.timeline}>
                            {history.map((item, index) => {
                                // The next item in array is the previous version (history is desc ordered)
                                const prevItem = history[index + 1] ?? null;
                                return (
                                    <div key={item.id} className={styles.timelineNode}>
                                        <div className={styles.timelineBullet}></div>
                                        <div className={styles.timelineContent}>
                                            <div className={styles.timelineMeta}>
                                                <span className={styles.versionBadge}>v{item.version_no}.0</span>
                                                <span className={styles.date}>{item.created_at}</span>
                                            </div>
                                            <div className={styles.summary}>
                                                {item.change_summary || 'Auto-saved version'}
                                            </div>
                                            <div className={styles.author}>
                                                修改者 ID: {item.author_id || 'System'}
                                            </div>
                                            {/* Action buttons */}
                                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                                <button
                                                    onClick={() => setModal({ version: item, mode: 'snapshot', prevVersion: prevItem ?? undefined })}
                                                    style={{
                                                        padding: '4px 10px', background: '#f1f5f9', color: '#334155',
                                                        border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
                                                    }}
                                                >
                                                    📄 檢視快照
                                                </button>
                                                {prevItem && (
                                                    <button
                                                        onClick={() => setModal({ version: item, mode: 'diff', prevVersion: prevItem })}
                                                        style={{
                                                            padding: '4px 10px', background: '#e0f2fe', color: '#0369a1',
                                                            border: '1px solid #bae6fd', borderRadius: 5, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
                                                        }}
                                                    >
                                                        🔍 與前版對比
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
