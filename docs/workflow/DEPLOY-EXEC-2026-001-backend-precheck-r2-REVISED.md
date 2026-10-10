# DEPLOY-EXEC-2026-001 — 後端診斷預檢 r2（待獨立審查，**尚未核准執行**）

對應 `DOCX-PATH-GUARD-2026-001-deploy-handoff.md` v3 §3 與 §4 門檻 G。
r1 審查結果為 REVISE（`DEPLOY-EXEC-2026-001-backend-precheck-review.md`），本版只處理 R1–R4。r1 原件逐字保留：`…-backend-precheck-r1-REVISED.sh`／`.md`。

| 項目 | 值 |
|---|---|
| 腳本 | `docs/workflow/DEPLOY-EXEC-2026-001-backend-precheck.sh` |
| SHA-256 | `6d92caeff95811cc86b16a68cd06fb897dc4c54bb40c27d69fa8b41eee562fe9` |
| NAS 副本 | `~/qualitas-backend-precheck-r2.sh`（600），雜湊相同 |
| r1 舊副本 | 已改名為 `~/qualitas-backend-precheck.sh.r1-REVISED-do-not-run`（600）；從未執行，NAS 上沒有任何報告檔 |

## 性質：診斷預檢，不是零狀態變更
- 會建立並自動刪除一個臨時容器 `qualitas-precheck-<UTC>`，參數為 `--rm --network none --read-only`，只用來讀原映像內的 helper。
- 會在 `$HOME` 寫一份報告，權限 600。
- 不重啟、不建置、不打標籤，不改正式容器、檔案或設定。

## 使用者啟動指令（審查核准後才執行）
這行指令會先比對完整 SHA-256，相符才執行；不符則不執行，退出碼 90。腳本的退出碼會原樣帶回。

```bash
ssh -t ykdaniel@192.168.15.100 'f="$HOME/qualitas-backend-precheck-r2.sh"; printf "%s  %s\n" "6d92caeff95811cc86b16a68cd06fb897dc4c54bb40c27d69fa8b41eee562fe9" "$f" | sha256sum -c --strict --quiet - || { echo "HASH MISMATCH - not run"; exit 90; }; bash "$f"'
```

跑完只需回覆「跑完了」與最後一行的 `PRECHECK_EXIT=`。報告由 Claude 用 SSH 讀取，使用者不需貼 inspect 或 compose 設定。

## R1–R4 處理

**R1 退出碼與雜湊閘門**
- 腳本開頭設 `set -o pipefail`。
- 分析程式依結果退出：0＝全部 PASS，1＝有 FAIL，3＝內部錯誤（細節不輸出）。
- 主流程以 `PIPESTATUS` 一次取得分析程式與 `tee` 的退出碼；報告寫入失敗而其他都通過時回 20；sudo 驗證失敗回 10。最後明確 `exit $RC`，結尾的 echo 不會覆蓋退出碼。
- 每個收集階段都附上自己的退出碼。rc≠0、沒有退出碼標記、JSON 解析失敗，都判 FAIL。
- 啟動指令用 `sha256sum -c --strict` 比對完整雜湊，相符才執行（見上）。

**R2 明確允許清單輸出**
- 各收集階段的 stderr 一律丟棄，只記階段名與退出碼。
- helper 的輸出必須符合格式（64 位十六進位雜湊、權限字串、Python 版本），否則只顯示 `<unparsable>`。
- Cmd 與 Entrypoint 只在記憶體比較，輸出相同／不同與參數個數。
- build 只輸出：鍵名；context（限本機絕對路徑，否則 `<redacted>` 並 FAIL）；dockerfile（限簡單路徑）；args 鍵名。
- 路徑與映像名稱若不符合安全格式，一律顯示 `<redacted>`。
- 環境變數只輸出鍵名；有差異時只列出鍵名。

**R3 完整 docker diff 分類**
- 完整解析 docker diff，不截斷，也不靠副檔名判斷。只有以下窄範圍項目可豁免：
  - `__pycache__` 目錄與其中的 `.pyc`；
  - `/tmp`；
  - 掛載點本身或其上層目錄；
  - 已有子項目列出的上層目錄（C）。
- 其餘差異（含 `/app` 外、無副檔名、無法解析的行）一律歸為 UNEXPLAINED，判 FAIL。
- SQLite 的 `-wal`／`-shm`／`-journal` 若留在容器層（重建時會遺失），另列一項，判 FAIL。
- 掛載只允許 4 個資料路徑：`/app/qualitas.db`、`uploads`、`backups`、`logs`。
- 若有掛載蓋住 `/`、`/app` 或 helper 的上層路徑，判 FAIL，即使檔案內容和映像相同也一樣（自測 E 案例）。

**R4 有效設定比對**
- 以「映像預設值＋compose 覆寫」算出預期值，再與執行中容器比對，逐項判定：
  - 映像參考名稱，以及該名稱目前是否仍指向執行中的映像；
  - container_name、restart、entrypoint、command；
  - user、working_dir、port bindings、exposed ports；
  - networks、bind 掛載；
  - **全部環境變數的有效值**（含映像繼承的鍵；只比對不輸出，列出差異鍵與 `inherited_changed`）。
- compose 環境變數宣告了卻沒有值，判 FAIL。
- 執行中容器有、但 compose 未宣告的主機設定（privileged、caps、devices、tmpfs、hosts、dns 等），判 FAIL。
- 以下情況一律 FAIL，不會默認通過：
  - 服務用到不支援的鍵（只支援 build、command、container_name、entrypoint、environment、networks、restart、volumes、image、ports、expose、user、working_dir）；
  - 非 bind 的 volume；
  - 非 list 形式的 command／entrypoint；
  - 必要資料缺漏。

## 自測證據（`DEPLOY-EXEC-2026-001-evidence/backend-precheck-r2-selftest/`）
全部針對最終雜湊 `6d92caef…62fe9` 執行。

本機 Colima 模擬容器，每個案例都保存實際退出碼。每份輸出與報告檔都檢查了 9 個測試秘密標記，命中次數皆為 0；`results.txt` 有完整清單。

| 案例 | 預期 | 實際 |
|---|---|---|
| A 正常（Cmd／Entrypoint／env／映像 env／build args 都含測試秘密） | 0 | 0 |
| L 報告不可寫（tee 失敗） | 20 | 20 |
| B Docker 無法連線 | 1 | 1 |
| C 容器內 helper 被熱修 | 1 | 1 |
| D 超過 80 行的 diff：無副檔名檔排在第 81 行之後，另有 `/app` 外 site-packages 修改 | 1 | 1（93 筆 UNEXPLAINED 全部列出） |
| E 與原檔內容相同的檔案掛到 `/app/core` | 1 | 1（code mount） |
| F1 exec／run／compose 失敗，且 stderr 與 stdout 都含秘密 | 1 | 1 |
| F2 build context 為含帳密的 URL＋dockerfile_inline | 1 | 1 |
| G entrypoint／user／workdir／port 與預期不一致 | 1 | 1（5 項） |
| H 映像繼承的環境變數在執行時被改值 | 1 | 1（`inherited_changed=['IMGKEY']`） |
| I1 compose 沒有 service；I2 容器沒有 compose 標籤 | 1 | 1 |
| J 容器層有 SQLite `-wal` | 1 | 1 |
| K 分析程式內部錯誤 | 3 | 3（細節已隱藏） |
| M 不支援的 compose 鍵（healthcheck） | 1 | 1 |

NAS 上的核對（`nas-checks.txt`、`nas-py38-analyzer-runtime.txt`）：
- bash 4.4 `bash -n` 通過；Python 3.8 以 stdin 做 `ast.parse` 通過，不寫任何檔案。
- 啟動閘門用專屬目錄中的假腳本測試，完成後已刪除：雜湊相符時執行並帶回 rc=7；不符時不執行，rc=90。
- 用 A 案例的輸入資料，在 NAS 的 Python 3.8 實際執行分析程式：rc=0，輸出與本機 Python 3.14 完全相同。設定 `PYTHONDONTWRITEBYTECODE=1`，專屬目錄已刪除。
- 本批沒有使用或清理共用的 `/tmp`。

## 限制
- 尚未在 NAS 以 sudo 對正式容器實跑。
- 「加入 override 後只有 `services.backend.image` 改變」要等 override 檔產生後才能驗證，屬於部署步驟（v3 §5–§6）。
- 本機模擬無法重現 Synology Docker 的所有預設值。若正式站因平台預設值而 FAIL，仍依規定停止，交審查判斷。
