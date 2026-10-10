# DEPLOY-EXEC-2026-001 — 後端診斷預檢 r3（待獨立審查，**尚未核准執行**）

對應 `DOCX-PATH-GUARD-2026-001-deploy-handoff.md` v3 §3 與 §4 門檻 G。
審查紀錄見 `DEPLOY-EXEC-2026-001-backend-precheck-review.md`：
- r1：REVISE（R1–R4）。
- r2：R1–R3 已接受，R4 仍 REVISE（見「r2 獨立審查補註」）。

**r3 只補 R4**，R1–R3 的設計與已接受的 15 案自測不重做。原件逐字保留：r1 為 `…-backend-precheck-r1-REVISED.sh`／`.md`，r2 為 `…-r2-REVISED.sh`／`.md`。

| 項目 | 值 |
|---|---|
| 腳本 | `docs/workflow/DEPLOY-EXEC-2026-001-backend-precheck.sh` |
| SHA-256 | `7f51580e787206a551cfde53d485800e12ad5e418608301c55a25a3a1b179218` |
| NAS 副本 | `~/qualitas-backend-precheck-r3.sh`（600），雜湊相同 |
| 舊副本 | r1 已改名為 `~/qualitas-backend-precheck.sh.r1-REVISED-do-not-run`；r2 已改名為 `~/qualitas-backend-precheck-r2.sh.REVISED-do-not-run`（皆 600）。兩者都從未執行，NAS 上沒有任何報告檔 |

## 性質：診斷預檢，不是零狀態變更
- 會建立並自動刪除一個臨時容器 `qualitas-precheck-<UTC>`，參數為 `--rm --network none --read-only`，只用來讀原映像內的 helper。
- r3 新增：以同一映像 `docker create`（不啟動、`--network none`）一個參照容器 `qualitas-precheck-ref-<UTC>`。讀取設定後立即 `docker rm`；刪除失敗時該階段回 95，判 FAIL。
- 會在 `$HOME` 寫一份報告，權限 600。
- 不重啟、不建置、不打標籤，不改正式容器、檔案或設定。

## 使用者啟動指令（審查核准後才執行）
這行指令會先比對完整 SHA-256，相符才執行；不符則不執行，退出碼 90。腳本的退出碼會原樣帶回。

```bash
ssh -t ykdaniel@192.168.15.100 'f="$HOME/qualitas-backend-precheck-r3.sh"; printf "%s  %s\n" "7f51580e787206a551cfde53d485800e12ad5e418608301c55a25a3a1b179218" "$f" | sha256sum -c --strict --quiet - || { echo "HASH MISMATCH - not run"; exit 90; }; bash "$f"'
```

跑完只需回覆「跑完了」與最後一行的 `PRECHECK_EXIT=`。報告由 Claude 用 SSH 讀取，使用者不需貼 inspect 或 compose 設定。

## r3：R4 補正（對應 r2 審查補註三項）
1. **先比原值，遮蔽只用於輸出。**
   - image reference、container_name、restart、user、working_dir、exposed ports、networks 一律以原值比較。
   - 遮蔽函式只負責輸出。若值無法以安全格式顯示，直接 FAIL「unsupported value format」，即使原值相同也一樣。
2. **必要欄位缺漏或型別不符一律 FAIL。** 比對前先驗證結構：
   - container 必要欄位：`Config.Env`／`Cmd`／`Entrypoint`／`User`／`WorkingDir`／`Image`／`Labels`、`HostConfig` 與 `RestartPolicy.Name`／`MaximumRetryCount`、`PortBindings`、`NetworkMode`、State、Mounts、Networks。
   - image 必要欄位：`Id`、`Config.Env`、`Config.Cmd`。
   - 參照容器必要欄位：`Config`、`HostConfig`。
   - compose service 各鍵的型別。
   - 只有新版引擎會以 omitempty 省略的欄位才視為合法空值（image 的 `Entrypoint`／`User`／`WorkingDir`／`ExposedPorts`／`Labels`、container 的 `ExposedPorts`）；這些欄位若存在，型別仍須正確。
   - 比較時 `null`／`[]`／`{}`／`""`／`false` 視為同一個「未設定」，但 `0` 仍是有效值，例如 `MemorySwappiness=0` 不等於預設。
3. **完整 restart policy 與重建後會遺失的非預設設定。**
   - restart 比較（名稱，重試上限），支援 `no`／`always`／`unless-stopped`／`on-failure[:N]`，其他寫法判 FAIL。
   - 執行中容器的 HostConfig 與參照容器（即本機 daemon 預設值）**逐鍵比較全部鍵**，不再用有限清單。涵蓋記憶體／CPU、security options、ulimits、logging、tmpfs、未知的新鍵等。只排除 compose 管理且已在上方逐項比對的 `Binds`／`Mounts`／`PortBindings`／`RestartPolicy`／`NetworkMode`。缺鍵或有差異即 FAIL，只輸出鍵名（logging 設定可能含 token，不輸出值）。
   - Config 執行設定也與參照比較：Domainname、Tty、OpenStdin、StdinOnce、StopSignal、StopTimeout、Healthcheck、OnBuild、Shell、ArgsEscaped、NetworkDisabled、MacAddress、Volumes。
   - 標籤：除 `com.docker.compose.*` 與映像本身的標籤外，有額外標籤或映像標籤被改值，判 FAIL。
   - 網路：compose 中有 per-network 選項（aliases、靜態 IP）、執行中 endpoint 有 IPAMConfig 或 links、NetworkMode 不在 compose 網路中，都判 FAIL。
   - 不新增任何「為了通過」的支援；未知差異一律停止交審。

**無法自動確認、明確不在檢查範圍內的項目**（需要時人工判斷）：
- `Hostname` 與 `Attach*`：每次建立都會變，或只是附加終端的設定，不影響服務。
- 匿名 volume 的資料內容。
- daemon 本身的設定（`daemon.json`）在預檢之後才變更的情況。
- network endpoint 的 aliases（compose 會自動產生）。
- compose 與 docker CLI 建立容器時，若預設表示法不同而產生差異：會 FAIL，需人工確認。本機只驗證了 CLI 建立的容器。

## R1–R4 處理（r2 內容，R1–R3 已接受）

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

## r3 自測證據（`DEPLOY-EXEC-2026-001-evidence/backend-precheck-r3-selftest/`，針對最終雜湊 `7f51580e…9218`）
- **分析程式合成探測**（`probe_r4.py`）：直接取出腳本內原樣的分析程式，不接觸 Docker 或 NAS，共 37 案，**mismatches=0**，秘密命中 0（`probe-local-py314.txt`）。
  - 審查者重現的 5 案（缺 HostConfig、兩邊都缺 Env、遮蔽後相同的 working_dir 不同值、未宣告的 Memory、restart 重試次數不符），現在全部 rc=1，FAIL 原因正確。
  - 其他 FAIL 案例：
    - 遮蔽後相同的 working_dir／network／image／container_name；
    - container 或 image 單邊缺 Env；缺 MaximumRetryCount、User、PortBindings；
    - HostConfig 少了參照容器有的鍵；RestartCount 型別錯誤；
    - 參照階段失敗、參照容器缺 HostConfig；
    - `on-failure:5` 對上 3；不支援的 restart 寫法；
    - 未宣告的 CPU、ulimits、security-opt、logging（含 token，值不輸出）、`MemorySwappiness=0`、tmpfs、未知新鍵、StopSignal、Tty、額外標籤；
    - 靜態 IP endpoint；compose per-network 選項；NetworkMode 不在 compose 網路中；compose 欄位型別錯誤。
  - 合法情況仍 PASS（rc=0）：基準、`on-failure:5` 相符、image 依 omitempty 省略 WorkingDir。
  - NAS 的 Python 3.8.15 跑同一套 37 案：mismatches=0。使用本批專用目錄，TMPDIR 指向該目錄，跑完已刪除（`nas-checks.txt`）。
- **真實 Docker 子集**（本機 Colima，`docker-results.txt`）：
  - A 基準 rc=0：參照容器流程可用，CLI 建立的容器不會被誤判。
  - `--memory 512m` → rc=1（Memory、MemorySwap）。
  - `--restart on-failure:5` 對上 compose 的 `on-failure` → rc=1；對上 compose 的 `on-failure:5` → rc=0。
  - `--ulimit`、`--security-opt`、`--log-opt` → 各自 rc=1，只列鍵名。
  - 每案結束後，`qualitas-precheck*` 容器殘留 0 個；秘密命中 0。
- R1–R3 與 r2 的 15 案已接受，未重跑。

## r2 自測證據（`DEPLOY-EXEC-2026-001-evidence/backend-precheck-r2-selftest/`）
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
- 正式容器由 compose v2.20 建立。若 compose 送出的預設值表示法與 `docker create` 不同，r3 會 FAIL 並停下交審（保守處理，不自動放行）。
- 「加入 override 後只有 `services.backend.image` 改變」要等 override 檔產生後才能驗證，屬於部署步驟（v3 §5–§6）。
- 本機模擬無法重現 Synology Docker 的所有預設值。若正式站因平台預設值而 FAIL，仍依規定停止，交審查判斷。
