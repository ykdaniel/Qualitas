import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { KMArticleCreate, KMArticleUpdate, KMArticle } from '../../types/km';
import { useKMStore } from '../../store/kmStore';
import { kmService } from '../../services/kmService';
import { RichTextEditor } from '../ui/RichTextEditor';
import { KMAttachment } from '../../types/km';
import styles from './KMModals.module.css';

interface KMModalProps {
    id: string | null;
    existingData?: KMArticle;
    onSaveSuccess: () => void;
    onClose: () => void;
}

export const KMModal: React.FC<KMModalProps> = ({ id, existingData, onSaveSuccess, onClose }) => {
    const { t } = useLanguage();
    const { kmList } = useKMStore();
    const [loading, setLoading] = useState(false);

    const parentOptions = kmList.filter(km => !km.parent_id && km.id !== id);

    const [formData, setFormData] = useState<KMArticleCreate | KMArticleUpdate>({
        title: '',
        content: '',
        category: 'General',
        tags: '',
        status: 'Published',
        attachments: [],
        parent_id: '',
        chapter_no: ''
    });

    // Dynamic Chapters State
    const [chapters, setChapters] = useState<Array<{ id?: string, title: string, content: string, chapter_no: string, deleted?: boolean }>>([
        { title: 'Chapter 1', content: '', chapter_no: '1.0' }
    ]);

    useEffect(() => {
        if (existingData) {
            setFormData(existingData);
            // If editing, try to find children documents
            const fetchChildren = async () => {
                if (existingData.id) {
                    try {
                        // Optimistically check store first if all data is loaded
                        const children = useKMStore.getState().kmList.filter(k => k.parent_id === existingData.id);
                        if (children.length > 0) {
                            const sortedChildren = [...children].sort((a, b) => (a.chapter_no || '').localeCompare(b.chapter_no || ''));
                            setChapters(sortedChildren.map(c => ({
                                id: c.id,
                                title: c.title,
                                content: c.content,
                                chapter_no: c.chapter_no || ''
                            })));
                        } else {
                            // If it has content itself, convert to first chapter
                            setChapters([{ title: existingData.title, content: existingData.content, chapter_no: existingData.chapter_no || '1.0' }]);
                        }
                    } catch {
                        setChapters([{ title: existingData.title, content: existingData.content, chapter_no: existingData.chapter_no || '1.0' }]);
                    }
                }
            };
            fetchChildren();
        } else {
            setFormData({
                title: '',
                content: '',
                category: 'General',
                tags: '',
                status: 'Published',
                attachments: [],
                parent_id: '',
                chapter_no: '' // Main doc typically doesn't need chapter no if it acts as a book cover
            });
            setChapters([{ title: 'Chapter 1', content: '', chapter_no: '1.0' }]);
        }
    }, [existingData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };


    const handleChapterChange = (index: number, field: string, value: string) => {
        const newChapters = [...chapters];
        newChapters[index] = { ...newChapters[index], [field]: value };
        setChapters(newChapters);
    };

    const addChapter = () => {
        const nextNo = chapters.filter(c => !c.deleted).length + 1;
        setChapters([...chapters, { title: `Chapter ${nextNo}`, content: '', chapter_no: `${nextNo}.0` }]);
    };

    const removeChapter = (indexToRemove: number) => {
        const newChapters = [...chapters];
        if (newChapters[indexToRemove].id) {
            // Soft delete for existing chapters
            newChapters[indexToRemove].deleted = true;
        } else {
            // Hard delete for newly added unsaved chapters
            newChapters.splice(indexToRemove, 1);
        }
        setChapters(newChapters);
    };

    /**
     * Import a .docx file into the specified chapter.
     *
     * The file is converted to HTML in-browser by mammoth. Embedded images
     * are extracted one-by-one and uploaded to the existing KM image
     * endpoint, so the resulting HTML references real URLs under
     * /uploads/km/ rather than base64 data URLs (keeps the DB lean and
     * makes images searchable by filename).
     *
     * Warns — but does not abort — if mammoth reports format fidelity
     * issues (unsupported text boxes, SmartArt, etc).
     */
    const handleWordImport = async (chapterIndex: number, file: File) => {
        if (!file.name.toLowerCase().endsWith('.docx')) {
            toast.error('僅支援 .docx 格式。舊版 .doc 檔請先用 Word 另存新檔為 .docx');
            return;
        }

        setLoading(true);
        try {
            // Mammoth is ~500KB; load it lazily so the base KM bundle stays small.
            const mammoth = await import('mammoth/mammoth.browser');
            const arrayBuffer = await file.arrayBuffer();

            const convertImage = mammoth.images.imgElement(async (image) => {
                const rawBuffer = await image.read();
                const buffer = rawBuffer instanceof Uint8Array
                    ? rawBuffer
                    : new TextEncoder().encode(String(rawBuffer));
                const contentType = image.contentType || 'image/png';
                const ext = (contentType.split('/')[1] || 'png').toLowerCase();
                const suffix = Math.random().toString(36).slice(2, 8);
                const imageFile = new File(
                    [buffer as BlobPart],
                    `word-import-${Date.now()}-${suffix}.${ext}`,
                    { type: contentType }
                );
                const uploadedUrl = await kmService.uploadImage(imageFile);
                return { src: uploadedUrl, alt: image.altText || '' };
            });

            const result = await mammoth.convertToHtml(
                { arrayBuffer },
                { convertImage }
            );

            const newChapters = [...chapters];
            newChapters[chapterIndex] = {
                ...newChapters[chapterIndex],
                content: result.value,
            };
            // If the chapter still has the default placeholder title, adopt
            // the Word file's stem as the new title so the user doesn't have
            // to rename it manually.
            const defaultTitlePattern = /^Chapter \d+$/;
            if (defaultTitlePattern.test(newChapters[chapterIndex].title)) {
                newChapters[chapterIndex].title = file.name.replace(/\.docx$/i, '');
            }
            setChapters(newChapters);

            if (result.messages && result.messages.length > 0) {
                const warningCount = result.messages.filter(m => m.type === 'warning').length;
                toast.warning(
                    `Word 匯入完成，但有 ${warningCount} 項格式未完整保留（例如文字方塊、SmartArt、頁首頁尾）。請檢查內容。`
                );
            } else {
                toast.success('Word 檔匯入成功');
            }
        } catch (err) {
            console.error('Word import failed:', err);
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Word 匯入失敗：${message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setLoading(true);
        try {
            const url = await kmService.uploadImage(file); // Reusing upload endpoint for all files
            const newAttachment: KMAttachment = {
                name: file.name,
                filename: file.name,
                size: (file.size / 1024).toFixed(2) + ' KB',
                url: url
            };

            setFormData(prev => {
                let currentAttachments: KMAttachment[] = [];
                if (typeof prev.attachments === 'string') {
                    try {
                        currentAttachments = JSON.parse(prev.attachments);
                    } catch {
                        currentAttachments = [];
                    }
                } else if (Array.isArray(prev.attachments)) {
                    currentAttachments = prev.attachments;
                }

                return {
                    ...prev,
                    attachments: [...currentAttachments, newAttachment]
                };
            });
        } catch {
            toast.error('File upload failed');
        } finally {
            setLoading(false);
            e.target.value = ''; // Reset input
        }
    };

    const removeAttachment = (indexToRemove: number) => {
        setFormData(prev => {
            let currentAttachments: KMAttachment[] = [];
            if (typeof prev.attachments === 'string') {
                try {
                    currentAttachments = JSON.parse(prev.attachments);
                } catch {
                    currentAttachments = [];
                }
            } else if (Array.isArray(prev.attachments)) {
                currentAttachments = prev.attachments;
            }
            return {
                ...prev,
                attachments: currentAttachments.filter((_, idx) => idx !== indexToRemove)
            };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Determine active chapters and use first chapter's content as main fallback 
            // if single chapter mode is effectively used.
            const activeChapters = chapters.filter(c => !c.deleted);

            const mainDocData = {
                ...formData,
                content: activeChapters.length > 0 ? activeChapters[0].content : formData.content
            };

            // Save main document first
            let savedMainDoc: any;
            const payload = { ...mainDocData, change_summary: (formData as any).change_summary };
            if (id) {
                savedMainDoc = await kmService.update(id, payload as KMArticleUpdate);
            } else {
                savedMainDoc = await kmService.create(payload as KMArticleCreate);
            }

            const mainId = savedMainDoc?.id || id;

            // Loop and save chapters
            for (const ch of chapters) {
                if (ch.deleted && ch.id) {
                    // Delete
                    await kmService.delete(ch.id);
                } else if (!ch.deleted && ch.id) {
                    // Update existing
                    await kmService.update(ch.id, {
                        title: ch.title,
                        content: ch.content,
                        chapter_no: ch.chapter_no,
                        parent_id: mainId,
                        category: mainDocData.category,
                        tags: mainDocData.tags,
                        status: mainDocData.status
                    } as KMArticleUpdate);
                } else if (!ch.deleted && !ch.id) {
                    // Create new chapter (Skip the first one if we want the main doc to ACT as chapter 1? No, user explicitly wants sub-chapters.
                    // Actually, if it's the main book, it can just be a container, or it can be Chapter 1. 
                    // Let's create all chapters as children if user added them, except maybe if it's just 1 chapter, we just put it in main.
                    // To keep it clean: always create them as children if parent_id = mainId is set.
                    if (activeChapters.length > 1 || (activeChapters.length === 1 && ch.title !== mainDocData.title)) {
                        await kmService.create({
                            title: ch.title,
                            content: ch.content,
                            chapter_no: ch.chapter_no,
                            parent_id: mainId,
                            category: mainDocData.category,
                            tags: mainDocData.tags,
                            status: mainDocData.status,
                            attachments: [] // Inherit attachments? Usually, keep child attachments blank.
                        } as KMArticleCreate);
                    }
                }
            }

            // Refresh data via store
            await useKMStore.getState().fetchKMs();
            onSaveSuccess();
            onClose();

        } catch (err: any) {
            toast.error(err.message || 'Error saving KM article and chapters');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <h2>{id ? (t('km.edit') || 'Edit Article') : (t('km.create') || 'Create Article')}</h2>
                    <button type="button" className={styles.closeButton} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.formBody}>
                    <div className={styles.formGroup}>
                        <label>{t('km.titleField') || 'Title'} *</label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            placeholder="Enter article title"
                            className={styles.inputField}
                        />
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label>{t('km.category') || 'Category'}</label>
                            <select
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                className={styles.inputField}
                            >
                                <option value="General">General</option>
                                <option value="Safety">Safety</option>
                                <option value="Quality">Quality</option>
                                <option value="Procedure">Procedure</option>
                                <option value="Guidelines">Guidelines</option>
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label>{t('km.tags') || 'Tags (comma separated)'}</label>
                            <input
                                type="text"
                                name="tags"
                                value={formData.tags}
                                onChange={handleChange}
                                placeholder="e.g. welding, safety, standard"
                                className={styles.inputField}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>{t('common.status') || 'Status'}</label>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className={styles.inputField}
                            >
                                <option value="Draft">Draft</option>
                                <option value="Published">Published</option>
                                <option value="Archived">Archived</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup} style={{ flexGrow: 1 }}>
                            <label>本次改版摘要 (Change Summary)</label>
                            <input
                                type="text"
                                name="change_summary"
                                value={(formData as any).change_summary || ''}
                                onChange={handleChange}
                                placeholder="簡述本次修改內容，例如：更新伺服器 IP (非必填)"
                                className={styles.inputField}
                            />
                        </div>
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label>Parent Document (Optional)</label>
                            <select
                                name="parent_id"
                                value={formData.parent_id || ''}
                                onChange={handleChange}
                                className={styles.inputField}
                            >
                                <option value="">None (Main Book)</option>
                                {parentOptions.map(p => (
                                    <option key={p.id} value={p.id}>{p.title}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Chapter No (e.g., 1.0)</label>
                            <input
                                type="text"
                                name="chapter_no"
                                value={formData.chapter_no || ''}
                                onChange={handleChange}
                                placeholder="e.g., 1.1"
                                className={styles.inputField}
                            />
                        </div>
                    </div>

                    <div className={styles.chaptersContainer}>
                        <div className={styles.chaptersHeader}>
                            <h3>Document Chapters</h3>
                        </div>

                        {chapters.map((ch, index) => {
                            if (ch.deleted) return null;
                            return (
                                <div key={index} className={styles.chapterBlock}>
                                    <div className={styles.chapterBlockHeader}>
                                        <div className={styles.chapterInputs}>
                                            <input
                                                type="text"
                                                placeholder="Chapter No (e.g. 1.0)"
                                                value={ch.chapter_no}
                                                onChange={(e) => handleChapterChange(index, 'chapter_no', e.target.value)}
                                                className={styles.smallInput}
                                                style={{ width: '80px' }}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Chapter Title"
                                                value={ch.title}
                                                onChange={(e) => handleChapterChange(index, 'title', e.target.value)}
                                                className={styles.inputField}
                                                style={{ flexGrow: 1 }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input
                                                type="file"
                                                id={`word-import-${index}`}
                                                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                                className={styles.fileInputHidden}
                                                disabled={loading}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        handleWordImport(index, file);
                                                    }
                                                    e.target.value = '';
                                                }}
                                            />
                                            <label
                                                htmlFor={`word-import-${index}`}
                                                className={styles.uploadButton}
                                                style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, fontSize: '0.8rem', padding: '6px 10px' }}
                                                title="從 .docx 檔匯入文字和圖片到本章節（會取代目前內容）"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                                從 Word 匯入
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => removeChapter(index)}
                                                className={styles.removeChapterBtn}
                                                title="Remove Chapter"
                                                disabled={chapters.filter(c => !c.deleted).length === 1}
                                            >&times;</button>
                                        </div>
                                    </div>
                                    <div className={styles.editorWrapper}>
                                        <div className={styles.quillContainer}>
                                            <RichTextEditor
                                                value={ch.content}
                                                onChange={(val) => handleChapterChange(index, 'content', val)}
                                                onLoadingStateChange={setLoading}
                                                className={styles.quillEditor}
                                                placeholder="Write your chapter content here..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <button type="button" onClick={addChapter} className={styles.addChapterBtnBottom}>
                            + Add Chapter
                        </button>
                    </div>

                    <div className={styles.formGroup}>
                        <label>Attachments</label>
                        <div className={styles.attachmentUploader}>
                            <input
                                type="file"
                                id="attachment-upload"
                                onChange={handleFileUpload}
                                className={styles.fileInputHidden}
                                disabled={loading}
                            />
                            <label htmlFor="attachment-upload" className={styles.uploadButton}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                Upload File
                            </label>
                        </div>

                        {/* Display existing attachments */}
                        {(() => {
                            let attList: KMAttachment[] = [];
                            if (typeof formData.attachments === 'string') {
                                try { attList = JSON.parse(formData.attachments); } catch { attList = []; }
                            } else if (Array.isArray(formData.attachments)) {
                                attList = formData.attachments;
                            }

                            if (attList.length > 0) {
                                return (
                                    <div className={styles.attachmentList}>
                                        {attList.map((att, idx) => (
                                            <div key={idx} className={styles.attachmentBadge}>
                                                <span className={styles.attachmentBadgeName}>{att.name || att.filename} ({att.size})</span>
                                                <button type="button" onClick={() => removeAttachment(idx)} className={styles.attachmentRemoveBtn}>&times;</button>
                                            </div>
                                        ))}
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>

                    <div className={styles.modalFooter}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={loading}>
                            {t('common.cancel') || 'Cancel'}
                        </button>
                        <button type="submit" className={styles.saveBtn} disabled={loading}>
                            {loading ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
