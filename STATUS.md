# STATUS.md — Claude 執行結果

TASK_ID: DEPLOY-EXEC-2026-001
ROUND: 結案（2026-10-10）。前一版（PARTIAL）逐字封存為 `docs/workflow/DEPLOY-EXEC-2026-001-PARTIAL-{TASK,STATUS,REVIEW,handoff}-archive.md`。

## RESULT
- [x] DONE（前端 2026-10-07 上線；後端 DOCX 路徑防護 2026-10-09 上線）
- [ ] PARTIAL
- [ ] BLOCKED

## 結案摘要
- **前端**：見下方「前端部署紀錄」（2026-10-07T16:05:07Z）。之後正式站前端已由材料（MATERIAL-SUBMITTAL M5，2026-10-09）與 audit 系列多次更新；本任務的 ITP 7 檔仍包含在內（雜湊未變）。
- **後端（DOCX-PATH-GUARD）**：2026-10-09 12:14:09Z 上線，紀錄見 `docs/workflow/DEPLOY-EXEC-2026-001-docx-deploy-record.md`。
  - 原定的後端預檢 r3（以 056c245c 為基準的雜湊閘門）在材料上線後已不適用，**未執行**；改以「正式站原始碼＝材料上線候選樹 341 檔」的唯讀核對取代，並做 Python 3.11 測試（DOCX＋KM 35 passed；NCR／NOI／ITR＋DOCX 424 passed）、資料庫一致性備份與回退映像 `qualitas-backend:pre-docx-20261009T115405Z`。
  - 依 DECISIONS「每批 PASS 後完成準備即提交、推送及部署」執行（DOCX-PATH-GUARD-2026-001 獨立審查 PASS）；部署執行本身未另經獨立審查。
- **程式碼**：ITP 7 檔 `2e98d0dd`、ITP 測試與決策 `cc8b83fb`、DOCX `52986ac2`，皆已合併進 main（PR #2、#3）。
- **未完成**：登入後唯讀冒煙（ITP 的 Criteria 排列、中英擇一提示、Insert After 文字、Subject 寬度；既有紀錄的 DOCX 匯出）由使用者執行，結案不代表已驗。
- **以下為封存前的原文**（「後端 blocked」「剩餘待辦」等段落已由本摘要取代）。

## 前端部署紀錄
- **上線時間**：`index.html` 原子替換於 **2026-10-07T16:05:07Z**（台北 2026-10-08 00:05:07）。
- **候選包**：`qualitas-frontend-candidate-056c245c-plus7.tgz`，SHA-256 `aa547fbde18914f67ada77cb53d7f01d61c878b39854749ae74ad35657c8a246`（基準 `056c245ca3ff630f74bfc7af86233e7cbc7dc51b`＋7 個已審前端檔；本機 `~/Documents/Qualitas-deploy-artifacts/DEPLOY-SCOPE-INVENTORY-2026-001/candidate/`）。候選 `index.html` SHA-256 `63ae5c2e46b6153432daa0908c828100f70acf95eab9dd45b581213b49c99bf3`。
- **固定值**：`TS=20261007T160427Z`；`dist`＝`/volume1/docker/Qualitas/react-app/dist`；NAS 工作目錄＝`/var/services/homes/ykdaniel/deploy-DEPLOY-EXEC-2026-001-20261007T160427Z`（700）；暫存入口檔名 `.index.html.DEPLOY-EXEC-2026-001-20261007T160427Z`（已 mv，無殘留）。
- **第 1 段（不影響正式站）**：`dist` 漂移檢查與預檢清單相同（104 檔）；候選包與回退包上傳後 NAS 端 SHA-256 相符；NAS 上以 GNU tar 解壓，`staging` 102 檔、`rollback-staging` 104 檔（含 2 個 `._` 檔）逐檔 `sha256sum -c` 通過；回退用舊 `index.html` 可讀。
- **第 2 段（切換）**：`dist` inode 376368 不變；新資產 68 個以 `cp -p` 新增、33 個同名既有檔只核對（雜湊相同，未覆寫）；候選 101 個資產全部在 `dist` 且雜湊相符；原 104 檔全部未變；所有檔案 644；之後才以唯一暫存檔名 `cp`＋`chmod 644`＋`mv -f` 原子替換 `index.html`；替換後完整候選清單 102 檔在 `dist` 且雜湊相符。`dist` 現有 172 檔（舊資產全數保留，未清理）。
- 日誌：`DEPLOY-EXEC-2026-001-evidence/deploy-phase1-*.log`、`deploy-phase2-*.log`。

## 部署後核對（`post-deploy-http-check.txt`）
- **NAS 全量**：候選清單 102 檔全部存在且雜湊相符（`sha256sum -c`）。
- **對外抽樣**：`/`、`/index.html` 200，雜湊＝候選 `index.html`；首頁引用的 `index-D0YnVE8K.css`、`index-DUtTVD_j.js`，以及 `ITPDetail-BTigSi82.js`、`ITP-CPTcm3wb.js`、`ITP-BVefYkJ7.css`、`FormShell-B6QrKzCD.css`、`itpParser-AiLQE9pS.js` 皆 200 且雜湊＝候選清單；舊資產 `index-Ba-6qph1.js`、`ITPDetail-vB1xYO_H.js` 仍 200（保留）；`/api/user/profile` 未登入 401（`Could not validate credentials`）。
- **容器掛載**：未以 `docker inspect` 直接核對（需 sudo）；以 NAS 全量雜湊＋對外抽樣相符作為服務證據，不是完整服務拓撲證明。
- **唯讀冒煙**：內建瀏覽器開啟 `https://qualitas.rokusumi.net/itp` → 無登入 session，導向 `/login`；登入頁正常顯示（截圖 `post-deploy-login-page.jpg`），載入的入口資產為新版 `index-DUtTVD_j.js`／`index-D0YnVE8K.css` 與 `Login` 分塊，資源載入無失敗；console 錯誤只有未登入預期的 401。
- **登入後冒煙：未完成**（無正式站 session；Claude 不輸入正式站密碼）。ITP 編輯畫面（Criteria 左右排列、中英擇一必填提示、Insert After、Subject 整列）尚未在正式站目視確認。**不宣稱全部驗收通過。**

## 回退位置與方式（未使用）
- NAS：`/var/services/homes/ykdaniel/deploy-DEPLOY-EXEC-2026-001-20261007T160427Z/rollback-staging/`（已解壓並驗證 104 檔）與 `rollback.tgz`（`ba12d3f17fb1a52616a0e9ccc792069b8b67d65d04a6b04c0e48f173ae06b404`）。本機：`~/Documents/Qualitas-deploy-artifacts/DEPLOY-EXEC-2026-001/rollback/nas-dist-backup-20261007T160049Z.tgz`。
- 方式：在 NAS 上 `cp -p rollback-staging/index.html dist/.index.html.ROLLBACK-<唯一TS>`、`chmod 644`、`mv -f` 回 `dist/index.html`；核對 `/` 回應雜湊回到 `3de542e7fc7992e297985ebaa5f48d2fc28b7ceade3b3a56a18d98c71198e607`。舊資產仍在，新載入的頁面會用回舊版；**不保證已開啟的新版分頁會即時回到舊版**。

## 後端
**未部署。** 門檻 G 與 v3 §3 預檢需 `sudo docker`，NAS 上 `sudo -n` 需要密碼，仍 blocked；需使用者在自己的終端機完成唯讀預檢。Python 3.11 測試已通過（32 passed）。未索取、保存密碼，未新增免密 sudo 或 docker 權限。

**後端診斷預檢 r3（2026-10-08）：獨立審查 PASS**（`DEPLOY-EXEC-2026-001-backend-precheck-review.md`「r3 獨立審查」；核准雜湊 `7f51580e…9218`）。這只表示腳本可以執行，不表示正式環境已通過門檻 G，也不表示後端已部署。下一步：使用者以帶雜湊閘門的指令執行；Claude 讀報告，任何 FAIL／ERROR／清理失敗即停止。
- r2 審查：R1–R3 已接受，R4 仍 REVISE。r3 只補 R4，說明見 `DEPLOY-EXEC-2026-001-backend-precheck.md`。
- 腳本 SHA-256 `7f51580e787206a551cfde53d485800e12ad5e418608301c55a25a3a1b179218`；NAS 副本 `~/qualitas-backend-precheck-r3.sh`（600）雜湊相同。r2 副本已改名為 `.REVISED-do-not-run`，從未執行。
- R4 的修正：
  - 以原值比較，遮蔽只用於輸出；值無法顯示即 FAIL。
  - 先驗證必要欄位與型別，缺鍵就 FAIL；只有 omitempty 省略的欄位視為合法空值。
  - restart 比較完整的（名稱，重試上限）。
  - 以不啟動的參照容器（`docker create`，用後即刪）代表 daemon 預設值，與 HostConfig 逐鍵比較，並比較 Config 執行設定、標籤與網路 endpoint；未知差異一律 FAIL。
- 自測（`DEPLOY-EXEC-2026-001-evidence/backend-precheck-r3-selftest/`，模擬實測，非正式站）：
  - 分析程式合成探測 37 案 mismatches=0，涵蓋審查者重現的 5 案；本機 Python 3.14 與 NAS Python 3.8 結果相同。
  - 真實 Docker 子集 7 案全部符合預期，參照容器殘留 0；秘密命中 0。
- R1–R3 與 r2 的 15 案未重跑。
- 附註：NAS 上的 probe 只截取了摘要行，完整輸出在刪除專用目錄前未複製出來；本機完整輸出已保存。

**（以下為 r2 紀錄，R4 已由 r3 取代）後端診斷預檢 r2（2026-10-08）**
- r1 審查結果為 REVISE（`DEPLOY-EXEC-2026-001-backend-precheck-review.md`）。r2 只處理 R1–R4，說明見 `DEPLOY-EXEC-2026-001-backend-precheck.md`。
- 腳本 SHA-256 為 `6d92caeff95811cc86b16a68cd06fb897dc4c54bb40c27d69fa8b41eee562fe9`；NAS 副本為 `~/qualitas-backend-precheck-r2.sh`（600），雜湊相同。
- 啟動指令先比對完整雜湊，不符不執行（rc 90）。
- 處理內容：
  - 退出碼：FAIL 回 1、內部錯誤回 3、報告寫入失敗回 20；每個收集階段都檢查退出碼。
  - 輸出：採允許清單，不輸出 stderr、Cmd、Entrypoint、build 內容或環境變數值。
  - docker diff：完整分類、不截斷；未知差異、程式掛載與 SQLite 附屬檔都判 FAIL。
  - G4：逐項比對映像預設值＋compose 與執行中容器，包含全部環境變數的有效值。
- 自測（模擬實測，非正式站）：15 個案例的退出碼全部符合預期，秘密值命中 0 次；證據在 `DEPLOY-EXEC-2026-001-evidence/backend-precheck-r2-selftest/`。
- NAS 上：bash 4.4 與 Python 3.8 語法通過；分析程式在 Python 3.8 實際執行，輸出與本機相同；雜湊閘門實測有效。
- r1 舊副本已改名為 `…r1-REVISED-do-not-run`（600），從未執行。
- 更正：
  - 此腳本是「診斷預檢」，不是完全唯讀：會建立並刪除臨時容器，也會寫報告。
  - r1 自測時刪除共用 `/tmp/__pycache__` 不妥；本批只使用、只清理本批專用目錄。

**（以下為 r1 紀錄，已由 r2 取代）sudo 唯讀預檢已備妥（2026-10-08，尚未由使用者執行）**
- 說明：`docs/workflow/DEPLOY-EXEC-2026-001-backend-precheck.md`。
- 腳本：`DEPLOY-EXEC-2026-001-backend-precheck.sh`，SHA-256 `a609b622…e9c6`，已放在 NAS `~/qualitas-backend-precheck.sh`，雜湊相同。
- 報告只含容器識別、掛載、雜湊、鍵名與 PASS／FAIL，不含環境變數值，也不要求貼完整 inspect 或 compose 設定。
- 自測（讀碼＋模擬實測，不是正式站實跑）：
  - 本機模擬容器：正常 PASS；Docker 無法連線時判 FAIL；熱修與秘密值不一致都能抓到；輸出中秘密值出現 0 次。
  - NAS：bash 4.4 語法通過；Python 3.8 編譯通過；不用 sudo 的 compose config 解析可行。
- 附註：NAS 上 py_compile 自測時，刪除了 `/tmp/__pycache__`。執行前未檢查該目錄是否原本就存在；內容只會是 Python 位元組碼快取。

## 剩餘待辦（任務維持 PARTIAL，不結案）
1. **登入後唯讀冒煙**：使用者登入正式站後，只看 ITP 的四項：
   - Criteria 排列；
   - 中英擇一提示；
   - Insert After 文字；
   - Subject 寬度。

   不按 Apply／Save／Generate Checklist。
2. **後端預檢**：r3 已 PASS。等使用者執行有雜湊閘門的啟動指令（不得執行 r1／r2 舊副本）。Claude 讀取 NAS 報告，核對退出碼、每項判定、臨時與參照容器的清理；任何 FAIL／ERROR／未知差異都停止，不放寬規則。
3a. **全部 PASS 之後**：依現場結果寫具體的後端切換與回退方案，並驗證 override 只改 image，再交獨立審查；之後依既有授權執行。
3. **後端部署**：預檢全 PASS 且審查通過後，才依 v3 §5–§7 以實際值產生建置、切換、回退指令並執行。任一 FAIL 就停止回報。
4. **提交／推送**：只提交已審範圍。不推送 122 個未全面審查的基準提交，不強制推送。
5. **保留**：
   - NAS 回退目錄與 `rollback.tgz`、本機回退包；
   - 預覽環境 8240／3240、8198／3198。

   不重複部署前端。

## 其他
- 未提交、未推送（推送分支會帶上 122 個未全面審查的基準提交，不在核定範圍）。
- NAS `dist` 內既有的 2 個 `._` 檔未處理（不屬核定範圍）。
- 8240／3240、8198／3198 未觸碰。Colima 仍在執行。
