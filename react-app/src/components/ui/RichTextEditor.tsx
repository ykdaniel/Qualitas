import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import QuillMarkdown from 'quilljs-markdown';
// NOTE: quilljs-markdown ships a `common-style.css` that we intentionally
// DO NOT import. That file sets `display: list-item; list-style: disc` on
// `.ql-editor ul li::before`, which makes the pseudo render a browser disc
// marker in addition to its `content`, and also injects up-to-100 levels
// of indent styling that we don't use. The markdown *shortcuts* are pure
// JS (QuillMarkdown attaches a text-change listener and rewrites Deltas
// into Quill's native formats — bold, italic, lists, headings, etc.), so
// the visual styling comes from Quill's own snow theme + our rules in
// RichTextEditor.css. Dropping the import lets us style bullet markers
// via plain `content` without an `!important` war.
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
// Minimal font whitelist: Calibri (English default) + 微軟正黑體 (Chinese
// default). The CSS font-family declaration on .ql-editor uses both as a
// fallback chain, so English glyphs pick up Calibri automatically and
// Chinese glyphs fall through to 微軟正黑體 without any per-character
// tagging. Users can still explicitly switch the whole selection via the
// font dropdown.
const FONT_WHITELIST = [
    'calibri',
    'ms-jhenghei',    // 微軟正黑體
];

// Use pt (points) instead of px to match Word conventions.
// 12pt is the standard Word default and renders at ~16px on screen.
const SIZE_WHITELIST = [
    '8pt', '9pt', '10pt', '10.5pt', '11pt', '12pt', '14pt', '16pt',
    '18pt', '20pt', '22pt', '24pt', '26pt', '28pt', '36pt', '48pt', '72pt',
];

const LINE_HEIGHT_WHITELIST = [
    '1', '1.2', '1.5', '1.8', '2', '2.5', '3',
];

// Extend Quill's font format. Using `true` as the second arg to
// Quill.register REPLACES the existing format, which is what we want.
const FontFormat = Quill.import('formats/font') as { whitelist: string[] };
FontFormat.whitelist = FONT_WHITELIST;
Quill.register(FontFormat as unknown as Parameters<typeof Quill.register>[0], true);

// IMPORTANT: use the STYLE attributor (not the default class attributor)
// for font size. The class attributor produces markup like
// <span class="ql-size-24px">…</span> and relies on a matching CSS rule
// .ql-size-24px { font-size: 24px } for every whitelist entry. The style
// attributor produces <span style="font-size:24px">…</span> directly, so
// arbitrary px values work without adding per-size CSS rules.
const SizeStyle = Quill.import('attributors/style/size') as { whitelist: string[] };
SizeStyle.whitelist = SIZE_WHITELIST;
Quill.register(SizeStyle as unknown as Parameters<typeof Quill.register>[0], true);

// Line-height: use Parchment's StyleAttributor to produce inline
// style="line-height:1.5" on the block element. This avoids the class
// approach and works out of the box with any whitelist value.
const Parchment = Quill.import('parchment') as any;
const LineHeightStyle = new Parchment.Attributor.Style(
    'lineHeight',     // internal format name
    'line-height',    // CSS property
    {
        scope: Parchment.Scope.BLOCK,
        whitelist: LINE_HEIGHT_WHITELIST,
    }
);
Quill.register(LineHeightStyle, true);

// Custom inline embed for a soft line break (<br>). Quill's default
// Parchment model doesn't expose <br> as an insertable format — a `\n`
// in the Delta means "new block" (new list item inside an <ol>), not
// "visual line break". Registering a Break embed lets us insertEmbed
// the caret position with a <br>, which renders inside the current
// <li> instead of splitting it. Used by the soft-break-in-list
// keyboard binding below to support bilingual "中文<br>English" items.
const EmbedBlot = Quill.import('blots/embed') as any;
class SoftBreakBlot extends EmbedBlot {}
SoftBreakBlot.blotName = 'softbreak';
SoftBreakBlot.tagName = 'br';
Quill.register(SoftBreakBlot as unknown as Parameters<typeof Quill.register>[0], true);

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
                [{ 'align': [] }, { 'lineHeight': LINE_HEIGHT_WHITELIST }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'indent': '-1' }, { 'indent': '+1' }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: imageHandler
            }
        },
        // Clipboard matcher: when Quill parses HTML on load (or paste),
        // map every <br> to a softbreak embed instead of the default
        // newline character. The default behaviour converts <br> to '\n'
        // in the Delta — and a '\n' inside a list block means "new list
        // item", which would split bilingual <li>中文<br>English</li>
        // entries into two separate items on every reload. The matcher
        // emits the SoftBreakBlot embed registered above so the round
        // trip stays stable: HTML <br> ↔ Delta {softbreak:true}.
        clipboard: {
            matchers: [
                ['br', (_node: any, _delta: any) => {
                    const Delta = Quill.import('delta') as any;
                    return new Delta().insert({ softbreak: true });
                }],
            ],
        },
        // Quill's default Shift+Enter inside an <ol>/<ul> breaks to a new
        // list item instead of inserting a soft <br>. We intercept it
        // and insert the SoftBreakBlot embed at the caret so the
        // current list item picks up an inline <br> on the next line.
        // Plain Enter still splits to a new list item like normal.
        keyboard: {
            bindings: {
                'soft-break-in-list': {
                    key: 13,
                    shiftKey: true,
                    format: ['list'],
                    handler(this: any, range: { index: number; length: number }) {
                        const quill = this.quill;
                        quill.insertEmbed(range.index, 'softbreak', true, 'user');
                        quill.setSelection(range.index + 1, 0, 'user');
                        return false;
                    },
                },
            },
        },
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
