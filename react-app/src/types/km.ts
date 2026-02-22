export interface KMAttachment {
  name: string;
  filename?: string;
  size?: string;
  url?: string;
}

export interface KMArticle {
  id: string;
  articleNo: string;
  title: string;
  content: string;
  category: string;
  tags: string;
  status: string;
  author_id?: number;
  created_at?: string;
  updated_at?: string;
  attachments?: KMAttachment[] | string;
  parent_id?: string | null;
  chapter_no?: string | null;
  version_no?: number;
  change_summary?: string;
}

export interface KMArticleHistory {
  id: string;
  article_id: string;
  version_no: number;
  title: string;
  content: string;
  category?: string;
  tags?: string;
  status?: string;
  author_id?: number;
  attachments?: string | KMAttachment[];
  parent_id?: string;
  chapter_no?: string;
  change_summary?: string;
  created_at: string;
}

export interface KMArticleCreate {
  title: string;
  content: string;
  category?: string;
  tags?: string;
  status?: string;
  attachments?: KMAttachment[] | string;
  parent_id?: string | null;
  chapter_no?: string | null;
}

export interface KMArticleUpdate {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
  status?: string;
  attachments?: KMAttachment[] | string;
  parent_id?: string | null;
  chapter_no?: string | null;
}
