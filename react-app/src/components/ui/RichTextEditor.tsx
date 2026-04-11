import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import QuillMarkdown from 'quilljs-markdown';
import 'quilljs-markdown/dist/quilljs-markdown-common-style.css';
import { kmService } from '../../services/kmService';

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
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                ['bold', 'italic', 'underline', 'strike'],
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
