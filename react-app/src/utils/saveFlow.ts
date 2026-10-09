/**
 * The save chain of a record modal (NCR / OBS / NOI), as one pure, testable function.
 *
 * A modal save is really up to four steps: write the record, delete removed files, upload new files, reload the list. They fail
 * independently and mean different things to the user:
 *   - the record write fails      -> nothing was saved, the modal must stay open with everything the user typed;
 *   - a later step fails          -> the record IS saved; say so, keep only the leftover work, and never create the record again;
 *   - only the reload fails       -> everything is saved, the list may just be stale.
 * The page returns a SaveOutcome and the modal closes only for a complete outcome. (2026-09-20)
 */

export interface UploadGroup {
    category: string;
    files: File[];
}

export interface SaveFailure {
    step: 'upload' | 'delete';
    /** upload category (defectPhoto, attachment, ...) — absent for deletes */
    category?: string;
    /** already user-friendly (produced by `describe`) */
    message: string;
}

export type SaveOutcome =
    /** everything done — the modal may close */
    | { status: 'saved' }
    /** record and files are stored; only the list reload failed — nothing left to retry, the modal may close with a warning */
    | { status: 'saved-reload-failed'; id: string }
    /** the record is stored but some file work failed — keep the modal open, retry only what is left */
    | {
        status: 'saved-incomplete';
        id: string;
        failures: SaveFailure[];
        remainingUploads: UploadGroup[];
        remainingDeletes: string[];
        /** categories whose upload went through (their pending files must be dropped) */
        uploadedCategories: string[];
        /** what the server returned for each successful upload, by category */
        uploaded: Record<string, unknown[]>;
        reloadFailed: boolean;
    }
    /** the record was not saved — keep the modal open, keep everything */
    | { status: 'failed'; message: string };

export interface SaveFlowSteps {
    /** Writes the record and returns its id. Not called when `reuseId` is given. */
    writeRecord: () => Promise<string>;
    /** The record was already written by an earlier attempt with identical content: only finish the leftover work. */
    reuseId?: string | null;
    uploads: UploadGroup[];
    deletedFileIds: string[];
    upload: (id: string, group: UploadGroup) => Promise<unknown[]>;
    remove: (fileId: string) => Promise<void>;
    /** Reloads the list; false (or a throw) means the reload failed. */
    reload: () => Promise<boolean>;
    describe: (error: unknown) => string;
    /** Called as soon as the record id is known, before any follow-up step. */
    onRecordSaved?: (id: string) => void;
}

export async function runSaveFlow(s: SaveFlowSteps): Promise<SaveOutcome> {
    let id: string;
    if (s.reuseId) {
        id = s.reuseId;
    } else {
        try {
            id = await s.writeRecord();
        } catch (e) {
            return { status: 'failed', message: s.describe(e) };
        }
    }
    s.onRecordSaved?.(id);

    const failures: SaveFailure[] = [];
    const remainingDeletes: string[] = [];
    const remainingUploads: UploadGroup[] = [];
    const uploaded: Record<string, unknown[]> = {};
    const uploadedCategories: string[] = [];

    for (const fileId of [...new Set(s.deletedFileIds)]) {
        try {
            await s.remove(fileId);
        } catch (e) {
            remainingDeletes.push(fileId);
            failures.push({ step: 'delete', message: s.describe(e) });
        }
    }

    for (const group of s.uploads) {
        if (group.files.length === 0) continue;
        if (!id) {
            remainingUploads.push(group);
            continue;
        }
        try {
            uploaded[group.category] = await s.upload(id, group);
            uploadedCategories.push(group.category);
        } catch (e) {
            remainingUploads.push(group);
            failures.push({ step: 'upload', category: group.category, message: s.describe(e) });
        }
    }

    let reloadOk = true;
    try {
        reloadOk = await s.reload();
    } catch {
        reloadOk = false;
    }

    if (failures.length > 0 || remainingUploads.length > 0) {
        return { status: 'saved-incomplete', id, failures, remainingUploads, remainingDeletes, uploadedCategories, uploaded, reloadFailed: !reloadOk };
    }
    return reloadOk ? { status: 'saved' } : { status: 'saved-reload-failed', id };
}

/** Same content as the write that already succeeded? Then a retry must not write (or lock-check) the record again. */
export const sameWrite = (last: { id: string; key: string } | null, id: string | null | undefined, payload: unknown): boolean =>
    !!last && !!id && last.id === id && last.key === JSON.stringify(payload);

/** What is still owed after a "saved, but a file step failed" outcome — shown to the user and kept until it is done. */
export interface FollowUp {
    id: string;
    /** the record was created by this very save (as opposed to updated) */
    created: boolean;
    categories: string[];
    deletes: number;
    failures: SaveFailure[];
    reloadFailed: boolean;
}

export const followUpOf = (outcome: SaveOutcome, created: boolean): FollowUp | null =>
    outcome.status === 'saved-incomplete'
        ? { id: outcome.id, created, categories: [...new Set(outcome.remainingUploads.map(g => g.category))], deletes: outcome.remainingDeletes.length, failures: outcome.failures, reloadFailed: outcome.reloadFailed }
        : null;
