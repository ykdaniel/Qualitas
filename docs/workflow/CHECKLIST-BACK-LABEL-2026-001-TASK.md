# TASK — Checklist 從 ITP 進入時，Cancel 改為「Back to ITP」

TASK_ID: CHECKLIST-BACK-LABEL-2026-001
SOURCE: 使用者 2026-10-12 於協調中心：「cancel 右邊新增ＢＡＣＫ按鈕回到ＩＴＰ」。協調中心提出 A（從 ITP 進入時把 Cancel 改名為 Back to ITP）與 B（另加一顆 Back，功能重複），使用者選「Ａ」。由協調中心交辦本工作階段。

## 前一任務
CHECKLIST-TEMPLATE-LAYOUT-2026-001：已上線（正式站 632cf475，2026-10-12 07:35Z），文件留在 `docs/workflow/CHECKLIST-TEMPLATE-LAYOUT-2026-001-*`。

## 範圍
1. 只在網址帶 `returnItp`（且 `from=itp`，與 handleBack 返回 ITP 的條件相同）時，Checklist 編輯器底部 Cancel 按鈕顯示 ArrowLeft 圖示＋「Back to ITP」／「返回 ITP」。
2. 行為不變：沿用 ITP-CHECKLIST-RETURN-2026-001（PR #8）的 handleBack，回到 `/itp?reopenItp=<id>`；有未存修改時照舊先出提醒。
3. 沒有 returnItp 的入口（範本庫清單、New Template、from=itr、`/itp/:id` 頁 ITPDetail 的 from=itp 無 returnItp）照舊顯示 Cancel。ITP 編輯視窗的 Record 連結與 Generate Checklist 都帶 returnItp。
4. 範本模式與結果欄模式都要確認。
5. 新增翻譯鍵 `checklist.backToItp`（en「Back to ITP」、zh「返回 ITP」）；鍵名已於提交前告知協調中心並獲同意。

## 不在範圍
另加一顆 Back（方案 B）；返回行為、ITP 頁、後端、資料。

## 驗收
tsc、eslint（改動檔）、npm test；隔離環境瀏覽器實測（8374／3374）並留截圖；獨立 Claude 審查 PASS；使用者預覽確認後於 worktree 提交，hash 交協調中心（部署與重放由協調中心處理）。

## R2（2026-10-12，範圍擴大，R1 版本未提交）
SOURCE：使用者在 3374 看過 R1 後，於協調中心先說「按鈕排版要修正」，看過排版方案後回「除了列印還要有匯出word 再重新排版」。協調中心轉交。
1. 底部按鈕列重排，比照稽核精靈、NOI：左下 `[← 返回 ITP／取消] [列印] [匯出 Word]`，右下 `[儲存範本／儲存]`。返回／取消文字規則同 R1。「更新範本不影響既有 ITR 的引用內容」不再掛在儲存鈕下，改放左側按鈕之後或按鈕列上方，以版面平衡為準。1024 寬不得換行錯位。
2. 新增 Checklist Word 匯出：
   - 後端 `GET /checklist/{id}/export-docx`，權限與範圍比照檢視 Checklist，共用 core/docx_builder.py（參考 NOI）。
   - 內容：使用者選「B. 完全照列印版（建議）」——不分模式，與 ChecklistPrintTemplate.tsx 相同；範本的 Word 也是可手寫的空白檢驗表（空白 Situation／Result、簽名欄）。列印版不改。
   - 前端 api.ts 加呼叫；按鈕行為比照 NOI／Audit：有未存修改先提示「請先儲存」、不匯出；匯出中停用；失敗顯示友善訊息。新範本尚未存檔時同樣提示請先儲存（協調中心同意的預設）。
   - 翻譯鍵：新增 `checklist.exportSaveFirst`（協調中心同意）；按鈕沿用 common.exportWord／common.exporting／common.exportFailed。
   - 後端 HTTP 測試：200 與內容、404、無權限 403、範圍外。
3. 流程：tsc、eslint、npm test、後端相關測試、隔離瀏覽器實測（含下載 docx 打開檢查）、獨立審查、更新 3374 給使用者看，確認後提交、hash 交協調中心。部署前協調中心跑 3.11 全套，並與 NOI／NCR 合成同一次後端重建。
