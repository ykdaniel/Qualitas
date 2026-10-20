# STATUS.md — Claude 執行結果

TASK_ID: KM-DOCS-2026-001-D2
ROUND: 1（2026-10-20；本輪中途依使用者指示改用 Opus 5.5 接續）
基準：608c14c4（D1＋B3b 已上線）＋ 057d2898（D1 上線紀錄，docs-only）。detached worktree km-d2，未推送、未部署。

## RESULT
- [x] 公司文件前端入口完成：`/km` 文件登錄清單、`/km/:documentId` 詳情、`/km/legacy` 舊知識庫唯讀。後端 **0 檔**、LanguageContext **0 鍵**。
- [x] `tsc` 0、eslint 0（新／改檔）、單元測試 **239 passed**（含新增 documentsText／documentsApi 兩檔）、`vite build` 成功。
- [x] R1 **REVISE**（1 P1、3 P2、6 P3）→ 全部修正或列後續 → R2 **PASS**（見 REVIEW）。
- [x] 隔離環境預覽（isolated_stack，backend 8390／vite 3390）：瀏覽器核對腳本 **10/10**（`tests-browser/km-docs-d2-register.mjs`，輸出 `KM-DOCS-2026-001-D2-evidence/register-check.json`＋截圖）；另手動實測設為現行、封存後只改標籤、409 重新載入後重開。
- [ ] 使用者預覽確認：待主要調度轉交（URL／帳號／檢查表見下）。
- [ ] 遷移腳本：仍不執行（Q5 待使用者）。
- 3.11：後端未改，沿用 D1 指紋。

## 決定
U1 側欄維持「知識管理 (KM)」；U2 PDF 高度隨視窗；U3 預設更新時間新→舊（由後端排序）；U4 舊知識庫入口在清單右上角（主要調度 2026-10-20 依建議值裁定，已轉使用者）。

## 本輪修改
### 新增
| 檔案 | 內容 |
|---|---|
| `components/Documents/DocumentsRegister.tsx` | 清單：類型／狀態篩選、「含封存」、後端搜尋（300ms debounce）＋命中片段、＋登錄文件（km:create）、舊知識庫連結；無權限顯示友善拒絕。 |
| `components/Documents/DocumentDetail.tsx` | 標頭、現行版 PDF 內嵌、**三種空狀態**（無任何版次／有版次但無現行／現行無 PDF，皆附「新增版次」）、版次歷史（下載 Word／PDF、可搜尋標記、草稿「設為現行」無 PDF 時停用並提示）、引用唯讀、動作（新增版次／設為現行／編輯基本資料／封存／解除封存／刪除草稿，依 km:* 與範本限管理員）；409 經 reloadAndReopen。 |
| `components/Documents/DocumentDialogs.tsx` | 登錄／編輯（封存時只開放標籤、只送 tags；管理員才有範本選項）、新增版次（Word／PDF 皆選填、至少一個、類型與大小預檢、**PDF 在設現行時必填的提示**、multipart 一次送出）、設為現行（只能選有 PDF 的草稿，可預選）；FormShell／FormActions／useDraftGuard／showRefusal；role=dialog。 |
| `components/Documents/PdfViewer.tsx` | axios 取 blob → iframe；換版次或卸載時 revoke；另開視窗／下載。 |
| `components/Documents/columns.tsx`、`documentsText.ts`（zh／en 模組自有文案）、`Documents.module.css` | |
| `services/documentsApi.ts`、`store/documentsStore.ts`、`types/documents.ts` | API（row_version 隨 PATCH／transition）、狀態（清單與單筆皆丟棄舊回應）。 |
| `tests-unit/documentsText.test.ts`、`documentsApi.test.ts` | 中英鍵一致、placeholder、清單 query 形狀、row_version、multipart 欄位。 |
| `tests-browser/km-docs-d2-register.mjs`、`km-docs-d2-vite-launcher.mjs` | 預覽核對腳本；vite 3390 → 8390，獨立 cacheDir。 |
### 修改
- `App.tsx`：`/km` → DocumentsRegister、`/km/legacy` → `<KM readOnly />`、`/km/:documentId` → DocumentDetail（lazy）。
- `components/KM/KM.tsx`（CRLF 保留，+15／−5）：`readOnly` prop 把 create／update／delete 權限歸零，清單頁加唯讀橫幅與「回文件登錄」連結；檢視、列印、匯出 Word、歷史保留。
- `BACKLOG.md` #61 D2 子項改 DONE（待部署）。

## 預覽（交主要調度轉使用者）
- URL：http://localhost:3390（隔離 backend 8390；run dir 見 isolated_stack 輸出，關閉用 `isolated_stack.py down --root <run dir>`）
- 帳號：admin（隔離環境自動產生的密碼，由主要調度向本工作階段索取或讀 run dir 的 admin-password）
- 示範資料：QTS-KM-000001 焊接作業程序書（現行 Rev1.0＋只有 Word 的草稿 Rev2.0）、-000002 油漆施工指引（無版次）、-000003 鋼筋綁紮標準（現行 Rev A，已封存，勾「含封存」可見）、舊知識庫一本兩章。

## 未測／注意
- 預覽面板的內嵌瀏覽器在部分情況下不渲染 PDF（深色區塊）；playwright 與一般 Chrome 正常內嵌。
- 後續（不在本批）：P3-6 後端 `delete_document` 未限範本只管理員可刪；搬遷舊 KM 文章（Q5）；D3 範本套用、D4 專案文件入口、D5 跨模組引用。
