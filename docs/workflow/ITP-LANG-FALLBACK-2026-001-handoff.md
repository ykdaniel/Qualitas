# ITP-LANG-FALLBACK-2026-001 — handoff（待獨立審查）

**一句話**：中英擇一政策的下游補齊——Insert After 選單與 Generate Checklist 改為「英文優先，英文 trim 後為空才用中文」，使用原字串、不改來源；已在隔離環境先重現、再驗證並獨立重讀新 Checklist。未提交、未部署。

## 審查請看
1. 程式：`react-app/src/utils/itpItemValidation.ts` 的 `preferEnglishText`；`ITPDetail.tsx`／`ITPAdvancedEditor.tsx` 各一行 Insert After；`ITPModals.tsx` Generate Checklist 兩行與一個 import。
2. 檢查輸出：`ITP-LANG-FALLBACK-2026-001-evidence/{tsc,build,unit-test,eslint-changed-files}.txt`。lint 限定 5 檔：0 errors、12 warnings（新增的那條為 `ITPModals.tsx` 既有警告）。
3. 重現與驗證：`ITP-LANG-FALLBACK-2026-001-evidence/browser-results.md`（修改前／後的 Insert After 選項文字、兩份 Checklist 的 POST 回應逐字、獨立重讀結果、來源 ITP 雜湊）。
4. 前一任務文件更正與封存：`ITP-REQUIRED-POLICY-2026-001-*-archive.md`。

## 請判斷
- 「兩者皆無內容時回傳原英文值」以維持既有輸出（例如只有空白的英文仍原樣回傳、再由既有 `filter(Boolean)` 處理）是否符合「保留既有行為」。
- Generate Checklist 只在清單頁觸發，是否足以涵蓋「兩個入口」的要求（`ITPDetail` 沒有此按鈕）。

## 不在本批
Apply／Save、版面、核准、必填驗證；Standard 對應；回填或翻譯；手機版。

## 環境
8270／3270 保留待審（含新測資與兩份測試 Checklist）；8240／3240、8198／3198 未觸碰。未提交、推送、部署。
