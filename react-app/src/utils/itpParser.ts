import type { InspectionItem } from '../types/itp';

/**
 * Normalize a bilingual field: extract only { en, ch } from potentially
 * polluted objects that contain numeric index keys (e.g. {'0':'D','1':'r',...,'en':'...'}).
 */
const normalizeBilingual = (val: unknown, fallbackEn = '', fallbackCh = ''): { en: string; ch: string } => {
    if (typeof val === 'string') return { en: val, ch: '' };
    if (val && typeof val === 'object' && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;
        return { en: String(obj.en ?? fallbackEn), ch: String(obj.ch ?? fallbackCh) };
    }
    return { en: fallbackEn, ch: fallbackCh };
};

const normalizeItem = (item: Record<string, unknown>, phase: string): InspectionItem => {
    return {
        ...item,
        phase,
        id: (item.id as string) || `${phase}1`,
        activity: normalizeBilingual(item.activity),
        standard: normalizeBilingual(item.standard),
        checkTime: normalizeBilingual(item.checkTime),
        method: normalizeBilingual(item.method),
        frequency: normalizeBilingual(item.frequency),
        criteria: Array.isArray(item.criteria)
            ? item.criteria.map((c: unknown) =>
                typeof c === 'string' ? { en: c, ch: '' } : normalizeBilingual(c))
            : typeof item.criteria === 'string'
                ? [{ en: item.criteria, ch: '' }]
                : [],
        vp: item.vp || { sub: '', teco: '', employer: '', hse: '' },
        record: (item.record as string) || '',
    } as unknown as InspectionItem;
};

export const parseInspectionItems = (detailData: unknown): InspectionItem[] => {
    if (!detailData) return [];

    let data = detailData;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            console.error("Failed to parse detail_data", e);
            return [];
        }
    }

    const parsedItems: InspectionItem[] = [];

    if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Handle phased data format { a: [], b: [], c: [] }
        const typedData = data as Record<string, unknown>;
        ['a', 'b', 'c'].forEach((phaseKey) => {
            if (Array.isArray(typedData[phaseKey])) {
                parsedItems.push(...typedData[phaseKey].map((item) =>
                    normalizeItem(item as Record<string, unknown>, phaseKey.toUpperCase())
                ));
            }
        });
    } else if (Array.isArray(data)) {
        parsedItems.push(...data.map((item, index) => {
            const typedItem = item as Record<string, unknown>;
            return normalizeItem(typedItem, (typedItem.phase as string) || 'A');
        }));
    }

    return parsedItems;
};
