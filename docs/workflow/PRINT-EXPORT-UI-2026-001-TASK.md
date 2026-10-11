# PRINT-EXPORT-UI-2026-001 — TASK（列印／Word 按鈕一致性）

TASK_ID: PRINT-EXPORT-UI-2026-001 · ROUND: R1
SOURCE: 使用者 2026-10-10 在對話中要求檢查各模組列印／Word 的位置是否一致。盤點結果：表單類模組都在 `FormActions` 的 tools 區（左下），位置已經一致；Audit（精靈各步驟標題旁）與 KM（閱讀頁上方導覽列）屬合理例外。使用者決定：
1. **Audit 模組先不看**（不改）。
2. 做 #1：Word 匯出加上錯誤處理（try/catch、友善提示、匯出中狀態、防重複點擊）——適用 NOI、ITR。
3. 圖示：**Audit 以外，列印／Word 按鈕全部加上圖示**（列印 `Printer`、Word `FileText`，lucide-react，size 16，沿用 ITP／Checklist 的寫法）。
4. 不做：#2（NCR 匯出中顯示「儲存中」）、#3（翻譯 key 統一、KM 寫死中文）、#5（儲存中停用列印）。

## 範圍
- NOI `NOIDetailModal.tsx`：Word 匯出 handler + 圖示。
- NCR、OSD、OBS、PQP（編輯與檢視兩處）、FollowUp、FAT、會議紀錄、Material 核准檢視：按鈕加圖示。
- `LanguageContext.tsx`：新增 `common.exporting`、`common.exportFailed`（中英）。
- ITP、Checklist、KM 已有圖示，不動。
- **ITR（`ITRModals.tsx`）延後（2026-10-11 已補，見 STATUS）**：該檔有另一工作階段（ITR 檢查表未儲存提示）尚未提交的修改。依 CHECKLIST-TEMPLATE-CLEAN 的前例，等對方提交後再改（Word 匯出錯誤處理＋編輯視窗與預覽視窗的列印／Word 圖示）。依使用者「ITR 介面改動先告知」的約定，已在對話中告知。

## 限制
只改前端；不改後端與資料；不提交、推送、部署，除非使用者指示。驗證使用獨立隔離環境（8291／3291），不碰 8198／3198、8240／3240。
