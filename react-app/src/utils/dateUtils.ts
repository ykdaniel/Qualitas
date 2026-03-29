
/**
 * Adds 7 working days to a given date string (YYYY-MM-DD).
 * Skips Saturdays and Sundays.
 * @param dateStr Date string in YYYY-MM-DD format
 * @returns New date string in YYYY-MM-DD format
 */
export const addSevenWorkingDays = (dateStr: string): string => {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    let count = 0;
    while (count < 7) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay();
        // 0 = Sunday, 6 = Saturday
        if (day !== 0 && day !== 6) {
            count++;
        }
    }

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};
