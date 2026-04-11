import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { KMArticleCreate, KMArticleUpdate, KMArticle } from '../../types/km';
import { useKMStore } from '../../store/kmStore';
import { kmService } from '../../services/kmService';
import { stripDecorativeZeros, compareChapterNo } from '../../utils/extractSectionToc';
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
    // Collapse the "basic info" panel by default when editing an existing
    // article — that's the mode where the user almost always just wants to
    // touch the chapter content, not the title/category/tags. Keep it
    // expanded for Create so the required fields (title) are visible.
    const [metaCollapsed, setMetaCollapsed] = useState(Boolean(id));

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
            // If editing, force-refresh the kmList from the server before
            // reading children. The store can be stale if the modal is
            // opened right after a save in another component, or after
            // direct DB edits — fetchChildren previously read getState()
            // synchronously and missed any not-yet-fetched siblings.
            const fetchChildren = async () => {
                if (existingData.id) {
                    try {
                        await useKMStore.getState().fetchKMs();
                        const children = useKMStore.getState().kmList.filter(k => k.parent_id === existingData.id);
                        if (children.length > 0) {
                            const sortedChildren = [...children].sort((a, b) => compareChapterNo(a.chapter_no, b.chapter_no));
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
        // Use functional update to avoid the stale-closure trap: when Quill
        // rehydrates a chapter's content after the fetchChildren effect
        // loads real children into the chapters array, ReactQuill fires an
        // onChange as part of its internal setContents pass. That onChange
        // callback was created during the INITIAL render (chapters=[1 item
        // placeholder]) and still holds a reference to that stale array.
        // If we spread the closure's `chapters` we'd collapse the state
        // back to the placeholder with the current content merged in,
        // wiping the loaded children. Reading `prev` inside the updater
        // always gives the latest state regardless of when the callback
        // was captured.
        setChapters((prev: typeof chapters) => {
            if (!prev[index]) return prev;
            const newChapters = [...prev];
            newChapters[index] = { ...newChapters[index], [field]: value };
            return newChapters;
        });
    };

    const addChapter = () => {
        // Pick the next free top-level chapter number by scanning the
        // existing x.0 markers and taking max + 1. Counting chapters.length
        // was wrong because sub-chapters (1.1, 1.2) inflate the count and
        // make the next top-level number skip ahead — e.g. [1.0, 1.1, 2.0]
        // would produce 4.0 instead of 3.0. Deleted chapters are ignored
        // because their numbers disappear on save.
        const active = chapters.filter(c => !c.deleted);
        const maxMajor = active.reduce((max, c) => {
            const m = (c.chapter_no || '').match(/^(\d+)\.0$/);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        const nextNo = maxMajor + 1;
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
     * Split a chapter at the current text-caret position.
     *
     * The intended flow is: the user clicks into a chapter's Quill editor,
     * positions the caret at the start of the paragraph they want to be the
     * beginning of a NEW chapter, then clicks "在此分章節".
     *
     * Implementation notes:
     * - We use window.getSelection() rather than Quill's API so we don't
     *   need to reach into RichTextEditor's internals. The caret is always
     *   inside a descendant of a ".ql-editor" element.
     * - We walk up from the caret's anchor node until we find the direct
     *   child of ".ql-editor" — that direct child is a block element
     *   (paragraph, heading, list, etc.). Everything BEFORE that block
     *   stays in the current chapter; that block and everything AFTER it
     *   become a new chapter inserted immediately below.
     * - We verify via a data-chapter-index attribute that the caret is
     *   actually inside the chapter whose button was clicked, not a sibling
     *   chapter that happened to be focused last.
     */
    const splitChapterAtCursor = (chapterIndex: number) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.anchorNode) {
            toast.error('請先把游標點到你想分章節的位置');
            return;
        }

        // Walk up to find the enclosing .ql-editor element.
        let node: Node | null = selection.anchorNode;
        let qlEditor: HTMLElement | null = null;
        while (node) {
            if (node.nodeType === Node.ELEMENT_NODE
                && (node as Element).classList?.contains('ql-editor')) {
                qlEditor = node as HTMLElement;
                break;
            }
            node = node.parentNode;
        }
        if (!qlEditor) {
            toast.error('請先點進章節的內文、把游標放到想分章節的位置再按');
            return;
        }

        // Confirm the focused editor belongs to the chapter whose button was
        // clicked. Prevents "I clicked chapter 2's split button but my caret
        // was actually in chapter 1" confusion.
        const chapterContainer = qlEditor.closest('[data-chapter-index]');
        const containerIndex = chapterContainer
            ? parseInt(chapterContainer.getAttribute('data-chapter-index') || '', 10)
            : -1;
        if (containerIndex !== chapterIndex) {
            toast.error('游標不在這個章節的內文裡。請先點進本章節再按。');
            return;
        }

        // Find the direct child of the ql-editor that contains the caret.
        let splitBlock: Node | null = selection.anchorNode;
        while (splitBlock && splitBlock.parentNode !== qlEditor) {
            splitBlock = splitBlock.parentNode;
        }
        if (!splitBlock) {
            toast.error('找不到分章節的位置');
            return;
        }

        const directChildren = Array.from(qlEditor.childNodes);
        const splitIndex = directChildren.indexOf(splitBlock as ChildNode);
        if (splitIndex < 0) {
            toast.error('找不到游標對應的段落');
            return;
        }
        if (splitIndex === 0) {
            toast.error('游標在章節最開頭 — 分開來第一個章節會是空的');
            return;
        }

        const serialize = (n: Node) =>
            n.nodeType === Node.ELEMENT_NODE
                ? (n as Element).outerHTML
                : (n.nodeValue || '');

        const beforeHtml = directChildren.slice(0, splitIndex).map(serialize).join('');
        const afterHtml = directChildren.slice(splitIndex).map(serialize).join('');

        // Splice the new chapter in right after the split point, then
        // renumber every top-level (x.0) chapter sequentially so the
        // chapter_no matches array order. This matters when you split
        // in the MIDDLE: without the renumber pass the new chapter
        // would get maxMajor+1 (pushing it to the end numerically even
        // though it sits in the middle of the array), and splitting
        // again would keep scattering numbers around. Renumbering on
        // every split keeps x.0 contiguous and in order.
        //
        // Only renumbers entries that already follow the x.0 pattern
        // (or have empty chapter_no) — custom labels like "第一章"
        // are left alone so users can keep non-standard numbering if
        // they chose it intentionally.
        const newChapters = [...chapters];
        newChapters[chapterIndex] = {
            ...newChapters[chapterIndex],
            content: beforeHtml,
        };
        newChapters.splice(chapterIndex + 1, 0, {
            title: '新章節',
            content: afterHtml,
            chapter_no: '',
        });

        let counter = 0;
        for (let i = 0; i < newChapters.length; i++) {
            if (newChapters[i].deleted) continue;
            counter++;
            const currentNo = newChapters[i].chapter_no || '';
            if (currentNo === '' || /^\d+\.0$/.test(currentNo)) {
                newChapters[i] = { ...newChapters[i], chapter_no: `${counter}.0` };
            }
        }

        setChapters(newChapters);

        toast.success('章節已分開，記得替新章節改個標題');
    };

    /**
     * Import a .docx file.
     *
     * Flow:
     * 1. Mammoth converts the file to HTML in the browser. Embedded images
     *    are extracted one-by-one and uploaded to /api/km/upload-image/,
     *    so the final HTML references real URLs under /uploads/km/
     *    instead of bloating the DB with base64.
     * 2. If the resulting HTML contains 2+ top-level <h1> headings, the
     *    import is automatically split into multiple KM chapters — one
     *    per H1. Content appearing BEFORE the first H1 is prepended to
     *    the first chapter (so nothing is lost).
     * 3. Single-H1 and no-H1 documents fall back to a one-chapter import
     *    into the chapter the user clicked.
     *
     * When splitting would replace non-empty existing chapters, the user
     * is asked to confirm so nothing is clobbered silently.
     */
    const handleWordImport = async (chapterIndex: number, file: File) => {
        if (!file.name.toLowerCase().endsWith('.docx')) {
            toast.error('僅支援 .docx 格式。舊版 .doc 檔請先用 Word 另存新檔為 .docx');
            return;
        }

        setLoading(true);

        // Image formats the browser will actually render as <img>. Word often
        // embeds Excel charts / Visio drawings / equations as EMF or WMF,
        // which the browser cannot decode even if the backend accepted them.
        const SUPPORTED_IMAGE_MIME = new Set([
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/gif',
            'image/webp',
            'image/bmp',
        ]);

        // Placeholder image shown in place of formats we could not import.
        // Rendered to a canvas → PNG data URL so DOMPurify always accepts
        // it on render (SVG data URIs are sometimes stripped for script
        // safety, PNG is universally allowed).
        const UNSUPPORTED_IMAGE_PLACEHOLDER = (() => {
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 100;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';
            ctx.fillStyle = '#fef3c7';
            ctx.fillRect(0, 0, 400, 100);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, 398, 98);
            ctx.fillStyle = '#92400e';
            ctx.textAlign = 'center';
            ctx.font = 'bold 15px -apple-system, system-ui, "Noto Sans TC", sans-serif';
            ctx.fillText('⚠️ 未能匯入的圖片', 200, 36);
            ctx.font = '12px -apple-system, system-ui, "Noto Sans TC", sans-serif';
            ctx.fillText('格式不支援（EMF / WMF / TIFF 等）', 200, 60);
            ctx.fillText('請在 Word 改存為 PNG / JPEG 後重新匯入', 200, 80);
            return canvas.toDataURL('image/png');
        })();

        // Counters populated by the image handler; reported to the user once
        // the whole document is converted.
        let skippedImageCount = 0;
        const skippedImageTypes = new Set<string>();

        try {
            // Mammoth is ~500KB; load it lazily so the base KM bundle stays small.
            const mammoth = await import('mammoth/mammoth.browser');
            const arrayBuffer = await file.arrayBuffer();

            const convertImage = mammoth.images.imgElement(async (image) => {
                const contentType = (image.contentType || '').toLowerCase();
                const isSupported = SUPPORTED_IMAGE_MIME.has(contentType);

                if (isSupported) {
                    try {
                        const rawBuffer = await image.read();
                        const buffer = rawBuffer instanceof Uint8Array
                            ? rawBuffer
                            : new TextEncoder().encode(String(rawBuffer));
                        // Normalise jpg → jpeg so the backend allow-list hits.
                        const rawExt = (contentType.split('/')[1] || 'png').toLowerCase();
                        const ext = rawExt === 'jpg' ? 'jpeg' : rawExt;
                        const suffix = Math.random().toString(36).slice(2, 8);
                        const imageFile = new File(
                            [buffer as BlobPart],
                            `word-import-${Date.now()}-${suffix}.${ext}`,
                            { type: contentType }
                        );
                        const uploadedUrl = await kmService.uploadImage(imageFile);
                        return { src: uploadedUrl, alt: image.altText || '' };
                    } catch (err) {
                        // Upload itself failed (network error, 413 too large,
                        // auth expired, etc.). Don't abort the whole import —
                        // substitute a placeholder so the user at least keeps
                        // the rest of the document.
                        console.warn('Image upload failed during Word import:', err);
                        skippedImageCount += 1;
                        skippedImageTypes.add(`${contentType} (上傳失敗)`);
                        return {
                            src: UNSUPPORTED_IMAGE_PLACEHOLDER,
                            alt: image.altText || `[上傳失敗的圖片: ${contentType}]`,
                        };
                    }
                }

                // Unsupported browser format (EMF/WMF/TIFF/etc). Don't bother
                // hitting the backend — it would fail, and even if it succeeded
                // the browser can't render the result.
                skippedImageCount += 1;
                skippedImageTypes.add(contentType || 'unknown');
                return {
                    src: UNSUPPORTED_IMAGE_PLACEHOLDER,
                    alt: image.altText || `[未支援的圖片格式: ${contentType || '未知'}]`,
                };
            });

            const result = await mammoth.convertToHtml(
                { arrayBuffer },
                { convertImage }
            );
            // Strip inline font-size properties so imported content
            // inherits the editor's default size (15px) instead of
            // whatever pt value Word was using. Users who want a
            // specific size can still set one via the size picker.
            // Also clean up style="" attributes left behind.
            const html = result.value
                .replace(/font-size:\s*[^;"]+;?\s*/g, '')
                .replace(/ style="\s*"/g, '');

            // Detect H1 headings to decide whether to split into chapters.
            const parsedDoc = new DOMParser().parseFromString(html, 'text/html');
            const h1Elements = parsedDoc.body.querySelectorAll('h1');
            const defaultTitlePattern = /^Chapter \d+$/;

            type ImportedChapter = { title: string; content: string };
            let importedChapters: ImportedChapter[] = [];

            if (h1Elements.length >= 2) {
                // Walk direct children of <body>, splitting at each H1.
                let current: ImportedChapter | null = null;
                let preamble = '';

                for (const node of Array.from(parsedDoc.body.childNodes)) {
                    const isH1 = node.nodeType === Node.ELEMENT_NODE
                        && (node as Element).tagName === 'H1';

                    if (isH1) {
                        if (current) importedChapters.push(current);
                        current = {
                            title: ((node as Element).textContent || '').trim() || 'Untitled',
                            content: '',
                        };
                        continue;
                    }

                    const serialized = node.nodeType === Node.ELEMENT_NODE
                        ? (node as Element).outerHTML
                        : (node.nodeValue || '');

                    if (current) {
                        current.content += serialized;
                    } else {
                        preamble += serialized;
                    }
                }
                if (current) importedChapters.push(current);

                // Preserve content that appeared before the first H1.
                if (preamble.trim() && importedChapters.length > 0) {
                    importedChapters[0].content = preamble + importedChapters[0].content;
                }
            }

            // Decide the apply strategy.
            const doMultiChapterSplit = importedChapters.length >= 2;

            if (doMultiChapterSplit) {
                // Check whether the user has real content that we'd clobber.
                const existing = chapters.filter(c => !c.deleted);
                const hasExistingContent = existing.some(c => {
                    const titleIsDefault = defaultTitlePattern.test(c.title || '');
                    const stripped = (c.content || '').replace(/<[^>]+>/g, '').trim();
                    const contentIsEmpty = stripped === '' || stripped === '\u200b';
                    return !titleIsDefault || !contentIsEmpty;
                });

                let shouldSplit = true;
                if (hasExistingContent) {
                    shouldSplit = window.confirm(
                        `偵測到 ${importedChapters.length} 個 H1 標題。\n\n` +
                        `按「確定」將 Word 檔自動分成 ${importedChapters.length} 個章節，` +
                        `會取代目前 ${existing.length} 個章節。\n\n` +
                        `按「取消」則合併為單一章節、覆蓋目前正在編輯的這一章。`
                    );
                }

                if (shouldSplit) {
                    // Mark any existing chapters that have a server id as deleted
                    // (soft-delete) so they get removed from the DB on save.
                    // Purely unsaved chapters can just be dropped.
                    const softDeleted = chapters
                        .filter(c => c.id && !c.deleted)
                        .map(c => ({ ...c, deleted: true }));

                    const fresh = importedChapters.map((ch, i) => ({
                        title: ch.title,
                        content: ch.content,
                        chapter_no: `${i + 1}.0`,
                    }));

                    setChapters([...softDeleted, ...fresh]);

                    toast.success(
                        `Word 檔匯入成功，自動分成 ${importedChapters.length} 個章節`
                    );
                    reportImportWarnings(result.messages, skippedImageCount, skippedImageTypes);
                    return;
                }
                // Fall through to single-chapter import if user declined.
            }

            // Single-chapter import (no split, or user declined split).
            const newChapters = [...chapters];
            const singleH1Title = h1Elements.length === 1
                ? (h1Elements[0].textContent || '').trim()
                : '';

            newChapters[chapterIndex] = {
                ...newChapters[chapterIndex],
                content: html,
            };
            if (defaultTitlePattern.test(newChapters[chapterIndex].title || '')) {
                newChapters[chapterIndex].title =
                    singleH1Title || file.name.replace(/\.docx$/i, '');
            }
            setChapters(newChapters);

            toast.success('Word 檔匯入成功');
            reportImportWarnings(result.messages, skippedImageCount, skippedImageTypes);
        } catch (err) {
            console.error('Word import failed:', err);
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Word 匯入失敗：${message}`);
        } finally {
            setLoading(false);
        }
    };

    const reportImportWarnings = (
        messages: Array<{ type: string; message: string }> | undefined,
        skippedImageCount: number,
        skippedImageTypes: Set<string>,
    ) => {
        if (skippedImageCount > 0) {
            const typeList = Array.from(skippedImageTypes).join('、');
            toast.warning(
                `其中 ${skippedImageCount} 張圖片未匯入（格式：${typeList}）。` +
                `請在 Word 改用 PNG/JPEG 重新插入這些圖片後再匯入。`,
                { duration: 8000 }
            );
        }
        if (messages && messages.length > 0) {
            const warningMessages = messages.filter(m => m.type === 'warning');
            if (warningMessages.length > 0) {
                // Dump the full list to the browser console so the author can
                // inspect exactly which Word constructs didn't translate —
                // useful for "what was that warning about?" follow-ups. Use
                // console.groupCollapsed so the entries live inside a single
                // expandable node instead of spamming the console.
                console.groupCollapsed(
                    `[KM Word 匯入] ${warningMessages.length} 項格式未完整保留`
                );
                for (const m of warningMessages) {
                    console.warn(m.message);
                }
                console.groupEnd();

                toast.warning(
                    `另有 ${warningMessages.length} 項文字格式未完整保留（例如文字方塊、SmartArt、頁首頁尾）。按 F12 打開開發者工具的 Console 可以看到完整清單。`,
                    { duration: 8000 }
                );
            }
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

            // Single-chapter mode (1 active chapter): the book carries
            // the chapter's content directly, no separate child record.
            // Multi-chapter mode (2+): the book is just a container —
            // its content stays empty so KMDetail doesn't double-render
            // the first chapter's body. Likewise its chapter_no goes
            // null so it's not treated as a phantom chapter.
            const isSingleChapter = activeChapters.length === 1;
            const mainDocData = {
                ...formData,
                content: isSingleChapter ? activeChapters[0].content : '',
                chapter_no: isSingleChapter ? formData.chapter_no : null,
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

            // Build the next chapters state as we process each save so that
            // multiple saves within the same modal session don't re-POST the
            // same no-id chapter over and over. Without this, every time the
            // user pressed Save the no-id entries would be created again and
            // the DB would accumulate duplicate "Chapter 1" / "Chapter 2"
            // records (the bug that produced the 12-chapter mess in the
            // test article on 2026-04-11).
            const nextChaptersState: typeof chapters = [];

            for (const ch of chapters) {
                if (ch.deleted && ch.id) {
                    await kmService.delete(ch.id);
                    // Dropped from next state.
                } else if (ch.deleted && !ch.id) {
                    // Was added and removed in the same session, nothing to persist.
                } else if (!ch.deleted && ch.id) {
                    await kmService.update(ch.id, {
                        title: ch.title,
                        content: ch.content,
                        chapter_no: ch.chapter_no,
                        parent_id: mainId,
                        category: mainDocData.category,
                        tags: mainDocData.tags,
                        status: mainDocData.status
                    } as KMArticleUpdate);
                    nextChaptersState.push(ch);
                } else if (!ch.deleted && !ch.id) {
                    // Only materialise new sub-chapters if there's more than one
                    // active chapter, OR the single chapter's title diverges
                    // from the main doc title (i.e. it's not just the main doc
                    // masquerading as a chapter).
                    if (activeChapters.length > 1 || (activeChapters.length === 1 && ch.title !== mainDocData.title)) {
                        const created = await kmService.create({
                            title: ch.title,
                            content: ch.content,
                            chapter_no: ch.chapter_no,
                            parent_id: mainId,
                            category: mainDocData.category,
                            tags: mainDocData.tags,
                            status: mainDocData.status,
                            attachments: [] // Child chapters don't carry attachments.
                        } as KMArticleCreate);
                        // IMPORTANT: remember the new server id so that a
                        // subsequent Save in the same session UPDATEs this
                        // row instead of creating another copy.
                        nextChaptersState.push({ ...ch, id: created?.id });
                    } else {
                        nextChaptersState.push(ch);
                    }
                }
            }

            setChapters(nextChaptersState);

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
                    {/* Collapsible "Basic Info" section.
                        Click the header bar to toggle. Defaults to collapsed
                        on edit, expanded on create (see metaCollapsed init). */}
                    <div
                        style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            background: '#f8fafc',
                            marginBottom: 16,
                            overflow: 'hidden',
                            flexShrink: 0,
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setMetaCollapsed(!metaCollapsed)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                background: 'none',
                                border: 'none',
                                padding: '10px 16px',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                color: '#334155',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                                </svg>
                                <span style={{ fontWeight: 600, fontSize: '0.92rem', whiteSpace: 'nowrap' }}>基本資訊</span>
                                {/* Compact summary shown when collapsed so the author
                                    still has context while editing content below. */}
                                {metaCollapsed && (
                                    <span style={{
                                        fontSize: '0.82rem',
                                        color: '#64748b',
                                        fontWeight: 400,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        minWidth: 0,
                                    }}>
                                        {formData.title || '（未命名）'}
                                        <span style={{ color: '#cbd5e1', margin: '0 8px' }}>·</span>
                                        {formData.category || 'General'}
                                        <span style={{ color: '#cbd5e1', margin: '0 8px' }}>·</span>
                                        {formData.status || 'Published'}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, color: '#64748b', fontSize: '0.8rem' }}>
                                <span>{metaCollapsed ? '展開' : '收合'}</span>
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
                                        transform: metaCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.15s ease',
                                    }}
                                >
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                            </div>
                        </button>

                        {!metaCollapsed && (
                            <div style={{ padding: '4px 16px 16px 16px', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
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
                            </div>
                        )}
                    </div>

                    <div className={styles.chaptersContainer}>
                        <div className={styles.chaptersHeader}>
                            <h3>Document Chapters</h3>
                        </div>

                        {chapters.map((ch, index) => {
                            if (ch.deleted) return null;
                            return (
                                <div key={ch.id ?? `new-${index}`} className={styles.chapterBlock} data-chapter-index={index}>
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
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                                                onClick={() => splitChapterAtCursor(index)}
                                                disabled={loading}
                                                title="把游標停在想分章節的段落開頭，再按這顆。可以把一個章節拆成兩個。"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: '6px 10px',
                                                    background: '#ecfdf5',
                                                    color: '#047857',
                                                    border: '1px solid #a7f3d0',
                                                    borderRadius: 5,
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    cursor: loading ? 'not-allowed' : 'pointer',
                                                    opacity: loading ? 0.5 : 1,
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                                                在此分章節
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeChapter(index)}
                                                className={styles.removeChapterBtn}
                                                title="Remove Chapter"
                                                disabled={chapters.filter(c => !c.deleted).length === 1}
                                            >&times;</button>
                                        </div>
                                    </div>
                                    <div
                                        className={styles.editorWrapper}
                                        data-chapter-prefix={stripDecorativeZeros(ch.chapter_no || '')}
                                        style={{ ['--chapter-prefix' as any]: `"${stripDecorativeZeros(ch.chapter_no || '')}"` }}
                                    >
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
