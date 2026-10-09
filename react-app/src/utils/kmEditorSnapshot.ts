import { kmService } from '../services/kmService';

/** Fail closed: an unavailable list is not an article with zero chapters. */
export async function loadKMEditorSnapshot(id: string) {
    const articles = await kmService.getAll({ limit: 9999 });
    const article = articles.find(item => item.id === id);
    if (!article) throw new Error('KM article unavailable');
    return { article, children: articles.filter(item => item.parent_id === id) };
}
