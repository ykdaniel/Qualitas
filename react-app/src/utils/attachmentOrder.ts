// Upload order for attachment lists. /api/files/by-entity answers newest first (uploaded_at DESC, file_router.py);
// OBS shows and prints its photos in the order they were added — first upload first (OBS-PRINT-PHOTOS-2026-001).
// Compares uploaded_at as plain strings, the same key and comparison the server sorts by (SQLite text order). The sort
// is stable: files with the same timestamp keep the order they arrived in (each upload stamps its own time, so in
// practice timestamps differ).

export const oldestFirst = <T extends { uploaded_at: string }>(list: readonly T[]): T[] =>
    [...list].sort((a, b) => (a.uploaded_at < b.uploaded_at ? -1 : a.uploaded_at > b.uploaded_at ? 1 : 0));
