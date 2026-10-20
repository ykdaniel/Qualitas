# KM-DOCS-2026-001 D1 — API walk-through (throw-away DB, TestClient)

## 1. 建立公司文件（程序書）
`POST /api/documents/` → **200**
```json
{
  "id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
  "doc_no": "QTS-KM-000001",
  "scope": "company",
  "doc_type": "procedure",
  "status": "draft",
  "title_zh": "焊接作業程序書",
  "row_version": 0
}
```

## 1b. 建立專案文件（施工計畫，依專案命名規則取號）
`POST /api/documents/` → **200**
```json
{
  "id": "18ce3881-b664-4797-a34e-6aa8d6b23f83",
  "doc_no": "QTS-RKS-DM-PLN-000001",
  "scope": "project",
  "project_id": "P-DEMO",
  "vendor_id": "c1",
  "status": "draft"
}
```

## 2. 上傳版次（Word＋PDF，一次交易；Word 抽文字）
`POST /api/documents/ec719eb2-5c1f-4eb1-8436-8ce73e52638b/versions` → **200**
```json
{
  "id": "ac368152-bcc9-4620-b9f7-464c8de33bbf",
  "version_no": 1,
  "version_label": "Rev1.0",
  "status": "draft",
  "word_file_name": "WPS.docx",
  "pdf_file_name": "WPS.pdf",
  "searchable": true
}
```

## 3a. 設為現行前先看：沒有 PDF 的版次會被拒（示範用第二個草稿版次）
`POST /api/documents/ec719eb2-5c1f-4eb1-8436-8ce73e52638b/versions` → **200**
```json
{
  "id": "6247fafa-1174-4f83-86e2-d58729c1bb52",
  "version_no": 2,
  "searchable": true
}
```

## 3b. 把只有 Word 的版次設為現行 → 400 DOCUMENT_PDF_REQUIRED
`POST /api/documents/ec719eb2-5c1f-4eb1-8436-8ce73e52638b/transition` → **400**
```json
{
  "detail": "Version Rev2.0 of QTS-KM-000001 has no PDF; the issued record needs one before it can be set current / approved",
  "code": "DOCUMENT_PDF_REQUIRED",
  "params": {
    "docType": "Document",
    "number": "QTS-KM-000001",
    "version": "Rev2.0"
  }
}
```

## 3c. 設第 1 版為現行 → current，effective_date 自動帶入
`POST /api/documents/ec719eb2-5c1f-4eb1-8436-8ce73e52638b/transition` → **200**
```json
{
  "status": "current",
  "current_version_id": "ac368152-bcc9-4620-b9f7-464c8de33bbf",
  "effective_date": "2026-10-18",
  "row_version": 1
}
```

## 4. 搜尋命中抽出文字並回傳片段
`GET /api/documents/?scope=company&q=preheat` → **200**
```json
[
  {
    "id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
    "doc_no": "QTS-KM-000001",
    "scope": "company",
    "project_id": null,
    "vendor_id": null,
    "doc_type": "procedure",
    "title_zh": "焊接作業程序書",
    "title_en": "Welding Procedure",
    "category": null,
    "tags": "welding,wps",
    "status": "current",
    "current_version_id": "ac368152-bcc9-4620-b9f7-464c8de33bbf",
    "effective_date": "2026-10-18",
    "owner_user_id": null,
    "is_template": false,
    "template_fields": null,
    "source_km_article_id": null,
    "created_by_user_id": 1,
    "created_at": "2026-10-18 17:36:21",
    "updated_at": "2026-10-18 17:36:21",
    "row_version": 1,
    "current_version": {
      "id": "ac368152-bcc9-4620-b9f7-464c8de33bbf",
      "document_id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
      "version_no": 1,
      "version_label": "Rev1.0",
      "status": "current",
      "change_summary": "初版",
      "word_attachment_id": "707765138b4f4a989992e158e8dec59b",
      "pdf_attachment_id": "1f385ee6fec7427da6f224403ced6db0",
      "word_file_name": "WPS.docx",
      "pdf_file_name": "WPS.pdf",
      "searchable": true,
      "source_template_document_id": null,
      "source_template_version_id": null,
      "submitted_at": null,
      "approved_at": null,
      "approved_by_user_id": null,
      "void_reason": null,
      "created_by_user_id": 1,
      "created_at": "2026-10-18 17:36:21"
    },
    "latest_version_no": 2,
    "snippet": "焊接前檢查：預熱溫度不得低於 150°C。 Pre-weld inspection: preheat temperature shall be 150°C minimum."
  }
]
```

## 4b. 搜尋編號
`GET /api/documents/?scope=company&q=QTS-KM-000001` → **200**
```json
[
  {
    "id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
    "doc_no": "QTS-KM-000001",
    "scope": "company",
    "project_id": null,
    "vendor_id": null,
    "doc_type": "procedure",
    "title_zh": "焊接作業程序書",
    "title_en": "Welding Procedure",
    "category": null,
    "tags": "welding,wps",
    "status": "current",
    "current_version_id": "ac368152-bcc9-4620-b9f7-464c8de33bbf",
    "effective_date": "2026-10-18",
    "owner_user_id": null,
    "is_template": false,
    "template_fields": null,
    "source_km_article_id": null,
    "created_by_user_id": 1,
    "created_at": "2026-10-18 17:36:21",
    "updated_at": "2026-10-18 17:36:21",
    "row_version": 1,
    "current_version": {
      "id": "ac368152-bcc9-4620-b9f7-464c8de33bbf",
      "document_id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
      "version_no": 1,
      "version_label": "Rev1.0",
      "status": "current",
      "change_summary": "初版",
      "word_attachment_id": "707765138b4f4a989992e158e8dec59b",
      "pdf_attachment_id": "1f385ee6fec7427da6f224403ced6db0",
      "word_file_name": "WPS.docx",
      "pdf_file_name": "WPS.pdf",
      "searchable": true,
      "source_template_document_id": null,
      "source_template_version_id": null,
      "submitted_at": null,
      "approved_at": null,
      "approved_by_user_id": null,
      "void_reason": null,
      "created_by_user_id": 1,
      "created_at": "2026-10-18 17:36:21"
    },
    "latest_version_no": 2,
    "snippet": null
  }
]
```

## 5. 跨模組引用（NCR 根因引用第 4.2 節；指向現行版、記錄建立時版次）
`POST /api/documents/references` → **200**
```json
{
  "id": "1fafa024-6575-4180-bd96-684b46987530",
  "from_type": "ncr",
  "from_id": "ncr-demo-1",
  "document_id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
  "version_id": null,
  "pinned_version_no": 1,
  "section_ref": "4.2",
  "created_by_user_id": 1,
  "created_at": "2026-10-18 17:36:21",
  "doc_no": "QTS-KM-000001",
  "title_zh": "焊接作業程序書"
}
```

## 5b. 由來源查引用
`GET /api/documents/references/by-source?from_type=ncr&from_id=ncr-demo-1` → **200**
```json
[
  {
    "id": "1fafa024-6575-4180-bd96-684b46987530",
    "from_type": "ncr",
    "from_id": "ncr-demo-1",
    "document_id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
    "version_id": null,
    "pinned_version_no": 1,
    "section_ref": "4.2",
    "created_by_user_id": 1,
    "created_at": "2026-10-18 17:36:21",
    "doc_no": "QTS-KM-000001",
    "title_zh": "焊接作業程序書"
  }
]
```

## 6. 已發行版次的檔案鎖定：/api/files/upload 回 409 ATTACHMENT_LOCKED
`POST /api/files/upload` → **409**
```json
{
  "detail": "Cannot change attachments of a current DOCUMENT_VERSION: the record is locked.",
  "code": "ATTACHMENT_LOCKED",
  "params": {
    "kind": "record",
    "docType": "DOCUMENT_VERSION",
    "status": "current"
  }
}
```

## 7. 封存後改標題 → 409 RECORD_LOCKED（只有 tags 可改）
`PATCH /api/documents/ec719eb2-5c1f-4eb1-8436-8ce73e52638b` → **409**
```json
{
  "detail": "Document QTS-KM-000001 is archived; only its tags can change. Set it back to draft or current, or add a new version, to change: title_zh",
  "code": "RECORD_LOCKED",
  "params": {
    "docType": "Document",
    "number": "QTS-KM-000001",
    "status": "archived",
    "fields": [
      "title_zh"
    ]
  }
}
```

## 8. 刪除已發行文件 → 409；刪除有引用的草稿 → 400 REFERENCE_IN_USE
`DELETE /api/documents/ec719eb2-5c1f-4eb1-8436-8ce73e52638b` → **409**
```json
{
  "detail": "Document QTS-KM-000001 is archived: only a draft that was never issued can be deleted; archive or void it instead",
  "code": "RECORD_LOCKED",
  "params": {
    "docType": "Document",
    "number": "QTS-KM-000001",
    "status": "archived"
  }
}
```

## 9a. 專案文件上傳版次
`POST /api/documents/18ce3881-b664-4797-a34e-6aa8d6b23f83/versions` → **200**
```json
{
  "id": "08594eaa-2b4c-4d3c-8936-8be55c7bc83a",
  "version_no": 1,
  "status": "draft",
  "searchable": false
}
```

## 9b. 專案文件送審 → submitted；核准（approve 權限）→ approved，effective_date 帶入
`POST /api/documents/18ce3881-b664-4797-a34e-6aa8d6b23f83/transition` → **200**
```json
{
  "doc_no": "QTS-RKS-DM-PLN-000001",
  "status": "approved",
  "effective_date": "2026-10-18",
  "versions": [
    {
      "id": "08594eaa-2b4c-4d3c-8936-8be55c7bc83a",
      "document_id": "18ce3881-b664-4797-a34e-6aa8d6b23f83",
      "version_no": 1,
      "version_label": "Rev1.0",
      "status": "approved",
      "change_summary": "初版",
      "word_attachment_id": null,
      "pdf_attachment_id": "76ac237c8e194acbb453882165063b81",
      "word_file_name": null,
      "pdf_file_name": "plan.pdf",
      "searchable": false,
      "source_template_document_id": null,
      "source_template_version_id": null,
      "submitted_at": "2026-10-18 17:36:21",
      "approved_at": "2026-10-18 17:36:21",
      "approved_by_user_id": 1,
      "void_reason": null,
      "created_by_user_id": 1,
      "created_at": "2026-10-18 17:36:21"
    }
  ]
}
```

## 10. 下載現行版 PDF
`GET /api/documents/ec719eb2-5c1f-4eb1-8436-8ce73e52638b/versions/ac368152-bcc9-4620-b9f7-464c8de33bbf/download?kind=pdf` → **200**
(binary, 69 bytes)

## 11. 文件詳情（版次＋引用）
`GET /api/documents/ec719eb2-5c1f-4eb1-8436-8ce73e52638b` → **200**
```json
{
  "doc_no": "QTS-KM-000001",
  "status": "archived",
  "latest_version_no": 2,
  "versions": [
    {
      "id": "ac368152-bcc9-4620-b9f7-464c8de33bbf",
      "document_id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
      "version_no": 1,
      "version_label": "Rev1.0",
      "status": "current",
      "change_summary": "初版",
      "word_attachment_id": "707765138b4f4a989992e158e8dec59b",
      "pdf_attachment_id": "1f385ee6fec7427da6f224403ced6db0",
      "word_file_name": "WPS.docx",
      "pdf_file_name": "WPS.pdf",
      "searchable": true,
      "source_template_document_id": null,
      "source_template_version_id": null,
      "submitted_at": null,
      "approved_at": null,
      "approved_by_user_id": null,
      "void_reason": null,
      "created_by_user_id": 1,
      "created_at": "2026-10-18 17:36:21"
    },
    {
      "id": "6247fafa-1174-4f83-86e2-d58729c1bb52",
      "document_id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
      "version_no": 2,
      "version_label": "Rev2.0",
      "status": "draft",
      "change_summary": "只有 Word",
      "word_attachment_id": "67fe5c78449444018dd3e0aab700c73b",
      "pdf_attachment_id": null,
      "word_file_name": "v2.docx",
      "pdf_file_name": null,
      "searchable": true,
      "source_template_document_id": null,
      "source_template_version_id": null,
      "submitted_at": null,
      "approved_at": null,
      "approved_by_user_id": null,
      "void_reason": null,
      "created_by_user_id": 1,
      "created_at": "2026-10-18 17:36:21"
    }
  ],
  "references": [
    {
      "id": "1fafa024-6575-4180-bd96-684b46987530",
      "from_type": "ncr",
      "from_id": "ncr-demo-1",
      "document_id": "ec719eb2-5c1f-4eb1-8436-8ce73e52638b",
      "version_id": null,
      "pinned_version_no": 1,
      "s
```

