/** Controlled-document register (KM-DOCS-2026-001): the shapes /api/documents answers (backend/schemas.py Document*). */

export type DocumentScope = 'company' | 'project';
export type CompanyDocType = 'procedure' | 'standard' | 'definition' | 'guideline' | 'template';
export type ProjectDocType = 'pqp' | 'plan' | 'drawing' | 'spec' | 'certificate' | 'approval';
export type DocType = CompanyDocType | ProjectDocType;
/** company: draft / current / archived; project: draft / submitted / approved / superseded / void */
export type DocumentStatus = 'draft' | 'current' | 'archived' | 'submitted' | 'approved' | 'superseded' | 'void';
export type VersionStatus = DocumentStatus;

export const COMPANY_DOC_TYPES: CompanyDocType[] = ['procedure', 'standard', 'definition', 'guideline', 'template'];

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_no: number;
  version_label: string;
  status: VersionStatus;
  change_summary?: string | null;
  word_attachment_id?: string | null;
  pdf_attachment_id?: string | null;
  word_file_name?: string | null;
  pdf_file_name?: string | null;
  /** false when the version has no Word text (PDF only): its body is not found by the search */
  searchable: boolean;
  source_template_document_id?: string | null;
  source_template_version_id?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by_user_id?: number | null;
  void_reason?: string | null;
  created_by_user_id?: number | null;
  created_at?: string | null;
}

export interface DocumentReference {
  id: string;
  from_type: string;
  from_id: string;
  document_id: string;
  version_id?: string | null;
  pinned_version_no?: number | null;
  section_ref: string;
  created_by_user_id?: number | null;
  created_at?: string | null;
  doc_no?: string | null;
  title_zh?: string | null;
}

export interface DocumentSummary {
  id: string;
  doc_no: string;
  scope: DocumentScope;
  project_id?: string | null;
  vendor_id?: string | null;
  doc_type: DocType;
  title_zh: string;
  title_en?: string | null;
  category?: string | null;
  tags?: string | null;
  status: DocumentStatus;
  current_version_id?: string | null;
  effective_date?: string | null;
  owner_user_id?: number | null;
  is_template: boolean;
  template_fields?: string[] | null;
  source_km_article_id?: string | null;
  created_by_user_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  row_version?: number | null;
  current_version?: DocumentVersion | null;
  latest_version_no: number;
  /** search hit context (list with q=) */
  snippet?: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  versions: DocumentVersion[];
  references: DocumentReference[];
}

export interface DocumentCreatePayload {
  scope: DocumentScope;
  doc_type: DocType;
  title_zh: string;
  title_en?: string | null;
  category?: string | null;
  tags?: string | null;
  project_id?: string | null;
  vendor_id?: string | null;
  effective_date?: string | null;
  owner_user_id?: number | null;
  is_template?: boolean;
  template_fields?: string[] | null;
}

export interface DocumentUpdatePayload {
  title_zh?: string;
  title_en?: string | null;
  category?: string | null;
  tags?: string | null;
  vendor_id?: string | null;
  effective_date?: string | null;
  owner_user_id?: number | null;
  template_fields?: string[] | null;
}

export interface DocumentTransitionPayload {
  to: DocumentStatus;
  version_id?: string | null;
  reason?: string | null;
}

export interface DocumentListParams {
  scope: DocumentScope;
  project_id?: string;
  doc_type?: string;
  status?: string;
  is_template?: boolean;
  q?: string;
  include_hidden?: boolean;
  skip?: number;
  limit?: number;
}
