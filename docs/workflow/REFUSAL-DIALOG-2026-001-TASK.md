# REFUSAL-DIALOG-2026-001 — 刪除／存檔被拒改用彈跳視窗（全系統）

TASK_ID: REFUSAL-DIALOG-2026-001
SOURCE: 使用者 2026-10-12 在協調中心看 NCR 預覽時提出：「需要是彈跳視窗提醒 不然太不明顯了 其他模組有這問題嗎？」；選「方案 1」：NCR 那批照原樣先上線，彈跳視窗另開一批，一次套用到所有模組。由協調中心交辦本工作階段。

## 目前階段
設計 v1 已由使用者選定（2026-10-12：代碼方案 A、5xx／網路也用彈跳視窗、先刪除再存檔、未翻譯時中文通用句＋英文原文）。**本輪＝第 1 批：共用元件＋刪除**（DESIGN 第 4 節、第 5.1 節）。實作前等協調中心確認基準 HEAD。

## 第 1 批延後到第 2 批的項目
- DESIGN 3.2 第三點：Audit 橫幅的 ×、OBS／OSD／會議記錄沒有按鈕的橫幅，統一改成「只用於載入失敗＋重試」。等存檔也改用彈跳視窗後再做（R1 審查 S1）。
- 沒人用的翻譯鍵清理（`noi.deleteBlocked`、`noi.citedBy.*`、`contractors.personnel.blocksDelete`、`itp.deleteError`）。

## 範圍
- 共用「操作被拒」彈跳視窗：標題「無法刪除／無法儲存」、原因、只有「我知道了」、不會自動消失。
- 所有模組被拒的刪除與存檔（400／403／409）改用彈跳視窗；頁面頂部橫幅只留給清單載入失敗，這時才有「重試」。
- 原因用中文（英文介面用英文）；後端加錯誤代碼與參數，保留英文 detail。
- 成功提示維持 sonner。

## 限制
- 不改 `docs/workflow/COORDINATION.md`。
- 實作前向協調中心確認基準 HEAD；NOI／NCR／Checklist 三批上線並重放完成前，不動 NOI.tsx、NOIDetailModal.tsx、api.ts、LanguageContext.tsx、NCR.tsx、ncr_service、noi_service、Checklist.tsx。
- 動共用檔（LanguageContext.tsx、schemas.py、DECISIONS.md、main.py）前先通知協調中心。
- 不用 git stash／reset／checkout；不推送；不碰 NAS、正式站、backend/qualitas.db；沒有拋棄式 DATABASE_URL 不 import main。
- 隔離環境 port 不用 3293、3341、3380、8198／3198、8240／3240。
- 流程：設計 → 使用者選定 → 實作 → tsc／eslint／npm test／後端測試 → 隔離瀏覽器實測 → 獨立 Claude 審查 → 隔離預覽給使用者 → 使用者確認後提交，hash 交協調中心。部署由協調中心排。
