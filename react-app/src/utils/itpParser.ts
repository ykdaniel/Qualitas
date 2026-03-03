import type { InspectionItem } from '../types/itp';

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
                parsedItems.push(...typedData[phaseKey].map((item) => ({
                    ...(item as Record<string, unknown>),
                    phase: phaseKey.toUpperCase()
                })) as InspectionItem[]);
            }
        });
    } else if (Array.isArray(data)) {
        // Convert simple array to items, default to Phase A if missing
        parsedItems.push(...data.map((item, index) => {
            const typedItem = item as Record<string, unknown>;
            return {
                ...typedItem,
                id: (typedItem.id as string) || `A${index + 1}`,
                phase: (typedItem.phase as string) || 'A',
                // Ensure other required fields exist
                activity: typeof typedItem.activity === 'object' && typedItem.activity !== null ? typedItem.activity : { en: (typedItem.activity as string) || '', ch: '' },
                checkTime: typeof typedItem.checkTime === 'object' && typedItem.checkTime !== null ? typedItem.checkTime : { en: (typedItem.checkTime as string) || '', ch: '' },
                method: typeof typedItem.method === 'object' && typedItem.method !== null ? typedItem.method : { en: (typedItem.method as string) || '', ch: '' },
                vp: typedItem.vp || { sub: '', teco: '', employer: '', hse: '' }
            } as unknown as InspectionItem;
        }));
    }

    return parsedItems;
};
