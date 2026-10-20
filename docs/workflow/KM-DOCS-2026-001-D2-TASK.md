# TASK.md — KM-DOCS 第 2 批：公司文件前端入口（主要調度 2026-10-20 核定）

TASK_ID: KM-DOCS-2026-001-D2
SOURCE: DESIGN §4／§6 第 2 批；主要調度 2026-10-20 指示「B3b 已上線，D2 可以開工，基準 608c14c4，開工前先交檔案清單」。
基準：**608c14c4**（D1＋B3b 已上線的正式站版本）。worktree km-d2（已含 D1 STATUS 上線紀錄 commit 057d2898）。
範圍原則：只做**公司層**入口（scope=company）；專案文件入口是 D4；範本套用是 D3；引用呼叫端是 D5。後端**不改**（D1 API 已齊：清單／詳情／建立／PATCH／版次 multipart／補綁／下載／轉換／引用）。遷移腳本仍不執行（Q5 待使用者）。REFUSAL B4 正在改 ITR 檔，本批不碰 ITR；LanguageContext 預計 **0 鍵**（文案走模組自有 `documentsText.ts`，與材料送審的 `materialText.ts` 同手法，避免三方合併衝突）。

## 1. 畫面
1. **登錄清單**（側欄「知識管理」入口 `/km` 改指向此頁）：DataTable 欄位——編號、標題（中／英）、類型、現行版次、狀態、生效日、更新時間；篩選類型／狀態（預設隱藏 archived，可勾「含封存」）；搜尋框走後端 `q`（編號／標題／標籤／現行版抽出文字）並顯示命中片段；「＋登錄文件」按鈕（km:create）；範本列標示「範本」（admin 才有建立範本選項）；右上角連結「舊知識庫（唯讀）」。
2. **文件詳情** `/km/:documentId`：標頭（編號、標題、類型、狀態徽章、生效日、標籤、負責人）；主區 **PDF 內嵌檢視**（現行版 PDF；以 axios 取 blob 後給 `<iframe src=blobUrl>`，不需後端改 token 機制；無 PDF 時顯示「此版尚無 PDF」與 Word 下載）；右側版次歷史（版次、狀態、變更摘要、建立者、日期、Word／PDF 下載、`searchable` 標記）、被引用清單（唯讀，D5 前通常為空）；動作列（依權限與狀態）：新增版次、設為現行（選版次）、封存／解封、編輯基本資料、刪除草稿。
3. **對話框**：登錄文件（標題中／英、類型、分類、標籤、生效日、負責人；admin 另有「這是範本」＋佔位符清單）；編輯基本資料（帶 row_version，409 走共用 refusal 對話框「重新載入這筆」）；新增版次（Word、PDF 檔案欄各一、變更摘要、版次標籤選填；multipart 一次送出；PDF 上限 50MB 前端先擋）；設為現行（列出草稿版次供選，缺 PDF 時按鈕停用並說明）；封存／解封／刪除用共用 ConfirmModal；所有拒絕走 `showRefusal`（D1 補丁已有五個代碼的文案）。
4. **舊知識庫（唯讀）** `/km/legacy`：沿用現有 `KM.tsx`／`KMDetail.tsx`，加 `readOnly` prop（隱藏新增／編輯／刪除／Word 匯入；保留檢視、列印、Word 匯出、歷史）；頁首橫幅「舊版知識庫已改為唯讀，新文件請至文件登錄」。KMModals 不改（B3b 剛動過）。
5. **權限**：清單與詳情 km:view；登錄／新版次／轉換 km:update（建立 km:create）；刪除 km:delete；範本相關 admin。側欄維持 `km.title`，是否改名「文件管理」列為 UI 決定（§4）。

## 2. 技術
- 新 `services/documentsApi.ts`（axios，對應 D1 路由；`withRowVersion` 於 PATCH／transition；multipart 版次上傳）；新 `store/documentsStore.ts`（zustand：list、current、loading、error、accessDenied；fetchList(params)、fetchOne(id)、create、update、addVersion、transition、remove）；新 `types/documents.ts`。
- `documentsText.ts`（zh／en 物件＋`documentsText(language, key, params)`），單元測試檢查 zh／en 鍵集合一致。
- PDF 檢視：`PdfViewer.tsx`——取 blob、`URL.createObjectURL`、unmount revoke；大檔顯示載入中；瀏覽器不支援內嵌時給下載連結。
- 離開保護：對話框沿用 `useLeaveGuard`（有輸入未送出時）。
- 列印：不做（PDF 自行列印）。

## 3. 預計修改／新增的檔案（獨佔請求）
**新增**
- `react-app/src/components/Documents/DocumentsRegister.tsx`、`DocumentDetail.tsx`、`DocumentDialogs.tsx`、`PdfViewer.tsx`、`columns.tsx`、`documentsText.ts`、`Documents.module.css`
- `react-app/src/services/documentsApi.ts`、`react-app/src/store/documentsStore.ts`、`react-app/src/types/documents.ts`
- `react-app/tests-unit/documentsText.test.ts`（zh／en 鍵一致、params 代入）、`react-app/tests-unit/documentsApi.test.ts`（payload／row_version 形狀）
- `react-app/tests-browser/km-docs-d2-register.mjs`（預覽核對腳本：清單→登錄→新版次→設現行→PDF 內嵌→封存鎖定→舊知識庫唯讀）
**修改**
- `react-app/src/App.tsx`：`/km` → DocumentsRegister、`/km/:documentId` → DocumentDetail、`/km/legacy` → KM readOnly（lazy）。
- `react-app/src/components/KM/KM.tsx`：`readOnly` prop＋唯讀橫幅（≈15 行）；`KMDetail.tsx` 若需隱藏匯入／編輯按鈕以 `canEdit=false` 既有 prop 達成，預期不改。
- `react-app/src/components/Shared/AppLayout.tsx`：預期不改（入口路徑與權限碼不變）；若使用者選擇改側欄名稱才改 1 行。
- `react-app/src/context/LanguageContext.tsx`：**0 鍵**（預期）。
- 後端：**0 檔**。
- 文件：`BACKLOG.md` #61 D2 子項、`docs/workflow/KM-DOCS-2026-001-D2-{TASK,STATUS,REVIEW}.md`、`-D2-evidence/`。

## 4. 待決定（UI，請主要調度轉使用者或依慣例裁定）
- U1 側欄名稱：維持「知識管理 (KM)」（建議，D4 專案文件另立入口時再整體改名）或改「文件管理」。
- U2 詳情頁 PDF 內嵌高度：隨視窗（建議，右側欄固定寬 320）或固定 800px。
- U3 清單預設排序：更新時間新→舊（建議）或編號。
- U4 舊知識庫入口位置：清單右上角連結（建議）或側欄子項。

## 5. 驗證
- `tsc` 0、`npm test`（新增 2 檔）、`vite build`；eslint 無新增。
- 隔離環境預覽（docs/workflow isolated_stack，sandbox 外），登入後由使用者看過清單／詳情／新版次／PDF 內嵌／舊知識庫唯讀（feedback_preview_ui_in_isolated_env）；tests-browser 腳本留紀錄。
- 後端不改：3.11 不重跑，沿用 D1 指紋。
- 獨立審查 R1（前端：權限 gating、row_version、blob 釋放、拒絕對話框、唯讀橫幅）。

## 6. 交付
commit hash、預覽埠與帳號、STATUS、tests-browser 紀錄、截圖。

## 7. 核定與補充（主要調度 2026-10-20）
- 檔案清單照准；U1–U4 照建議值（側欄維持「知識管理 (KM)」、PDF 高度隨視窗、預設更新時間新→舊、舊知識庫入口在清單右上角），使用者改口再通知。
- 補充要求：(1) 詳情頁沒有現行 PDF 時有明確空狀態（「尚未上傳 PDF」＋新增版次按鈕），不能空白；(2) 新版次對話框 Word／PDF 都可選，PDF 在設現行時必填，前端先提示。
- 使用者 2026-10-20 指示本工作階段改用 Opus 5.5 接續 D2。

