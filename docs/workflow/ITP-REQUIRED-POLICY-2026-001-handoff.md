# ITP-REQUIRED-POLICY-2026-001 — handoff（待獨立審查）

**一句話**：ITP 檢驗項目 Activity／Standard 由「英文必填」改為「各自英文或中文至少填一項」（trim 後判斷），兩個編輯器共用一個判斷函式，標示改為文字說明、移除星號；決策已記入 DECISIONS.md 與 BACKLOG #36。未提交、未部署。

## 審查請看
1. 決策：`DECISIONS.md`「ITP 檢驗項目 Activity／Standard 中英擇一必填」；`BACKLOG.md` #36 標題與決策說明（歷史原文保留）。
2. 程式：`react-app/src/utils/itpItemValidation.ts`；`ITPDetail.tsx` `handleSave`、`ITPAdvancedEditor.tsx` `handleSaveItem` 的驗證；兩檔 Activity／Standard 標題；`LanguageContext.tsx` 兩個新鍵。CRLF 檔已確認換行未被改動。
3. 檢查輸出：`ITP-REQUIRED-POLICY-2026-001-evidence/{tsc,build,unit-test,eslint-changed-files}.txt`。lint 限定 5 檔：0 errors、11 warnings、exit 0。第一次執行因 shell 拆字問題作廢，保留於 `attempt1-shell-wordsplit-bug/`。
4. 瀏覽器：`browser-results.md`、截圖 `01`、`02`。兩個入口各 12／12；只填中文往返逐字保留。

## 請判斷
- 下游只用英文的兩處：Insert After 選單（只填中文顯示為「A2 -」，實測）；Generate Checklist（項目只剩 `[項目編號]`、缺中文活動描述，中文 Criteria 未帶入；讀碼確認，未實測）。是否要另開任務改為「英文空則用中文」。
- 清單頁 Apply 即寫入（既有行為）使隔離資料庫已有測試資料，是否需要在報告中另作處理（僅隔離環境）。

## 不在本批
Subject 加寬或其他 UI 改善、手機版、資料回填或清洗、自動翻譯。

## 環境
8270／3270 保留待審；8240／3240、8198／3198 未觸碰。未提交、推送、部署。
