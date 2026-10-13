// OBS photo pairing order (OBS-PRINT-PHOTOS-2026-001). Before photo n is paired with After photo n — on the Photos tab
// and on the print — so the order of each column decides the pairs. The user's order is stored on the record as
// photoOrder = { defectPhoto: [key, ...], improvementPhoto: [key, ...] }:
//   att:<attachment id>      a stored (uploaded) photo
//   legacy:<hash>:<k>        a legacy photo — a data: URL kept in the record's own defectPhotos / improvementPhotos JSON.
//                            <hash> is FNV-1a of the string, <k> its k-th occurrence, so removing one legacy photo never
//                            shifts the keys of the others (an array index would).
// Photos the stored order does not name (none saved yet, new uploads) follow in the default order: legacy first (always
// older than any upload), then uploads first-upload-first. Keys of photos that no longer exist are ignored.
import type { AttachmentInfo } from '../services/api';
import { oldestFirst } from './attachmentOrder';

export type PhotoCategory = 'defectPhoto' | 'improvementPhoto';
export type PhotoOrder = Partial<Record<PhotoCategory, string[]>>;

export interface OrderedPhoto {
    key: string;
    /** As stored: the data: URL of a legacy photo, the file_url of an upload (not yet authenticated). */
    src: string;
    name: string;
    /** Set for an uploaded photo. */
    stored?: AttachmentInfo;
    /** Set for a legacy photo: its position among the record's legacy entries. */
    legacyIndex?: number;
}

/** FNV-1a (32-bit) of a string, 8 hex digits. Synchronous and stable across browsers. */
export const fnv1a = (s: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
};

// Legacy photos are data: URLs (often hundreds of KB) and the form re-renders on every keystroke: remember each hash.
const HASH_CACHE = new Map<string, string>();
const HASH_CACHE_MAX = 40;                     // legacy data: URLs can be large; a record has only a few
const cachedHash = (src: string): string => {
    let h = HASH_CACHE.get(src);
    if (h === undefined) {
        h = fnv1a(src);
        if (HASH_CACHE.size >= HASH_CACHE_MAX) HASH_CACHE.clear();
        HASH_CACHE.set(src, h);
    }
    return h;
};

export const legacyKeys = (legacy: readonly string[]): string[] => {
    const seen = new Map<string, number>();
    return legacy.map((src) => {
        const h = cachedHash(src);
        const k = seen.get(h) ?? 0;
        seen.set(h, k + 1);
        return `legacy:${h}:${k}`;
    });
};

export const storedKey = (file: Pick<AttachmentInfo, 'id'>): string => `att:${file.id}`;

/** One column in pairing order: the saved keys first (in their order), then everything else in the default order. */
export const orderPhotos = (legacy: readonly string[], stored: readonly AttachmentInfo[], saved?: readonly string[] | null): OrderedPhoto[] => {
    const keys = legacyKeys(legacy);
    const base: OrderedPhoto[] = [
        ...legacy.map((src, i) => ({ key: keys[i], src, name: `Legacy ${i + 1}`, legacyIndex: i })),
        ...oldestFirst(stored).map((f) => ({ key: storedKey(f), src: f.file_url, name: f.file_name, stored: f })),
    ];
    if (!saved || saved.length === 0) return base;
    const byKey = new Map(base.map((p) => [p.key, p]));
    const first: OrderedPhoto[] = [];
    for (const k of saved) {
        const p = byKey.get(k);
        if (p && !first.includes(p)) first.push(p);
    }
    return [...first, ...base.filter((p) => !first.includes(p))];
};

/** The keys with `key` moved one place up (-1) or down (+1); unchanged at either end or when the key is unknown. */
export const moveKey = (keys: readonly string[], key: string, delta: -1 | 1): string[] => {
    const i = keys.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= keys.length) return [...keys];
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
};
