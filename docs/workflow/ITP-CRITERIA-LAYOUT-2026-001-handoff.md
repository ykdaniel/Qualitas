# ITP-CRITERIA-LAYOUT-2026-001 — handoff（待獨立審查）

**一句話**：ITP 檢驗項目編輯面板的每條 Criteria 改為同一框內「左英文、右中文」，Phase 在桌面固定半列；兩個編輯器同步；只改版面，未提交、未部署。

## 審查請看
1. 程式差異：`git diff -- react-app/src/components/ITP/ITPDetail.tsx react-app/src/components/ITP/ITPAdvancedEditor.tsx`（`ITPAdvancedEditor.tsx` 為 CRLF 檔，已確認維持 CRLF，差異 19 行）。
2. 前端檢查：`ITP-CRITERIA-LAYOUT-2026-001-evidence/{tsc,build,unit-test,eslint-changed-files}.txt`（完整輸出、退出碼、檔案雜湊）。lint 為**限定兩個變更檔：0 errors、11 warnings、exit 0**，警告未清除，不代表全專案 lint 通過。
3. 瀏覽器實際結果：`ITP-CRITERIA-LAYOUT-2026-001-evidence/browser-results.md` 與截圖 `01`–`09`。

## 請判斷
- 每條外框＋左右兩欄是否足以表達「同一條 Criteria」。
- 一般桌面以內建瀏覽器 1366×768 模擬（Chrome 視窗無法縮小）是否可接受。
- `ITPAdvancedEditor` 只在 1366 驗、往返儲存只在 `ITPDetail` 做，是否需要補。
- 長文字在 2 行高的框內捲動是否可接受（本批未做自動長高）。

## 不在本批
英文必填與 BACKLOG #36（待使用者決策）、手機版（延期）、Subject／日期／Record／翻譯整理、資料與保存邏輯。

## 環境
新開 8260／3260 保留待審；8240／3240、8198／3198 未觸碰。未提交、推送、部署。
