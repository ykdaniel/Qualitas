# MATERIAL-SUBMITTAL-M5 — STATUS（部署準備 R1，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M5-2026-001
ROUND: R1。M4 的 R2-PASS 控制文件已逐字封存為 `MATERIAL-SUBMITTAL-M4-R2-PASS-{TASK,STATUS,REVIEW,handoff}-archive.md`（cmp 相同）；M4 R1-REVISE 封存與全部證據保留。
**材料功能尚未上線。本輪沒有修改產品程式、沒有提交、推送或部署，沒有連 NAS。** 根目錄 DEPLOY-EXEC 控制文件與使用者預覽 8240／3240 未動。不自填 PASS。

## RESULT
- [ ] DONE
- [x] PARTIAL（準備文件與演練已完成；3.11 全套第一次執行因驗證環境的目錄結構而失敗，原因已查明，見「Python 3.11」；範圍因 M6 改變，須重做）
- [ ] BLOCKED

## 產出
| 檔案 | 內容 |
|---|---|
| `MATERIAL-SUBMITTAL-M5-deploy-plan.md` | 前置條件、部署範圍、schema 變更、備份、演練、啟動失敗的處理、回退分級、切換框架、待決事項 |
| `backend/scripts/verification/m5_upgrade_rollback_rehearsal.py`（新增，只用於驗證，不部署） | 升級與回退演練腳本。只接受 `/rehearsal/` 下的資料庫，並且必須設定 `M5_REHEARSAL=1` |
| `MATERIAL-SUBMITTAL-M5-evidence/` | 以下各項證據 |
| 本機 `~/Documents/Qualitas-deploy-artifacts/MATERIAL-SUBMITTAL-M5/` | 後端候選樹（附 manifest）、回退演練用的舊版樹、前端候選 `frontend-dist/`、演練用的 runner。未上傳 |

## 驗證
1. **部署範圍**（`reviewed-hash-reconciliation.txt`）：
   - 後端 overlay 24 檔（DOCX 3＋材料 21）、前端 overlay 24 檔（已上線的 ITP 7＋材料 17）。
   - 清單恰好等於相對 HEAD 有變更的 backend／react-app/src 檔案，只排除驗證用的 seed。
   - **48 檔全部等於最後一次審查時的雜湊**：M1／M2／M3-r2／M4-r2、DEPLOY-SCOPE-INVENTORY，DOCX 測試另以 DEPLOY-EXEC 的 py311 證據核對。
   - 逐檔閱讀共用檔的差異，除材料外沒有其他任務的修改。
   - 發現 `projectStore.ts` 在 M4 被改成 LF（HEAD 是 CRLF），實際內容差異只有 2 行；照審查通過的版本部署，不另修改。
2. **前端候選**（`frontend-candidate-checks.txt`、`frontend-candidate-dist-sha256.txt`）：
   - 以 056c245c 的 git archive 加上 24 個 overlay 檔建構。
   - tsc EXIT 0；npm test 168 pass，EXIT 0；vite build EXIT 0。
   - 產出 104 檔，`index.html` 為 `3a45562b…`。
3. **升級與回退演練**（`upgrade-rollback-rehearsal.txt`，Python 3.11.17，拋棄式 SQLite）：
   - 6 個階段全部 PASS，EXIT 0：舊版 → migration → 新版寫入資料 → 新版重啟 → 只回退程式 → 再升級。
   - migration 只新增 4 表、11 個索引與 1 個欄位；舊表中只有 permissions 與 role_permissions 有變化。
   - 回退後舊版可以正常運作，材料資料與回覆天數都保留；再升級時資料完整。
   - 第一次嘗試在任何檢查之前就失敗（runner 少裝 httpx），已註明在證據檔中。
4. **Python 3.11 後端全套**（`py311-backend-full-suite.txt`）：見下方「Python 3.11」一節。

## Python 3.11
- `py311-backend-full-suite.txt`（python:3.11-slim，M5 候選樹，單執行緒）：**98 failed／2335 passed／15 skipped，EXIT 1**。
- 原因已查明，**是驗證環境的目錄結構問題，不是程式問題**：
  - 該次把 backend 掛在容器的 `/work`，上層目錄是 `/`。startup guard 因此把所有暫存目錄都判定為「位於專案目錄內」（61 項失敗訊息是 `UnsafeDatabaseError: The run directory overlaps the project tree.`）。
  - 另有數項測試要讀 `react-app/src/...`，但容器內沒有這個目錄。
- 佐證 `py311-layout-recheck.txt`：同一份候選樹改用 repo 的目錄結構（`/q/backend`＋`/q/react-app`），重跑先前失敗的 9 個測試檔：**190 passed／14 skipped，EXIT 0**。
- 結論：M5 的 3.11 驗證要用 repo 目錄結構重跑全套。14 項 skipped 的原因尚未逐一查明。
- 因 M6 改變了部署範圍，候選樹本來就要重做；重做時依上述方式跑全套。

## 未驗證／限制
- 正式環境的實際狀態（程式漂移、容器、權限、資料庫大小）尚未知，要等使用者執行 DEPLOY-EXEC 預檢 r3。
- 本輪的演練是在拋棄式資料庫上進行，不是正式資料的副本。是否用正式資料副本再演練一次，需要使用者同意，因為那會取得正式資料。
- 具體的 NAS 指令（備份、上傳、切換、回退）尚未撰寫，要等 P1 的結果，並另行送審。
- 手機版延期；DataTable 表格調整是另一個待辦（`docs/planning/MATERIAL-SUBMITTAL-TABLE-DATATABLE-NOTE-2026-10-09.md`），不在本次部署範圍內。
- 隔離環境 8310／3310 仍在運作，供使用者檢視；需要時再關閉。

## 範圍變動（2026-10-09，本輪之後）
使用者指示「先改表格」，另開 `MATERIAL-SUBMITTAL-TABLE-2026-001`，改了 `MaterialSubmittal.tsx`、`materialText.ts`、`AppLayout.tsx`，並新增 `columns.tsx`。因此本 STATUS 中的**前端部署範圍、雜湊核對與 `frontend-dist` 已過時**，要等 TABLE 輪 PASS 之後重做。後端範圍與演練不受影響。

## 範圍變動（2026-10-09，M6 最終版）
M6 最終改為核准材料登錄簿：舊送審路由移除，權限由 3 個減為 2 個，前端大幅改寫，新增 `GET /approved`、`register`、儀表板卡片、列印與匯出。本 STATUS 的部署範圍、雜湊核對、候選樹、`frontend-dist` 與演練**全部過時**，要等 M6 PASS 後重做。
- 演練腳本 `backend/scripts/verification/m5_upgrade_rollback_rehearsal.py` 仍呼叫舊路由，並假設有 3 個權限，必須改寫。
- 3.11 全套須以 repo 目錄結構執行（見上方「Python 3.11」）。

## 下一步
1. 等 Python 3.11 全套完成並填入結果。
2. 交 M5 R1 獨立審查。
3. 使用者執行 DEPLOY-EXEC 預檢 r3，並決定 §9 的各項。
4. 依預檢結果撰寫具體指令並送審，通過後才可能切換。
