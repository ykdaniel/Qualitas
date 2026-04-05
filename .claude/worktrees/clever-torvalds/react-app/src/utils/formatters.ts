/**
 * 共用格式化工具函式
 * Shared formatting utility functions
 */

/**
 * 將時間字串格式化為 24 小時制 (HH:MM)
 * @param timeStr - 時間字串
 * @returns 格式化後的時間字串
 */
export const formatTime24h = (timeStr: string | undefined): string => {
    if (!timeStr) return '-';
    const match = timeStr.match(/^(\d{1,2}):(\d{1,2})/);
    if (match) {
        const hours = match[1].padStart(2, '0');
        const minutes = match[2].padStart(2, '0');
        return `${hours}:${minutes}`;
    }
    return timeStr;
};

/**
 * 將日期格式化為 ISO 格式 (YYYY-MM-DD)
 * @param date - Date 物件或日期字串
 * @returns 格式化後的日期字串
 */
export const formatDateISO = (date: Date | string | undefined): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
};

/**
 * 將日期格式化為本地化顯示格式
 * @param date - Date 物件或日期字串
 * @param locale - 語言設定 (預設 'zh-TW')
 * @returns 格式化後的日期字串
 */
export const formatDateLocale = (
    date: Date | string | undefined,
    locale: string = 'zh-TW'
): string => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(locale);
};

/**
 * 計算百分比並格式化
 * @param numerator - 分子
 * @param denominator - 分母
 * @param decimalPlaces - 小數位數 (預設 0)
 * @returns 格式化後的百分比數值
 */
export const calculatePercentage = (
    numerator: number,
    denominator: number,
    decimalPlaces: number = 0
): number => {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 100 * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
};

/**
 * 取得本地化狀態文字
 * @param status - 狀態字串
 * @param t - 翻譯函式
 * @param prefix - 翻譯鍵前綴 (如 'noi', 'ncr')
 * @returns 本地化後的狀態文字
 */
export const getLocalizedStatus = (
    status: string | undefined,
    t: (key: string) => string,
    prefix: string = 'common'
): string => {
    const s = (status || 'Open').toLowerCase();

    // 優先使用模組專屬翻譯
    const statusMap: Record<string, string> = {
        'open': `${prefix}.status.open`,
        'closed': `${prefix}.status.closed`,
        'under review': `${prefix}.status.underReview`,
        'reject': `${prefix}.status.reject`,
        'approved': `${prefix}.status.approved`,
        'pending': `${prefix}.status.pending`,
        'in progress': `${prefix}.status.inProgress`,
        'planned': `${prefix}.status.planned`,
        'completed': `${prefix}.status.completed`,
    };

    const key = statusMap[s];
    if (key) {
        const translated = t(key);
        // 如果翻譯失敗（返回原 key），嘗試使用 common 前綴
        if (translated !== key) return translated;

        const commonKey = `common.status.${s.replace(' ', '')}`;
        const commonTranslated = t(commonKey);
        if (commonTranslated !== commonKey) return commonTranslated;
    }

    return status || t('common.status.open') || 'Open';
};

/**
 * 產生唯一 ID
 * @returns 唯一 ID 字串
 */
export const generateUniqueId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 截斷文字並加上省略號
 * @param text - 原始文字
 * @param maxLength - 最大長度
 * @returns 截斷後的文字
 */
export const truncateText = (text: string, maxLength: number): string => {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength - 3) + '...';
};

/**
 * 檢查字串是否為空或只有空白
 * @param str - 要檢查的字串
 * @returns 是否為空
 */
export const isEmpty = (str: string | undefined | null): boolean => {
    return !str || str.trim().length === 0;
};
