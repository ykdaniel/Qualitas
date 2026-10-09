/**
 * Section-level Table of Contents extraction.
 *
 * Given a KM chapter's HTML content, find paragraphs that LOOK LIKE
 * section headings by pattern matching (rather than relying on H1/H2/H3
 * tags that Word documents almost never carry), inject stable anchor ids
 * onto those elements, and return both the updated HTML and a flat list
 * of TOC entries that the UI can render.
 *
 * Supported section patterns:
 *  - Dotted decimal, any depth:  "1.0 目的", "5.1 規劃", "5.1.1 流程"
 *  - Chinese chapter:            "第一章 品質政策", "第 2 章 範圍"
 *  - English chapter/section:    "Chapter 1 Introduction", "Section 3 Audit"
 *
 * This runs entirely in the browser and has no dependency on mammoth or
 * Quill — it works on any HTML string, so the resulting feature covers
 * every chapter, regardless of whether it was imported from Word, typed
 * directly in Quill, or pasted from another source.
 */

export interface SectionTocEntry {
    /** Anchor id injected into the DOM so scrollIntoView can target it. */
    id: string;
    /** Nesting depth. 1 = top-level, 2 = sub-section, 3 = sub-sub, ... */
    level: number;
    /** Raw section number string, e.g. "1.0", "5.1", "第一章", "Chapter 2". */
    number: string;
    /** Human-readable title with the number stripped. */
    title: string;
}

export interface SectionTocResult {
    /** HTML with id attributes injected on the detected heading elements. */
    processedHtml: string;
    /** Flat list of detected headings in document order. */
    toc: SectionTocEntry[];
}

interface PatternMatch {
    number: string;
    title: string;
    level: number;
}

/**
 * "1.0", "5.1", "5.1.1" — the most common scheme in technical documents.
 *
 * Level rules:
 *  - "1"      → level 1
 *  - "1.0"    → level 1  (trailing .0 is cosmetic)
 *  - "1.1"    → level 2
 *  - "1.1.1"  → level 3
 */
export function computeNumberedLevel(number: string): number {
    const parts = number.split('.');
    while (parts.length > 1 && parts[parts.length - 1] === '0') {
        parts.pop();
    }
    return Math.max(1, parts.length);
}

/**
 * Strip trailing ".0" segments from a dotted-decimal chapter number so
 * it can be used as a prefix for sub-item numbering.
 *
 *   "1.0"     → "1"       (then list items become "1.1", "1.2", ...)
 *   "1.1"     → "1.1"     (list items become "1.1.1", "1.1.2", ...)
 *   "2.0.0"   → "2"
 *   "第一章"   → "第一章"  (unchanged — non-numeric)
 *   ""        → ""
 */
export function stripDecorativeZeros(number: string): string {
    if (!number) return '';
    const parts = number.split('.');
    while (parts.length > 1 && parts[parts.length - 1] === '0') {
        parts.pop();
    }
    return parts.join('.');
}

/**
 * Compare two chapter numbers numerically segment-by-segment.
 *
 * String localeCompare on dotted-decimal numbers misbehaves once any
 * segment crosses 10 — "10.0" sorts before "2.0" because the strings
 * are compared char-by-char. We split on '.', parse each segment as
 * an integer, and compare. Non-numeric segments fall through to the
 * raw string compare so labels like "第一章" still produce a stable
 * (if arbitrary) order.
 *
 * Empty / null / undefined sort first.
 */
export function compareChapterNo(
    a: string | null | undefined,
    b: string | null | undefined,
): number {
    const sa = a || '';
    const sb = b || '';
    if (!sa && !sb) return 0;
    if (!sa) return -1;
    if (!sb) return 1;

    const partsA = sa.split('.');
    const partsB = sb.split('.');
    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
        const segA = partsA[i] ?? '';
        const segB = partsB[i] ?? '';
        const numA = parseInt(segA, 10);
        const numB = parseInt(segB, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            if (numA !== numB) return numA - numB;
        } else {
            const cmp = segA.localeCompare(segB);
            if (cmp !== 0) return cmp;
        }
    }
    return 0;
}

function tryNumberedPattern(text: string): PatternMatch | null {
    // Require: numeric prefix, whitespace, at least one non-numeric char
    // following. Cap the total line length so we don't grab whole paragraphs
    // that happen to start with a number.
    const m = text.match(/^(\d+(?:\.\d+)*)\s+(\S.{0,150}?)$/);
    if (!m) return null;

    const number = m[1];
    let title = m[2].trim();

    // Strip a trailing "page number" (1–4 digits at end, preceded by space).
    // Word TOC entries look like "1.0 目的 Purpose 3" — the "3" is a page
    // number that shouldn't appear in the TOC label.
    title = title.replace(/\s+\d{1,4}\s*$/, '').trim();

    if (!title) return null;
    return { number, title, level: computeNumberedLevel(number) };
}

function tryChineseChapterPattern(text: string): PatternMatch | null {
    // "第一章 品質政策", "第 2 章 範圍" — flexible whitespace inside the 第…章
    // marker. Accepts Chinese numerals, Arabic numerals, or mixed.
    const m = text.match(/^(第\s*[一二三四五六七八九十百零〇\d]+\s*章)\s*(\S.{0,150}?)$/);
    if (!m) return null;

    let title = m[2].trim();
    title = title.replace(/\s+\d{1,4}\s*$/, '').trim();
    if (!title) return null;

    const number = m[1].replace(/\s+/g, '');
    return { number, title, level: 1 };
}

function tryEnglishChapterPattern(text: string): PatternMatch | null {
    // "Chapter 1 Introduction", "Section 3.2 Audit", "Article 5: Scope"
    const m = text.match(
        /^(Chapter|Section|Article|Part)\s+(\d+(?:\.\d+)*)\s*[:.—-]?\s*(\S.{0,150}?)$/i
    );
    if (!m) return null;

    let title = m[3].trim();
    title = title.replace(/\s+\d{1,4}\s*$/, '').trim();
    if (!title) return null;

    const number = `${m[1]} ${m[2]}`;
    const level = computeNumberedLevel(m[2]);
    return { number, title, level };
}

function cleanInlineText(html: string): string {
    // Convert inline markup to whitespace-separated plain text so that
    // "<strong>1.0</strong> 目的" becomes "1.0 目的".
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectHeading(text: string): PatternMatch | null {
    if (!text || text.length < 2 || text.length > 300) return null;
    return (
        tryNumberedPattern(text)
        || tryChineseChapterPattern(text)
        || tryEnglishChapterPattern(text)
    );
}

/**
 * Parse the given HTML, inject anchor ids on detected heading elements,
 * and return the updated HTML + flat TOC list.
 *
 * - Walks <p>, <li>, and <h1>..<h6>. <li> is included because Word often
 *   converts numbered section lists into <ol><li> blocks.
 * - Entries with duplicate section numbers are de-duplicated (the first
 *   occurrence wins — typically the front-of-doc TOC entry, which is still
 *   a valid scroll target).
 * - Anchor ids are prefixed so multiple chapters in the same page don't
 *   collide.
 */
export function extractSectionToc(
    html: string,
    idPrefix = 'sec'
): SectionTocResult {
    if (!html || !html.trim()) {
        return { processedHtml: html, toc: [] };
    }

    let doc: Document;
    try {
        doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    } catch {
        return { processedHtml: html, toc: [] };
    }

    const root = doc.body.firstElementChild;
    if (!root) {
        return { processedHtml: html, toc: [] };
    }

    const candidates = root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
    const toc: SectionTocEntry[] = [];
    const seen = new Set<string>();
    let seq = 0;

    candidates.forEach((el) => {
        const text = cleanInlineText(el.innerHTML || '');
        const match = detectHeading(text);
        if (!match) return;

        // Skip duplicate section numbers (e.g., the same "1.0" appearing in
        // both the front-of-doc TOC and the actual body section).
        if (seen.has(match.number)) return;
        seen.add(match.number);

        seq += 1;
        const id = `${idPrefix}-${seq}`;
        el.setAttribute('id', id);

        toc.push({
            id,
            level: match.level,
            number: match.number,
            title: match.title,
        });
    });

    return {
        processedHtml: root.innerHTML,
        toc,
    };
}
