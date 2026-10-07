/** Quill represents an empty editor as an empty paragraph; that is not a user edit. */
export function kmDraftKey(formData: unknown, chapters: Array<{ content: string }>) {
    return JSON.stringify({ formData, chapters: chapters.map(chapter => ({
        ...chapter,
        content: /^(?:\s|<p>|<\/p>|<br\s*\/?>)*$/i.test(chapter.content) ? '' : chapter.content,
    })) });
}
