import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * A textarea that grows with its text, so a long requirement text or a multi-line audit question is shown in full
 * without an inner scrollbar (user 2026-10-11: "文字欄要自動調整"). Starts at `rows` lines; the user can still drag it
 * taller (resize-y).
 */
export default function AutoGrowTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const fit = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight + 2}px`;   // + the 1px top / bottom border
    }, []);
    useLayoutEffect(fit, [props.value, fit]);
    // a narrower box wraps into more lines: re-measure on width changes too (R2 review), else the text is cut off
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        let width = el.clientWidth;
        const ro = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
        ro.observe(el);
        return () => ro.disconnect();
    }, [fit]);
    return <textarea ref={ref} {...props} style={{ overflow: 'hidden', ...props.style }} />;
}
