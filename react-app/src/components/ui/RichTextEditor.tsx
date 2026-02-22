import React, { useRef, useCallback, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
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
                    alert('Image upload failed');
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
