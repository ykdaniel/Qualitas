# DEPLOY-EXEC-2026-001 — handoff（前端已上線；後端未部署）

**一句話**：前端依已核准方案於 2026-10-07T16:05:07Z 上線（候選包 `aa547fbd…a246`），NAS 全量與對外抽樣核對相符，舊資產全保留，回退包已在 NAS 驗證就緒；登入後冒煙未完成；後端仍因 sudo 預檢 blocked。

## 審查請看
- `STATUS.md`（上線時間、固定路徑、逐段核對、回退位置與方式、限制）。
- 證據：`DEPLOY-EXEC-2026-001-evidence/`（`deploy-phase1/2-*.log`、`post-deploy-http-check.txt`、`post-deploy-login-page.jpg`、`nas-workdir-listing.txt`，以及預檢與 3.11 證據）。

## 證據界線
- NAS：候選 102 檔全量雜湊相符；原 104 檔未變。
- 對外：首頁、入口資產與 5 個 ITP／共用新資產抽樣相符；2 個舊資產仍可取得；API 401。
- 容器掛載：未直接核對。
- 登入後 UI：未驗。

## 仍待（任務 PARTIAL，不結案）
- 登入後唯讀冒煙：只看 ITP 的 Criteria 排列、中英擇一提示、Insert After 文字、Subject 寬度。不按 Apply／Save／Generate Checklist。
- 後端預檢：
  - r1（`a609b622…`）為 REVISE。
  - r2（`6d92caef…`）的 R1–R3 已接受，R4 仍 REVISE。
  - r3（`7f51580e…9218`）：**獨立審查 PASS**（腳本可執行；不代表門檻 G 已通過）。
  - 下一步：使用者執行 `DEPLOY-EXEC-2026-001-backend-precheck.md` 中有雜湊閘門的指令（需 sudo 密碼）；Claude 讀報告，FAIL 即停。
  - 證據限制：NAS Python 3.8 的探測只保存了摘要行，沒有完整輸出。
  - NAS 上的 r1、r2 副本都已改名為 do-not-run。
- 後端部署：預檢全 PASS 且獨立審查通過後，才依 v3 §5–§7 執行。
- 提交／推送：未做。不推送 122 個未全面審查的基準提交。
- 保留回退資料（NAS 與本機）與預覽環境。不重複部署前端。
