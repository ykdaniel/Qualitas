# REVIEW.md — 獨立審查

TASK_ID: NOI-EXPORT-DOCX-2026-001
SOURCE_TASK_ID: ITR-EXPORT-DOCX-2026-001
審查日期：2026-10-07
審查者：Claude（**非獨立審查**：本任務的執行者也是 Claude，見 STATUS.md 標題「Claude 執行結果」。已用重讀程式碼與重新解析證據檔彌補，但仍可能漏掉執行者自己的盲點；建議再由 GPT 複審一次。）

## EVIDENCE_CHECK
- **重新解析證據檔（讀碼之外的獨立查證）**：用 python-docx 讀 `noi1-export.docx`／`noi2-export-no-attachments.docx`：
  - NOI1：含 `Attachments` 區塊，列出 `seed-noi-attachment.png`，Reference No、`QTS-NDX1-ITP-000001` 皆在；`word/media/` 為空（確實是列檔名、非內嵌圖片）。
  - NOI2：無 `Attachments` 區塊（沒有附件時不印空殼），符合驗收 3。
- 證據目錄完整：三份 log、三份 .docx 皆存在。STATUS 的數字（6/6、4/4、3/3 PASS）與 docx 內容吻合。
- **未能重驗**：lint 基線「13 errors / 21 warnings 不變」只有執行者自述，本次未重跑；完整 pytest 當時沒跑（STATUS 已據實說明）。

## SCOPE_CHECK
- 實作位置與 TASK 的 ALLOWED_PATHS 一致：`services/noi_service.py`（`export_docx`）、`routers/noi.py`（`GET /{noi_id}/export-docx`）、`api.ts`（`exportNoiDocx`）、`NOIDetailModal.tsx`（按鈕）。
- 資料範圍與權限正確：端點為 `RoleChecker(NOI_VIEW)`，服務層走 `get_noi(noi_id, scope=scope)`，不存在或範圍外一律 `ValueError` → 404。
- 設計決定與 PRECHECK 一致：Related ITP 直接讀 `noi.itpNo`；不加 Checklist 表格；附件用 `add_file_list`。
- **FORBIDDEN_PATHS 事後無法逐檔證明未動**：工作樹已按層分批提交，無法用 diff 區分本輪與其他輪的變更。僅能採信 STATUS 自述（`itr_service`／`ncr_service`／`km_service`／`ITRModals.tsx` 未修改）。
- 簽名欄沿用 ITR 的「製表／複核／核准」，TASK 明確允許；NOI 無版次欄位，masthead 會印出「版次 Rev：—」，屬外觀小瑕疵。

## DECISIONS_CHECK
- 「附件沿用 update 權限」：匯出屬唯讀（view 權限），只列檔名，不涉及上傳授權，未牴觸。
- 其餘 DECISIONS 項目（ITP 核准、ITR 複驗、ITR Checklist 窄螢幕排版）與本任務無關。
- 翻譯鍵重用 `itr.exportWord`：不違反任何決策，但 NOI 與 ITR 之間產生隱性依賴（日後若把該鍵改名，NOI 按鈕會退回預設文字）。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

功能面符合全部驗收條件；判 REVISE 是因為下列兩項違反 AGENTS.md 的規範或留下回歸風險，修正量小。

## REQUIRED_FIXES
1. **前端按鈕沒有錯誤處理（違反 AGENTS.md「API 呼叫一律 try/catch、使用者看得到友善訊息」）**：`NOIDetailModal.tsx:563` 是 `onClick={() => exportNoiDocx(...)}`，匯出失敗（403／404／500、網路中斷）時是未處理的 promise rejection，使用者看不到任何回饋，只會覺得按鈕壞了。需包 try/catch 並以既有 toast 顯示友善訊息。（ITR 的按鈕若為同一寫法，可一併檢查，但不在本任務範圍。）
2. **缺少自動化回歸測試與負向案例**：本任務只有驗收腳本，且只有成功案例。`backend/tests/` 沒有任何 `export-docx` 測試。至少補：無 `NOI_VIEW` → 403、範圍外／不存在 → 404、有／無附件的內容斷言。

## 建議（不阻擋）
- **共用 helper 的路徑防護有前綴比對弱點**：`core/docx_builder.py::resolve_local_upload_path` 用 `full.startswith(root)`，未補路徑分隔符，`/uploads_evil/...` 這類同前綴的兄弟目錄會通過。此處只會洩漏檔名（不讀內容），且舊版附件欄位需有 NOI 寫入權限才能塞值，故嚴重度低；屬 ITR／NCR 共用的既有程式，應另案修（`os.path.commonpath` 或補 `os.sep`）。
- NOI 無版次時，masthead 可不顯示「版次 Rev：—」。
- 翻譯鍵長期可整理成 `common.exportWord`。

## NEXT_STEP
1. 修 REQUIRED_FIXES 1、2（小，約一個任務單位）；修完更新 STATUS，再請 GPT 做獨立複審，因為本次審查非獨立。
2. 「路徑防護前綴比對」另開 BACKLOG 項目，不夾帶進本任務。
