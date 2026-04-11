import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import QuillMarkdown from 'quilljs-markdown';
import 'quilljs-markdown/dist/quilljs-markdown-common-style.css';
import './RichTextEditor.css';
import { kmService } from '../../services/kmService';

// ───────────────────────────────────────────────────────────────────
// Quill customisation — runs once on module load, not per component.
//
// Register an extended font whitelist (CJK + common Latin faces) and
// a pixel-based size whitelist. The corresponding visual styling
// (font-family CSS + dropdown labels) lives in RichTextEditor.css;
// BOTH FILES MUST STAY IN SYNC — if you add a new entry here, add
// the matching .ql-font-<value> and dropdown ::before rule there or
// the dropdown item will be rendered blank.
// ───────────────────────────────────────────────────────────────────
const FONT_WHITELIST = [
    'sans-serif',
    'serif',
    'monospace',
    'ms-jhenghei',    // 微軟正黑體
    'pmingliu',       // 新細明體
    'dfkai-sb',       // 標楷體
    'pingfang',       // 蘋方
    'arial',
    'times-new-roman',
];

const SIZE_WHITELIST = [
    '10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px',
];

// Extend Quill's font format. Using `true` as the second arg to
// Quill.register REPLACES the existing format, which is what we want.
const FontFormat = Quill.import('formats/font') as { whitelist: string[] };
FontFormat.whitelist = FONT_WHITELIST;
Quill.register(FontFormat as unknown as Parameters<typeof Quill.register>[0], true);

const SizeFormat = Quill.import('formats/size') as { whitelist: string[] };
SizeFormat.whitelist = SIZE_WHITELIST;
Quill.register(SizeFormat as unknown as Parameters<typeof Quill.register>[0], true);

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    onLoadingStateChange?: (loading: boolean) => void;
    placeholder?: string;
    className?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
    value,
    onChange,
    onLoadingStateChange,
    placeholder = 'Start typing...',
    className
}) => {
    const quillRef = useRef<ReactQuill>(null);

    const imageHandler = useCallback(() => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            if (input.files && input.files[0]) {
                const file = input.files[0];
                try {
                    if (onLoadingStateChange) onLoadingStateChange(true);
                    // Use KM service for image uploading. Can be generalized later if needed.
                    const url = await kmService.uploadImage(file);
                    const quill = quillRef.current?.getEditor();
                    if (quill) {
                        const range = quill.getSelection();
                        const position = range ? range.index : quill.getLength();
                        quill.insertEmbed(position, 'image', url);
                    }
                } catch (err) {
                    toast.error('Image upload failed');
                    console.error('RichTextEditor Image Upload Error:', err);
                } finally {
                    if (onLoadingStateChange) onLoadingStateChange(false);
                }
            }
        };
    }, [onLoadingStateChange]);

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ 'font': FONT_WHITELIST }, { 'size': SIZE_WHITELIST }],
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'align': [] }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: imageHandler
            }
        }
    }), [imageHandler]);

    // Attach markdown shortcut handling after the underlying Quill instance
    // is mounted. quilljs-markdown is not a Quill Module in the
    // Quill.register sense — it's a wrapper that attaches its own text-change
    // listener to the editor — so we bolt it on imperatively via a ref.
    //
    // Shortcuts it installs:
    //   # ␣         → H1       (##, ###, ... → H2..H6)
    //   **text**    → bold
    //   *text*      → italic
    //   ~~text~~    → strikethrough
    //   `code`      → inline code
    //   - ␣ or * ␣  → bullet list
    //   1. ␣        → ordered list
    //   > ␣         → blockquote
    //   ---         → horizontal rule
    //   [label](url) → link
    useEffect(() => {
        const editor = quillRef.current?.getEditor();
        if (!editor) return;
        const md = new QuillMarkdown(editor, {});
        return () => {
            if (md && typeof md.destroy === 'function') {
                md.destroy();
            }
        };
    }, []);

    return (
        <ReactQuill
            ref={quillRef}
            theme="snow"
            value={value}
            onChange={onChange}
            modules={modules}
            placeholder={placeholder}
            className={className}
        />
    );
};
