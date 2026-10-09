export const getNextRevision = (currentRev: string): string => {
    if (!currentRev) return 'A';

    // Handle "Rev X.Y" format (e.g., for PQP)
    const revMatch = currentRev.match(/^Rev(\d+)\.(\d+)$/);
    if (revMatch) {
        const major = parseInt(revMatch[1], 10);
        return `Rev${major + 1}.0`;
    }

    // Handle single letter (A -> B -> C ...)
    const letterMatch = currentRev.match(/^[A-Za-z]+$/);
    if (letterMatch) {
        const charCode = currentRev.charCodeAt(0);
        // Simple increment for single char, logic can be expanded for AA, AB etc if needed.
        // For now assuming A-Z range is sufficient for typical revisions.
        if (currentRev === 'Z') return 'AA';
        return String.fromCharCode(charCode + 1);
    }

    // Default fallback: append " (Rev)" if format is unknown
    return `${currentRev} (Rev)`;
};
