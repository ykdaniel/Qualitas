# REVIEW.md — 獨立審查

TASK_ID: ITP-CHECKLIST-RETURN-2026-001
審查日期：2026-10-11
審查者：未參與實作的獨立 agent（本會話另開，只讀，不改產品程式）。下方「補正後核對」由實作者（Claude）記錄，不是新的獨立審查結論。

## EVIDENCE_CHECK
審查者實際重跑：`tsc --noEmit` exit 0；`npm test` 144 pass / 0 fail；改動檔 ESLint 1 error／3 warnings，全數為基準 `a80799f` 既有問題，本輪未新增。換行格式：CRLF 檔（Checklist、ITPAdvancedEditor、LanguageContext）新增行皆 CRLF，無整檔轉換。封存檔與 HEAD 版本逐字相同。STATUS 所述瀏覽器 13 項 PASS、5 張截圖與證據檔相符。

## SCOPE_CHECK
只改前端 ITP／Checklist 導頁；`/itp/:id`（ITPDetail）、`from=itr`、後端皆未動，與 TASK 一致。`returnItp`／`reopenItp` 只用於比對使用者範圍內的 ITP id，網址以 URLSearchParams 編碼、路徑固定，無 open redirect 或 XSS 管道（讀碼）。

## DECISIONS_CHECK
未新增業務政策。部署適用「每批 PASS 後完成準備即提交、推送及部署」，但正式站部署需要使用者環境的 NAS 存取，本輪不在雲端環境執行。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無阻擋項。非阻擋建議 6 項：
1. 瀏覽器「上一頁」與頁面 Cancel 行為不一致，且返回後歷史有兩筆 /itp → 寫入已知限制（實作者決定本輪不改）。
2. `returnItp` 在整個 Checklist 頁停留期間有效 → 寫入已知限制（非回歸）。
3. 清單為空時 `reopenItp` 不會被消耗 → **已補正**。
4. 兩個 effect 從舊參數刪除，人為構造網址時可能互相加回 → 寫入已知限制。
5. 新工具函式缺單元測試 → **已補正**（4 個測試）。
6. 隔離測試帳號密碼寫在驗證腳本（repo 既有 46 支腳本同模式）→ 提供使用者知悉，可考慮在 DECISIONS 明訂例外。

## 補正後核對（實作者記錄）
- ITP.tsx 補正後：`tsc` exit 0、`vite build` exit 0、`npm test` 148 pass / 0 fail、改動檔 ESLint 與基準相同（1 error／3 warnings）。
- 重建隔離環境重跑瀏覽器情境：13 項全部 PASS（`docs/workflow/ITP-CHECKLIST-RETURN-2026-001-evidence/browser-scenarios.txt`）。
- 補正內容未再經獨立審查；改動限於 ITP.tsx 的 reopen effect 判斷條件與新增單元測試檔。

## NEXT_STEP
提交分支 `fix/itp-checklist-return` 並開 PR。合併後的正式站部署須在使用者環境依既有部署程序執行（前端建置、NAS 候選包、回退準備、冒煙）。
