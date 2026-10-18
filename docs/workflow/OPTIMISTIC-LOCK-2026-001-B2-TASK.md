# OPTIMISTIC-LOCK-2026-001 — B2（視窗第一組＋「重新載入這筆」）

- **TASK_ID**：OPTIMISTIC-LOCK-2026-001（本輪＝B2）。B1 已提交 04a38cd4，併入部署候選。
- **基準**：27839efd（04a38cd4 加上 ITR ATTACH-SECTION-UX）。工作樹 scratchpad/ol-b2（detached）。
- **檔案清單**：協調中心 2026-10-18 照准。清單內的檔案由本工作階段獨佔；NOIDetailModal.tsx、AuditWizard.tsx、LanguageContext.tsx 是 CRLF。

## 範圍
1. **共用**：
   - hooks/useRecordVersion.ts（新檔）：表單開啟時取一次版本；存檔成功後改用伺服器回傳的版本，第二次寫入也一樣；表單開著時不從清單重新取版本。
   - utils/refusal.ts：`isVersionConflict`，選項加 `onReload`、`reloadDiscardsInput`。
   - store/refusalStore.ts。
   - Shared/RefusalDialog（+ css）：VERSION_CONFLICT 時多一顆「重新載入這筆」。表單的情況會先在對話框內確認「捨棄並重新載入」；列表動作沒有輸入會丟失，按下就直接重新載入。
   - LanguageContext 加 4 個鍵（中英各一）。
2. **各模組**：頁面記住版本、存檔時帶出，並提供 reloadRecord（關掉表單 → 依頁面目前的篩選重抓清單 → 重新打開這筆）；視窗把它交給 showRefusal。
   - NCR、OBS、NOI、OSD。
   - 會議記錄：同一次存檔裡延後的 Published／Void 第二次寫入、表單內的作廢、列表上的作廢。
   - PQP：存檔與視窗內的發行。
   - Audit：精靈自己記住版本，「存草稿」不關視窗。
   - 材料：RegisterDialog 用最後寫入或開啟時的 rowVersion；重新開啟時依文件編號找回這筆。
3. **不做**（協調中心 2026-10-18 決定）：PQP 存檔時改 updatedAt 的行為維持原狀。
4. **測試**：tests-unit/recordVersion.test.ts。後端不動。
5. **預覽**：照 docs/workflow/OPTIMISTIC-LOCK-2026-001-B2-PREVIEW-CHECKLIST.md，由協調中心請使用者看。

## 完成條件
tsc、npm 單元測試、R1（審查代理要特別看會議記錄與 Audit 的第二次寫入）、隔離預覽並經使用者確認、以 27839efd 為父在本地 commit，交出 hash。
