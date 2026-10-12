# REFUSAL-DIALOG-2026-001 設計（v1，使用者 2026-10-12 已選定）

> 盤點基準：共用分支 `ui/sidebar-shell-preview` @ `07248220`（已含 NOI-DEFECTS、NCR-DELETE-AUDIT、CHECKLIST-BACK-LABEL 三批）。
> 本文件只做設計，沒有修改任何程式。行號以 07248220 為準。

## 1. 需求（使用者 2026-10-12，經協調中心）

- 刪除或存檔被拒時，改用**彈跳視窗**：標題「無法刪除」或「無法儲存」，內容寫原因，只有一顆「我知道了」，不會自動消失。
- 頁面上方的紅色橫幅只留給「清單載入失敗」，只有這時才顯示「重試」。
- 原因用中文；英文介面顯示英文。
- 成功提示（例如「已刪除」）維持 sonner。
- 全系統一次套用（方案 1：NCR 先照原樣上線，彈跳視窗另開一批）。

## 2. 盤點結果

### 2.1 前端：刪除失敗目前怎麼顯示

| 模組 | 位置 | 目前顯示 | 問題 |
|---|---|---|---|
| NCR | `NCR.tsx:255` | 頂部橫幅＋「重試」 | 「重試」其實是重新載入清單 |
| NOI | `NOI.tsx:254` | 頂部橫幅＋「重試」；事前檢查被擋時用小提示 `noi.deleteBlocked` | 同上；事前檢查失敗只記在 console |
| ITR | `ITR.tsx:107` | 頂部橫幅＋「重試」 | 沒有 try/catch（未處理的 rejection），確認視窗不會關 |
| ITP 清單 | `ITP.tsx:174` | 橫幅＋「重試」**再加上**小提示（通用句「刪除失敗，請稍後再試」） | 重複顯示；**後端被拒時回 500**（見 2.3） |
| PQP | `PQP.tsx:190` | 橫幅＋「重試」**再加上**小提示 `(err as Error).message` | 小提示顯示 axios 的「Request failed with status code 4xx」 |
| Audit | `Audit.tsx:237` | 橫幅（只有 ×，沒有重試） | 和載入失敗共用同一個橫幅 |
| OBS／OSD／會議記錄 | `OBS.tsx:192`、`OSD.tsx:155`、`MeetingMinutes.tsx:260` | 橫幅（沒有按鈕）**再加上** axios 原文的小提示 | 兩個地方顯示兩種不同訊息 |
| Follow-up | `FollowUpIssue.tsx:336` | 小提示：通用句「刪除失敗」 | 後端原因被丟掉 |
| 承包商 | `Contractors.tsx:122` | 小提示：英文 detail 原文 | 5xx 也直接顯示原文 |
| KM | `KM.tsx:108` | 小提示：通用句 | 原因被丟掉 |
| IAM 角色 | `RoleManagement.tsx:59` | 小提示：`getErrorMessage` | 刪除原因在結果出來前就被清空，重試要重打 |
| **Checklist** | `Checklist.tsx:178` | **沒有任何提示** | 沒有 catch，store 的 error 也沒有顯示 |
| **FAT** | `FAT.tsx:166` | **沒有任何提示** | catch 是空的 |
| **專案**（承包商頁的分頁） | `Contractors.tsx:147` | **沒有任何提示** | 沒有 catch；**後端被拒時回 500** |
| ITR 內移除 Checklist | `ITRModals.tsx:1451` | 小提示：英文 detail 原文 | 重新整理失敗也被當成移除失敗 |
| 會議記錄附件（立即刪除） | `Shared/FileAttachment.tsx:166` | 只記在 console | 沒有提示 |
| ITP 編輯器刪除檢驗項目 | `ITPDetail.tsx:362`、`ITPAdvancedEditor.tsx:187` | 項目刪除只在本地，存檔失敗時是通用小提示 | 實際上是「存檔失敗」，歸第 2 批 |

沒有任何模組使用批次刪除（`BatchActionBar` 沒有被引用）。使用者帳號不能刪除（後端固定回 405）。

### 2.2 前端：存檔失敗（第 2 批的範圍）

- **只有 NCR、OBS、NOI 用完整的 saveFlow**（`runSaveFlow`＋`describeSaveError`＋視窗內的 `SaveFollowUpBanner`），失敗時是小提示「尚未保存，您填寫的內容都已保留。{原因}」。Material、OSD、會議記錄只用了一部分。
- 其他模組都是各自處理：ITP、PQP（表單內紅字）、Audit（表單內紅字）、Checklist、FAT、Follow-up、承包商、專案、IAM、KM、KPI、文件編碼規則、安全設定。
- **重複顯示**：ITP、ITR、PQP、OSD、會議記錄的 store 會把存檔錯誤也放進頁面橫幅，所以視窗後面的頁面頂部同時出現紅色橫幅。
- **會遺失資料**：Follow-up 存檔失敗會顯示通用小提示，然後**關閉視窗，填的內容不見**（`FollowUpIssue.tsx:326`）。
- **原因被丟掉**：FAT 存檔顯示 axios 原文；承包商、專案、KM 只有通用句；ITR 的「只發行」寫死英文。
- 403／409 只在 4 個地方有自己的說明。

### 2.3 後端：拒絕訊息

- 全部是英文字串 `detail`，沒有共用的轉換工具；每個 router 各自 `except ValueError → 400`。
- 已經有結構化格式的只有：日期錯誤（list 加 `code`）、NOI 的 delete-check（`{canDelete, references:[{type,count}]}`）、ITR 批次更新。
- **會變成 500 的拒絕**（使用者看到的是「伺服器錯誤」，不是原因）：
  - **ITP 刪除時被 NOI 引用**：`routers/itp.py:141` 沒有 try，`check_itp_references` 的 ValueError 變成 500。
  - **專案刪除時有資料引用**：`routers/projects.py:89` 同樣沒有 try。
  - 建立 NOI 時找不到 ITP（`routers/noi.py:109-137` 只接日期與範圍錯誤）。
  - 承包商、專案名稱重複（IntegrityError）。
- 刪除時完全沒有後端檢查的：PQP、FAT、OBS、OSD、KM（不屬本批，只記錄）。

完整清單（約 230 條拒絕）在三份盤點報告中，摘要見第 5 節代碼表。

## 3. 設計

### 3.1 彈跳視窗元件

```
┌─────────────────────────────────────┐
│  ⚠  無法刪除                      × │
├─────────────────────────────────────┤
│  NCR QTS-RKS-HL-NCR-000012 狀態為    │
│  「Open」，請先作廢（Void）再刪除。   │
│                                     │
│  ─ 被引用 ─                          │
│  • 1 筆 ITR                          │
├─────────────────────────────────────┤
│                         [ 我知道了 ] │
└─────────────────────────────────────┘
```

- `components/Shared/RefusalDialog.tsx`：用 portal 掛在 `document.body`，z-index 10000（ITP 全螢幕編輯器用到 9999，必須蓋過它）。外觀沿用 `ConfirmModal`（同一套 CSS 色票）。
  - `role="alertdialog"`、`aria-modal`、`aria-labelledby`／`aria-describedby`。
  - 開啟時焦點放在「我知道了」，Esc、× 與「我知道了」都會關閉；點背景**不會**關閉（避免沒看到就關掉）。
  - 不會自動消失；同時只顯示一個，新的錯誤取代舊的。
- `store/refusalStore.ts`（zustand）＋ `showRefusal()`：在 `App.tsx` 的 `<Toaster>` 旁邊掛一次。任何元件都能像 `toast.error()` 一樣直接呼叫，不必在每頁加 state。這樣改動各模組時，大多只要把一行 `toast.error(...)` 或 `catch {}` 換成 `showRefusal(err, 'delete')`。
- `utils/refusal.ts`：純函式 `describeRefusal(error, t, action)` → `{ title, message, items?, original? }`，放進 `tests-unit/` 測試。規則：
  1. 回應帶 `code` → 用 `t('refusal.<CODE>', params)` 翻譯；`references` 之類的清單參數轉成條列。
  2. 沒有 `code`，但 `detail` 是字串 → 中文介面顯示通用句「系統拒絕了這個操作，原因如下：」，下方附英文原文；英文介面直接顯示原文。
  3. 422 欄位錯誤 → 沿用 `describeSaveError` 現有的日期代碼翻譯。
  4. 403 沒有代碼 → 「您沒有執行此操作的權限。」（實作補註：403 沒有代碼但有說明文字時，依第 2 點顯示通用句＋原文，因為 ScopeForbidden 等原文更具體；只有完全沒有說明時才用這句。R1 審查確認）
  5. 404 → 「這筆紀錄已不存在，可能已被其他人刪除。請重新整理清單。」
  6. 5xx 或網路錯誤 → 依 3.3 的選擇。
  7. 401 → 不顯示（攔截器負責登出）。

### 3.2 頁面橫幅只留給載入失敗

- 各 store 的 `delete*`（第 2 批再處理 `add*`／`update*`）**不再寫入頁面的 `error`**，改成只把錯誤丟給呼叫端，由元件呼叫 `showRefusal`。
- 這樣頁面頂部的橫幅只會出現「清單載入失敗」，「重試」才名副其實。NCR 現有的 `deleteErrorRef` 繞法可以拿掉。
- Audit 橫幅的 ×、OBS／OSD／會議記錄沒有按鈕的橫幅，都改成和其他模組一樣：只用於載入失敗，附「重試」。

### 3.3 後端錯誤代碼（建議方案 A）

**方案 A（建議）：回應加上 `code` 與 `params`，保留英文 `detail`**

```json
HTTP 400
{
  "detail": "Cannot delete NCR 'QTS-…-000012' with status 'Open'. Please Void the NCR first, then delete.",
  "code": "DELETE_NOT_VOID",
  "params": { "docType": "NCR", "number": "QTS-…-000012", "status": "Open" }
}
```

- `detail` 一字不改，現有前端、測試、腳本照常可用；新的前端看到 `code` 才翻譯。
- 實作：
  - `core/refusals.py` 新增 `class Refusal(ValueError)`，帶 `code`、`params`、英文 `message`。它是 `ValueError` 的子類別，所以**沒改到的 router 仍然照舊回 400 加英文 detail**，不會壞。
  - `class RefusalHTTPException(HTTPException)` 加上 `main.py` 的一個 exception handler，輸出 `{detail, code, params}`。
  - 各 router 把 `raise HTTPException(400, detail=str(e))` 改成 `raise refusal_http(e, 400)`（一個 helper，`e` 不是 `Refusal` 時行為與現在完全相同）。
  - `RoleChecker`／`AnyPermissionChecker` 的 403 加 `code: "PERMISSION_DENIED"`，`params: {permission}`。
- 會動到 `main.py`（只加一個 handler）和 `core/`；**不動 `schemas.py`**。

**方案 B：不改後端，前端比對英文字串翻譯**：不必等後端，但每次後端改字就失效，而且 f-string 裡的參數要用正規表示式拆出來，很脆弱。不建議。

**方案 C：`detail` 改成物件**：會讓所有讀 `detail` 字串的地方壞掉（NOI delete-check 的呼叫端、測試、`getErrorMessage`）。不建議。

### 3.4 被拒時順便修的地方（第 1 批）

- ITP 刪除、專案刪除：被引用時改回 400（原本是 500），補 HTTP 測試。
- Checklist、FAT、專案的刪除：補上錯誤處理（原本沒有任何提示）。
- ITR 刪除：補上 try/catch（原本是未處理的 rejection）。
- OBS、OSD、PQP、會議記錄的刪除小提示原本顯示 axios 原文，改成彈跳視窗後一併解決。
- IAM 刪除角色：失敗時保留已輸入的原因。

## 4. 分批（建議）

| 批 | 範圍 | 主要檔案 |
|---|---|---|
| **第 1 批：共用元件＋刪除** | RefusalDialog、refusalStore、describeRefusal＋單元測試；後端 `Refusal` 基礎、handler、刪除相關代碼（第 5.1 節）；18 個刪除入口改用彈跳視窗；store 的刪除不再寫入橫幅；第 3.4 節的修正 | 前端：`App.tsx`、`Shared/RefusalDialog.tsx`、`store/refusalStore.ts`、`utils/refusal.ts`、`LanguageContext.tsx`（`refusal.*` 鍵）、約 16 個元件檔（含 `Shared/FileAttachment.tsx`）＋對應 store。後端：`core/refusals.py`、`main.py`、`core/dependencies.py`、`core/validators.py`、`core/error_messages.py`，以及 ncr／noi／itr／itp／checklist／audit／meeting_minutes／followup／contractor／project／user 的 service 與 router 的刪除路徑 |
| **第 2 批：存檔** | 所有存檔、狀態轉換（核准、發行、作廢、結案、重開、撤回）的拒絕改用彈跳視窗；store 的 add／update 不再寫入橫幅（消除重複顯示）；Follow-up 失敗時不關視窗；存檔相關代碼（第 5.2 節） | saveFlow 的 `presentOutcome`、各模組 Modal |
| 第 3 批（可選） | 長尾代碼：ITR 42 條、Checklist 15 條等模組專屬的存檔拒絕 | 第 2 批沒有代碼的拒絕，仍會以「中文通用句＋英文原文」顯示，不會沒有提示 |

第 1 批碰到正在合併的檔案：`NOI.tsx`、`NCR.tsx`、`Checklist.tsx`、`LanguageContext.tsx`、`ncr_service.py`、`noi_service.py`、`api.ts`（可能不需要）。**實作前向協調中心確認基準 HEAD**，等三批上線、重放完成再動。

## 5. 代碼清單

### 5.1 第 1 批（刪除，共 16 個）

| 代碼 | HTTP | 來源 | params | 中文（草稿） |
|---|---|---|---|---|
| `DELETE_NOT_VOID` | 400 | NCR、Audit、Follow-up、會議記錄 | docType, number, status, allowed（會議記錄另允許 Draft） | {docType} {number} 狀態為「{status}」，請先作廢（Void）再刪除。 |
| `DELETE_REFERENCED` | 400 | NCR（被 ITR 引用）、NOI、ITP、承包商、專案、角色（共用 `check_references_before_delete`） | docType, number, references:[{type,count}] | {docType} {number} 仍被下列文件引用，請先處理這些文件： • {count} 筆 {type} |
| `ITR_DELETE_LOCKED` | 400 | ITR | number, status | ITR {number} 已是「{status}」（鎖定的紀錄），核准或作廢的 ITR 會保留存檔，不能刪除。 |
| `ITR_DELETE_APPROVAL_HISTORY` | 400 | ITR | number, eventCount | ITR {number} 有 {eventCount} 筆核准／撤回紀錄。曾經核准過的 ITR 必須保留，不能刪除。 |
| `ITR_DELETE_REINSPECTION_CITED` | 400 | ITR | number, ncrs[] | ITR {number} 是下列 NCR 的複檢紀錄：{ncrs}。請先在這些 NCR 移除複檢編號。 |
| `ITR_DELETE_SOURCE_CITED` | 400 | ITR | number, refs[], hiddenCount | ITR {number} 是下列文件的來源 ITR：{refs}（另有 {hiddenCount} 筆您沒有權限查看）。請改為作廢。 |
| `ITR_DELETE_HAS_REINSPECTIONS` | 400 | ITR | number, children[] | ITR {number} 已有複檢 ITR：{children}。初驗與複檢的關係必須保留，不能刪除。 |
| `ITR_DELETE_CHECKLIST_EVIDENCE` | 400 | ITR | number, checklists[] | ITR {number} 的 Checklist 已有檢驗結果：{checklists}。請改為作廢。 |
| `ITR_UNLINK_LOCKED` | 400 | ITR 移除 Checklist | number, status | ITR {number} 為「{status}」，不能移除 Checklist。請先把 ITR 改回 In Progress。 |
| `ITR_UNLINK_EVIDENCE` | 400 | ITR 移除 Checklist | checklist | Checklist {checklist} 曾經有檢驗結果，不能移除（即使之後已清空）。 |
| `CHECKLIST_DELETE_ITR_OWNED` | 400 | Checklist | number, itr | Checklist {number} 屬於 ITR {itr}，請到該 ITR 使用「移除」。 |
| `CHECKLIST_DELETE_HAS_EVIDENCE` | 400 | Checklist | number | Checklist {number} 曾經有檢驗結果，不能刪除。 |
| `CONTRACTOR_DELETE_HAS_PERSONNEL` | 400 | 承包商 | name, count | 承包商 {name} 的人員名單有 {count} 人，請改為停用。 |
| `ROLE_ADMIN_PROTECTED` | 403 | IAM 角色 | — | 只有管理員可以新增、改名、修改或刪除 Admin 角色。 |
| `PERMISSION_DENIED` | 403 | 所有 `RoleChecker`／`AnyPermissionChecker` 與 router 內的權限檢查 | permission | 您沒有執行此操作的權限（需要 {permission}）。 |
| `ATTACHMENT_LOCKED` | 409 | 附件刪除／上傳（`attachment_access.lock_reason`） | docType, status, category? | {docType} 為「{status}」，附件已鎖定，不能變更。 |

`references` 的 `type` 用文件類型代碼（NCR、ITR、NOI、Observation、Checklist、Follow-up、ITP、PQP、FAT、Audit、OSD、User、QWorkflow、Material…），前端用現有的模組名稱翻譯。

### 5.2 第 2 批（存檔，共用的先做，約 15 個）

| 代碼 | 來源 |
|---|---|
| `PERMISSION_DENIED` | 沿用第 1 批（核准、結案、作廢權限） |
| `SCOPE_FORBIDDEN` | `core/scope.py`（4 種訊息，用 `reason` 參數區分） |
| `INVALID_TRANSITION` | 8 個模組、3 種寫法統一（params: docType, from, to） |
| `RECORD_LOCKED` | NCR／NOI／ITR／Audit／Follow-up／會議記錄／PQP 已結案、核准或作廢時被修改 |
| `REFERENCE_NOT_FOUND` | `validate_reference_exists`（params: docType, field, value） |
| `ASSIGNEE_UNAVAILABLE` | `core/assignees.py`（目前唯一的中英雙語訊息） |
| `VERSION_CONFLICT` | ITR 樂觀鎖、KM 409、材料 409 |
| `DUPLICATE_NAME` | 稽核模板、人員、角色、帳號、承包商與專案名稱（後兩者目前是 500） |
| `NCR_CLOSE_MISSING_FIELDS` | params: fields[]、hint |
| `NCR_CLOSE_NOT_VERIFIED`、`NCR_CLOSE_NEEDS_OWNER_APPROVAL` | NCR 結案條件 |
| `NOI_CLOSE_OPEN_ITRS`、`NOI_CLOSE_OPEN_NCRS`、`NOI_CONTRACTOR_LOCKED` | NOI |
| `ITR_APPROVE_NO_CHECKLIST`、`ITR_APPROVE_CHECKLIST_NOT_PASSED` | ITR 核准 |
| `CHECKLIST_RESULTS_MISMATCH`、`CHECKLIST_RESULTS_LOCKED` | Checklist |

其餘（ITR 約 25 條、IAM 密碼規則等）排第 3 批；未加代碼前以「中文通用句＋英文原文」顯示。

## 6. 測試與驗收（第 1 批）

- 前端：`tests-unit/refusal.test.ts`（每個代碼的中英文、沒有代碼的字串、404、403、5xx、網路、401 不顯示）；tsc、eslint、`npm test`。
- 後端：每個刪除代碼的 HTTP 測試（狀態碼、`code`、`params`、`detail` 英文不變）；ITP 與專案刪除改為 400 的 HTTP 測試；全套 pytest 加 Python 3.11 容器。
- 瀏覽器（隔離環境）：18 個刪除入口逐一觸發被拒 → 彈跳視窗、中文原因、頁面頂部沒有橫幅；切換英文介面再測一次；ITP 全螢幕編輯器上方也看得到視窗；清單載入失敗時仍顯示橫幅與「重試」。
- 獨立 Claude 審查 → 隔離預覽給使用者看 → 使用者確認後提交。

## 7. 使用者選定（2026-10-12，本工作階段）

四項都選建議方案：
1. 後端代碼：**方案 A**（回應加 `code`／`params`，保留英文 `detail`）。
2. 5xx 與網路錯誤：**也用彈跳視窗**（標題「刪除失敗／儲存失敗」）。
3. 分批：**第 1 批刪除、第 2 批存檔**。
4. 沒有代碼的拒絕：**中文通用句＋英文原文**。

原本的選項：

1. 後端代碼格式：A（建議）／B／C。
2. 5xx 與網路錯誤：也用彈跳視窗（標題「刪除失敗」，寫「請稍後再試」），或維持小提示。
3. 分批：第 1 批刪除、第 2 批存檔（建議），或一批全做。
4. 沒有代碼的拒絕：「中文通用句＋英文原文」（建議），或只顯示英文原文。
