# FORMS-2026-005 證據索引

本輪（R1）只新增了一條案例：MM scenario 4（在已保存會議上明確清空行動項目草稿、同時修改標題
欄位，再 Save，核對 response/reread/放棄文字未落地）。

- `mm-04-explicit-clear-then-saved.png` — 本輪重寫後的 scenario 4 執行截圖，於本輪自建隔離堆疊
  （backend/vite 8200/3200，root `qualitas-manual-fdh1brxv`）上產生，輸出目錄為本輪專屬的
  `FORMS_REVIEW_EVIDENCE_DIR=/private/tmp/claude-501/forms-2026-005-evidence`（不再共用
  FORMS-2026-003/004 的暫存目錄）。

其餘 scenario（1a–1f、2、3、4b）本輪重新執行只是為了確認完整腳本仍通過（51/51，含本輪新增的
7 項斷言），並非本輪修改內容，對應截圖已存在於 `docs/workflow/FORMS-2026-004-evidence/`，不重複
存放。
