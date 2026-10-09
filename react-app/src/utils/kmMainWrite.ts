import { kmService } from '../services/kmService';
import type { KMArticleCreate, KMArticleUpdate } from '../types/km';

/** One modal session: remember a confirmed main write even if later chapters fail. */
export interface KMMainWriteState {
    id: string | null;
    versionNo?: number;
}

export async function writeKMMain(state: KMMainWriteState, payload: KMArticleCreate | KMArticleUpdate) {
    const saved = state.id
        ? await kmService.update(state.id, { ...payload, version_no: state.versionNo })
        : await kmService.create(payload as KMArticleCreate);
    state.id = saved.id;
    state.versionNo = saved.version_no;
    return saved;
}
