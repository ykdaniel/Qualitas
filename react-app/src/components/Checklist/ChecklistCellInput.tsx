import React from 'react';
import AutoGrowTextarea from '../Audit/AutoGrowTextarea';
import styles from './Checklist.module.css';

/**
 * One editable cell of the Checklist items table (Item / Criteria / Actual Situation). Grows with its text so long
 * criteria are shown in full instead of being cut off (CHECKLIST-TEMPLATE-LAYOUT-2026-001).
 *
 * The text only WRAPS: Enter does not add a line break and pasted line breaks become spaces (user 2026-10-12), because
 * the print layout and the ITR snapshot show these fields as one paragraph. Line breaks already in older data are kept
 * and shown. Enter that confirms an IME candidate (Chinese input) is left alone.
 */
export default function ChecklistCellInput({ value, onChange, placeholder, bold = false }: {
    value: string | undefined;
    onChange: (value: string) => void;
    placeholder?: string;
    bold?: boolean;
}) {
    const text = value ?? '';

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) e.preventDefault();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pasted = e.clipboardData.getData('text');
        if (!/[\r\n]/.test(pasted)) return;
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart, selectionEnd } = el;
        const flat = pasted.replace(/\s*[\r\n]+\s*/g, ' ');
        // slice the box's own value: the selection indexes it, and a textarea turns an old \r\n into \n
        onChange(el.value.slice(0, selectionStart) + flat + el.value.slice(selectionEnd));
        const caret = selectionStart + flat.length;
        requestAnimationFrame(() => el.setSelectionRange(caret, caret));
    };

    return (
        <AutoGrowTextarea
            rows={1}
            className={`${styles.cellInput} ${bold ? styles.cellInputBold : ''}`}
            value={text}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
        />
    );
}
