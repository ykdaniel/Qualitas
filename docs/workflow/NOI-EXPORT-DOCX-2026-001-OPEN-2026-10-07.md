# NOI-EXPORT-DOCX-2026-001 — 未結案說明（2026-10-07）

**此任務仍為 REVISE，尚未結案。** 根目錄的 TASK.md／STATUS.md／REVIEW.md 於 2026-10-07 改給
`DOCX-PATH-GUARD-2026-001` 使用，本任務的控制文件已在覆寫前逐字保存：

| 檔案 | SHA-256（與覆寫前根目錄檔案相同） |
|---|---|
| `NOI-EXPORT-DOCX-2026-001-TASK-2026-10-07.md` | `d8530009729e0d2417cb6a0f74accb4bf9475c4736cc9a3f4298b106ac63b199` |
| `NOI-EXPORT-DOCX-2026-001-STATUS-2026-10-07.md` | `70fa54216451f6bf1c789b573a43d16c8f5fecdc71beaa86bf600074f34044c1` |
| `NOI-EXPORT-DOCX-2026-001-REVIEW-2026-10-07.md` | `65aea02331ae3f29b08ebfc3011c63d971f668d961e53f03fb13a734bdaa52f8`（僅指檔尾「2026-10-07 更正」區塊之前的原文；更正區塊另行附加） |

（同目錄另有更早的 `NOI-EXPORT-DOCX-2026-001-{TASK,STATUS,REVIEW}-archive.md`，是更早的快照，未覆寫。）

**未完成的 REQUIRED_FIXES**（摘自上述 REVIEW 原文）：
1. `NOIDetailModal.tsx` 的「Export Word」按鈕沒有錯誤處理。
2. 匯出端點缺少自動化回歸測試與負向案例（403／404）。

REVIEW 原文由 Claude 自我審查（非獨立）。`DOCX-PATH-GUARD-2026-001` 修的是 ITR／NCR／NOI 共用的
`resolve_local_upload_path`，**不**處理上述兩項，也**不**改變本任務的 REVISE 判定。
