# AUDIT-TEMPLATES-2026-001 — STATUS（R3 審查 PASS；使用者確認；3.11 全部通過；已本地提交）

TASK_ID: AUDIT-TEMPLATES-2026-001
ROUND: R3
- R1 和 R2 審查都是 REVISE，原文保留在 `AUDIT-TEMPLATES-2026-001-R1-REVISE-*-archive.md`、`-R2-REVISE-*-archive.md`；R1 的 patch 為 `evidence/G-R1.patch`。
- 本輪 R3 處理了 R2 審查的 2 項必改，以及 7 項建議中的 6 項（見下方「R3 修正」）；下方 R2 的內容仍然有效。
- 基準：HEAD `1dc87c2a`，已經包含 AUDIT-BTNFIX 的 3 個 commit（`85db29d1`、`f06d3028`、`f879311c`）。R2 疊在 BTNFIX 之上。
- 差異：`evidence/G.patch`（由 `make-patch.sh` 產生，SHA-256 見 `evidence/patch-sha256.txt`），共 22 個檔案、新增 10 個；既有檔案沒有 mode 變更。
- 打包時處理了其他工作階段的修改：
  - `models.py` 和 `LanguageContext.tsx` 在工作樹裡也有其他工作階段尚未提交的修改（IAM 公司標示、會議記錄），patch 不含這些。
  - `models.py` 的做法：以 HEAD 為底，加上 AuditTemplate class。
  - `LanguageContext.tsx` 的做法：以 HEAD 為底，加上本任務的鍵值區塊（`i18n.py`、`i18n_r2.py`）。
  - 其他檔案的修改都只屬於本任務。
- 尚未提交，也尚未上線。

## RESULT
- [x] R3 獨立審查 PASS（見 REVIEW）。
- [x] 使用者 2026-10-11 在隔離環境 3322 看過 R3 最終版，回覆「OK」。
- [x] **3.11 全套測試：2473 passed、17 skipped，pytest_exit=0**（`evidence/py311-full-suite-final.txt`，09:21Z–10:12Z）。
  - 最終候選：AUDIT-BTNFIX cand-final（正式站 AGENDA + NOI + BUTTONS + BTNFIX）+ G.patch `37a590e2`，排除了不在正式站樹裡的 DECISIONS.md 和 tests-browser/audit-all-buttons-check.mjs，這兩個檔不影響部署或 pytest。
  - 候選上 tsc 0、單元測試 148/148、build 0（`evidence/final-candidate-frontend-checks.txt`）。
- [x] **提交**：以 HEAD **`312229ba`**（IAM 的 commit，parent `aceec76c`）為基準重新產生 G.patch，SHA-256 `505fa27c…`；審查時的版本保留為 `G-R3-reviewed.patch`（`37a590e2…`）。
  - 和 R3 審查、3.11 所測的版本相比，所有前端檔與後端的 db_migrations、perms、dependencies、routers/audit、audit_template_service、ISO JSON 都逐位元組相同。
  - schemas.py 只差 IAM commit 改的 2 段註解（`git diff 1dc87c2a 312229ba -- backend/schemas.py`），本任務的部分相同。
  - 用暫存 index 提交 code、docs 兩個 commit，沒有 force。
- 第 4 步版面：使用者在協調中心的回答一度被理解為「改回舊版面」。之後使用者在本工作階段（選「新版（3322，你剛才回 OK 的）」）和協調中心（「新版（3322）」）都確認用新版 R3，所以不做 R4。部署順序為 NOI → BUTTONS → BTNFIX → TEMPLATES。
- code commit：`f01f0aba`。

## R3 修正（R2 審查 REVISE）
| R2 審查項目 | 處理 |
|---|---|
| 必改 1：取消勾選類型後，表單殘留那個類型的條文，按「+」仍會加入題目，`selected_templates` 和題目對不上 | • `pickedClause` 只從**目前勾選的類型**中找模板。<br>• `deselectTemplate` 在表單顯示的是這個類型的條文或題目時，把表單重設為空白。<br>• 從模板加入題目時，不論是全部或單題，updater 都會確保類型名稱在 `selectedTemplates` 裡。<br>• 檢查第 3b 段新增 2 項：選了條文再取消勾選，以及選了單題再取消勾選，兩種情況表單都清空，「+」不會加入任何題目。 |
| 必改 2：批次挑題「套用」會刪掉模板已刪除題目的未填複本 | `applyTemplatePick` 只會移除挑題視窗裡看得到的題目（目前模板還有的題目），已被模板刪掉的題目，其複本一律保留。`removes` 的計數也照同一規則算。<br>檢查第 3b 段新增 1 項：模板刪掉 1 題、新增 1 題後套用，按鈕顯示「新增 1、移除 0」，舊題目的複本仍在。 |
| 建議 1：導覽檢查用的是整頁重新載入 | 改成點 app 內的麵包屑連結。 |
| 建議 3：文字框在視窗變窄後內容被裁掉 | `AutoGrowTextarea` 加上 ResizeObserver，寬度改變時重新計算高度。 |
| 建議 4：沒用到的翻譯鍵 | 刪除 `audit.templates.pickQuestion`、`audit.wizard.selectISOClause`、`audit.wizard.customClause`（後兩個原本給已移除的 20 條選單使用；`i18n_r2.py` 會在 patch 裡刪掉它們）。 |
| 建議 5：重名的 409 直接顯示英文原文 | store 的錯誤物件帶上 HTTP status；管理頁收到 409 時顯示「已有同名的模板，請換一個名稱。」，其他錯誤顯示「模板儲存失敗，請稍後再試。」。檢查改成驗證友善訊息、而且不出現英文原文。 |
| 建議 6：註解仍是舊設計 | 更新 panel、store、model、service 的註解，並移除 `fillText` 這個別名。挑題視窗 `selected=false` 的分支保留（無害）。 |
| 建議 7：後端輸入檢查 | `AuditTemplateItem` 的欄位收到 list 或 object 時回 422（數字可以轉成文字）；讀取時只保留 items 裡的物件。新增 2 項 HTTP 測試：2000／2001 字的邊界、非字串欄位，以及手動改壞的 items。 |
| 建議 8：STATUS 檔案數 | 已更正為 22 個檔案、新增 10 個。 |
| 建議 2：模板改名後先取消舊名稱，題目就失去對應的類型名稱 | **記為已知限制**：只發生在「模板改名之後、使用者又先取消舊名稱」的情況。重新勾選新名稱即可恢復一致。 |

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
- `backend-tests.txt`（R3）：
  - 候選樹上 16 個測試檔，**207 passed、14 skipped**。
  - 14 個 skip 需要 git 舊版程式，所以另外在 repo 跑：**33 passed**。
- `frontend-checks.txt`：tsc、eslint（7 個檔案）、`npm test` 169 項全部通過、build，都是 0。
- `browser-check.txt`（R3）：`audit-templates-check.mjs` 在全新的隔離 stack（3321）上，**ALL PASS（36 項）**，新增 3 項 R2 必改的檢查。
- `regress/`（R3）：其他既有的 Audit 瀏覽器檢查在 R3 候選上重跑，每支各用一個全新 stack：

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
