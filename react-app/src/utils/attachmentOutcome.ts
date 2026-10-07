/**
 * Per-item classification of a batch of attachment deletes, used by PQP/ITP's save flow
 * (2026-09-25/28) to prune only what one attempt actually confirmed, instead of clearing or
 * keeping a delete/upload queue wholesale on retry.
 *
 * A DELETE can come back three ways, and only one of them is safe to treat as done:
 *   - fulfilled              -> confirmed deleted, safe to drop from the retry queue.
 *   - rejected, HTTP 404     -> ambiguous (already deleted / never existed / out of scope are all
 *                               indistinguishable from here) — NOT treated as success, stays
 *                               queued. A genuinely-already-deleted id can never resolve itself
 *                               this way; that is a known, documented limitation, not a bug this
 *                               function is meant to paper over.
 *   - rejected, no response  -> the request may have reached the server and succeeded there for
 *                               all this code can tell — also NOT treated as success, stays
 *                               queued, reported with different wording than the 404 case so the
 *                               two distinct "unknown" situations are never conflated.
 */
export interface DeleteClassification {
    deletedIds: string[];
    errors: string[];
}

function deleteErrorMessage(fileId: string, reason: unknown): string {
    const r = reason as { response?: { status?: number; data?: { detail?: string } }; message?: string } | undefined;
    const status = r?.response?.status;
    if (status === 404) {
        return `附件 ${fileId}：找不到該筆附件（可能已被刪除，或不在目前可存取範圍內，狀態不明）。此狀態無法靠再次按「儲存」自動解決；若需要關閉並重新開啟這筆紀錄以跳脫，目前尚未儲存的欄位修改與其他待處理的附件操作都會遺失`;
    }
    if (status === undefined) {
        return `附件 ${fileId}：刪除請求未收到回應（網路中斷），結果不明`;
    }
    const detail = r?.response?.data?.detail || r?.message;
    return `附件 ${fileId}：${detail || '刪除失敗'}`;
}

export function classifyDeleteResults(
    fileIds: string[],
    results: PromiseSettledResult<unknown>[],
): DeleteClassification {
    const deletedIds: string[] = [];
    const errors: string[] = [];
    results.forEach((result, i) => {
        const fileId = fileIds[i];
        if (result.status === 'fulfilled') {
            deletedIds.push(fileId);
        } else {
            errors.push(deleteErrorMessage(fileId, result.reason));
        }
    });
    return { deletedIds, errors };
}

/** True once `payload` is byte-identical (by JSON key) to the last one actually written —
 * the caller should skip re-sending the record write and reuse the previous outcome's id. A
 * retry with ANY changed field gets a different key and is never skipped. */
export function isUnchangedSincePriorWrite(payload: unknown, lastWrittenPayloadKey: string | null): { key: string; skip: boolean } {
    const key = JSON.stringify(payload);
    return { key, skip: key === lastWrittenPayloadKey };
}
