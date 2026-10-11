# AUDIT-TEMPLATES-2026-001 — STATUS（R2，待審查）

TASK_ID: AUDIT-TEMPLATES-2026-001
ROUND: R2
- R1 審查為 REVISE，原文保留在 `AUDIT-TEMPLATES-2026-001-R1-REVISE-{STATUS,REVIEW}-archive.md`；R1 的 patch 為 `evidence/G-R1.patch`（`46ec8718…`）。
- 基準：HEAD `1dc87c2a`，已經包含 AUDIT-BTNFIX 的 3 個 commit（`85db29d1`、`f06d3028`、`f879311c`）。R2 疊在 BTNFIX 之上。
- 差異：`evidence/G.patch`（由 `make-patch.sh` 產生，SHA-256 見 `evidence/patch-sha256.txt`），共 21 個檔案、新增 9 個；既有檔案沒有 mode 變更。
- 打包時處理了其他工作階段的修改：
  - `models.py` 和 `LanguageContext.tsx` 在工作樹裡也有其他工作階段尚未提交的修改（IAM 公司標示、會議記錄），patch 不含這些。
  - `models.py` 的做法：以 HEAD 為底，加上 AuditTemplate class。
  - `LanguageContext.tsx` 的做法：以 HEAD 為底，加上本任務的鍵值區塊（`i18n.py`、`i18n_r2.py`）。
  - 其他檔案的修改都只屬於本任務。
- 尚未提交，也尚未上線。

## RESULT
- [ ] 待獨立審查

## R1 審查的必改
| R1 必改 | R2 處理 |
|---|---|
| 1. 模板面板隱藏但不卸載：守衛會干擾稽核精靈的關閉，而且會被 clear() 清掉，未儲存的修改可能無聲遺失 | **面板只在「模板管理」分頁時掛載**，不再隱藏保留。<br>• 從模板管理切到稽核記錄時，先經過 `useLeaveGuard(...).requestAction`：有未儲存的修改就跳出共用的確認框，選留下會保留修改，選離開會卸載面板並丟棄修改。<br>• 面板用 `onDirtyChange` 回報狀態，卸載時回報 false。<br>• 因為稽核清單只在稽核記錄分頁顯示，模板有未儲存修改時開不了精靈，原本的干擾路徑已經不存在。<br>• 瀏覽器檢查第 2 段驗證：會詢問、留下保留修改、離開丟棄修改、之後離開頁面不再提示。 |
| 2. 模板改名後，取消勾選舊名稱只會移除名稱，帶入的未填項目留下 | 照建議 (a)：**有這個模板帶入的題目（依 templateId 判斷），按鈕就顯示為已勾選**；取消勾選時依 templateId 移除未填寫的題目。<br>• 改名後，新名稱的按鈕仍然認得之前帶入的題目，舊名稱則以「模板庫已沒有的名稱」顯示，可另外取消。<br>• 瀏覽器檢查第 3 段：把模板改名為 Rev A 後重新開啟，Rev A 顯示為已勾選，舊名稱也還在。 |

**R1 的建議**
- 已處理：
  - 模板未載入完成前，按鈕不能點。
  - 手動新增題目時，id 改用目前最大值 + 1。
  - `_template_name` 收到非字串時回 422，已加測試。
  - `_snapshot` 讀到手動改壞的資料列時寬鬆處理，已加測試。
  - 「來自模板」的冒號改進翻譯鍵（`fromTemplateNamed`）。
  - `applyTemplatePick` 的計算移進 updater。
- 記錄、未處理：不分大小寫比對名稱時的競態風險，影響極低。

## 使用者在 R2 期間的決定（都在隔離環境 3322 實際操作確認，詳見 TASK）
1. **ISO 9001:2015 的內容改成公司 checklist**：116 題、59 條。
   - 條文內容放要求原文，條文欄上限因此放寬到 2000 字。
   - 應備證據併入查檢重點的最後一行。
   - 條文編號只寫條文號。
   - LSC 欄不放進模板。
   - 5.2.1 補擬一題，修正 4 處錯字，保留 6.2.2.1。
   - 原始資料與解析過程放在 `evidence/iso9001-source/`，確認表為 `evidence/ISO9001-2015-template-review.xlsx`。
2. **條文標題**：每題新增 `title` 欄，ISO 的標題取自 checklist 的標題列；子條文沒有標題時用上一層的標題。管理頁可以編輯。
3. **模板按鈕代表「稽核類型」**：勾選只標記類型，不自動帶入題目。
4. **新增題目的表單**：
   - 條文選單與題目選單並排，下方是條文內容和查檢重點。
   - 題目選單只顯示「全部（N 題）」和「第 N 題」。
   - 選全部時，逐題預覽條文內容和查檢重點。
   - 每個欄位都有小標題。
   - 文字框依內容自動調整高度（`AutoGrowTextarea`），沒有內部捲軸。
   - 原本寫死的 20 條 `ISO_CLAUSES` 已移除，編輯單題時的下拉選單也移除。
5. **保留「從某類型批次挑題」**：使用 `AuditTemplatePicker`，可以跨條文勾選；已加入的預設勾選，已填寫的鎖定；另有「取消選用此模板」。
6. **取消勾選類型**：只移除未填寫的題目；只要還有保留的題目，類型就維持勾選，讓按鈕、列印上的類型名稱和題目一致。
7. **另開任務**：使用者另外提出查檢表欄位拆分和結果四級，另開 `AUDIT-GRADES-2026-001`，不在本輪範圍。

## 修改（相對 HEAD）
| 檔案 | 內容 |
|---|---|
| `backend/models.py` | `AuditTemplate`。 |
| `backend/schemas.py` | `AuditTemplateItem`（no、title、clause 2000 字、task）、Create／Update（名稱只接受字串）、讀取用 schema。 |
| `backend/db_migrations.py` | 第 24 步的初始模板寫入；說明改為 116 題的公司 checklist。CRLF。 |
| `backend/core/perms.py`、`core/dependencies.py`、`routers/audit.py` | 新權限、依賴注入、`/api/audit/templates` 端點。CRLF。 |
| `backend/services/audit_template_service.py`、`audit_template_iso9001_2015.json`（新） | 服務邏輯；ISO 內容由 JSON 載入，項目 id 固定為 `iso9001-<條號>-<序號>`。 |
| `backend/tests/test_audit_templates_{http,migration}.py`（新） | HTTP 9 項、啟動與遷移 6 項（含 title、116 題、名稱型別、損壞資料）。 |
| `backend/scripts/verification/seed_audit_templates_review.py`（新） | 審查用的種子資料。 |
| `DECISIONS.md` | 「稽核查檢模板庫」一條，已改寫成 R2 的最終設計。 |
| `react-app/src/store/auditTemplateStore.ts`（新） | 模板 store。 |
| `react-app/src/components/Audit/AuditTemplatesPanel.tsx`（新） | 管理分頁：條文標題欄、多行文字框，並回報 `onDirtyChange`。 |
| `react-app/src/components/Audit/AuditTemplatePicker.tsx`（新） | 批次挑題視窗。 |
| `react-app/src/components/Audit/AutoGrowTextarea.tsx`（新） | 依內容自動調整高度的文字框。 |
| `react-app/src/components/Audit/Audit.tsx` | 分頁、切換分頁時的守衛、面板只在該分頁掛載。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | 第 4 步：類型按鈕、條文與題目選單、批次挑題、取消類型、移除 `ISO_CLAUSES`；第 4、5 步顯示保留換行。CRLF。 |
| `react-app/src/context/LanguageContext.tsx` | `audit.tabRecords`、`audit.tabTemplates`、`audit.templates.*`，en 和 zh 都有。CRLF。 |
| `react-app/tests-browser/audit-templates-check.mjs`（新） | 照 R2 的流程重寫，33 項。 |
| `react-app/tests-browser/audit-all-buttons-check.mjs` | 全按鈕測試 v2：改用 BTNFIX 後的中文標籤、新的第 4 步，並加上唯讀橫幅等檢查（+180／−84）。 |
| `react-app/tests-browser/audit-ime-enter-check.mjs` | 查檢重點改成 `<textarea>` 後：選擇器改為 `[name=task]`；計數排除表單欄位本身（textarea 的文字內容會跟著 value）。 |

## 證據（`AUDIT-TEMPLATES-2026-001-evidence/`）
- `backend-tests.txt`：
  - 候選樹上 16 個測試檔，**205 passed、14 skipped**。
  - 14 個 skip 需要 git 舊版程式，所以另外在 repo 跑：**33 passed**。
- `frontend-checks.txt`：tsc、eslint（7 個檔案）、`npm test` 169 項全部通過、build，都是 0。
- `browser-check.txt`：`audit-templates-check.mjs` 在全新的隔離 stack（3321）上，**ALL PASS（33 項）**。
- `regress/`：其他既有的 Audit 瀏覽器檢查在 R2 候選上重跑，每支各用一個全新 stack：

  | 檢查 | 結果 |
  |---|---|
  | `audit-buttons-check` | 31 項全部 PASS |
  | `audit-agenda-check` | 17 項全部 PASS |
  | `audit-print-template-check` | 18 項全部 PASS |
  | `audit-export-docx-check` | 7 項全部 PASS |
  | `audit-layout-check` | 16 項全部 PASS |
  | `audit-ime-enter-check` | 3 項全部 PASS（修正檢查本身之後） |

  | `audit-all-buttons-check` v2 | **192 PASS、0 FAIL、3 待確認、0 SCRIPT-ERROR**，連續 3 次在全新 stack（3323）上結果相同 |

  - `audit-all-buttons-check` 原本是 BTNFIX 之前寫的，這輪依目前的介面更新：
    - 改用 BTNFIX 後的中文表格標籤。
    - 第 4 步改成新的流程，原本每項檢查的意圖都保留，沒有刪掉任何一項。
    - 新增 10 項：唯讀橫幅、BTNFIX 後的 #68、儲存後的 templateId 等。
  - 原本的 FAIL #36、#41 現在都通過。3 項待確認和原報告相同（#14、#39、#103，使用者決定維持現狀）。
- 截圖：`templates-tab-iso.png`、`wizard-add-all.png`、`wizard-batch-picker.png`。

## 下一步
獨立審查 → 使用者在隔離環境做最後確認 → 3.11（先跟協調中心排程）→ 提交 → 部署（之後由使用者在 IAM UI 替 QA_MANAGER 加上 `audit:template:manage`）。
