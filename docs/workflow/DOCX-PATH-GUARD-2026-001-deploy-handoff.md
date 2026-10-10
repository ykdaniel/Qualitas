# DOCX-PATH-GUARD-2026-001 — 部署交接 v3（**只準備，未執行**）

> **本機修復通過（產品 PASS 不變），本批未部署；線上實際版本未核對。**
> 先前版本逐字保留：v1 → `DOCX-PATH-GUARD-2026-001-deploy-handoff-v1-REVISED.md`，v2 → `...-v2-REVISED.md`。審閱見 `DOCX-PATH-GUARD-2026-001-deploy-review.md`。
> 本文件不是部署授權。部署範圍只限已審的單一檔案。不索取、不記錄任何 sudo 或正式站密碼，特權指令由使用者在自己的終端機輸入。
> **本文件刻意不提供可直接執行的切換與回退指令**：須先通過 §4 的門檻 G，依現場實際值產生後再執行（見 §5、§7）。

## v2 → v3 修正（依「v2 審閱補註」）
1. build context 獨立為 `$W/context`，只放 Dockerfile 與已審 helper；預檢、備份、設定紀錄都留在 context 外，建置前核對檔案清單。映像 `Config.Env` 不輸出原文，只比對「相同／不同」與鍵名。
2. Python 3.11 補測指令保留真正退出碼（`set -eu`、以 pytest 退出碼結束、外層先存 `$?`）。
3. compose 執行器、專案名、設定檔、env-file、既有 override 與有效設定核對，列為切換前必過門檻 G；未通過不得切換，也不產生執行指令。
4. 401 只代表驗證路徑可達；與部署前基準比對，404／5xx／逾時等非預期回應一律列異常；保留容器內就緒、雜湊與合法匯出檢查；補上 nginx 上游可能需重新解析的注意事項。
5. `STATUS.md` 尾端已附日期更正（封存檔不動）。

## 1. 部署內容

| 項目 | 值 |
|---|---|
| 唯一部署檔案 | `backend/core/docx_builder.py`（本機工作樹，未提交） |
| 要上線版本 SHA-256 | `0e43664f4e600804688cd37263bcd1b84e0c48da64f4767cc147cf2cf07b4cdd` |
| 比較基準（本機 HEAD `056c245c` 的修復前版本） | `95208d8af5c231f4f3de22b4fc74f7e0e5d604d79bac191ceceb80f768e78e6d`（僅供比對，不代表線上版本） |
| 不部署 | 測試檔、文件、其他任何檔案；不使用 NAS 主機 `backend/` 目錄或本機工作樹作為 build context |

## 2. 已知與待確認

| 項目 | 已知（來源） | 待確認（由門檻 G 或預檢取得） |
|---|---|---|
| 主機／目錄 | NAS `192.168.15.100`、`/volume1/docker/Qualitas/`（記憶檔） | — |
| 容器名 | `qualitas-backend`（repo `docker-compose.yml`） | NAS 實際 compose 檔內容 |
| 程式位置 | 建置時打包進映像（repo `Dockerfile` `COPY . .`），容器內 `/app/core/docx_builder.py` | 實際部署映像的 ID 與設定 |
| docker／compose | 記憶檔有 `/usr/local/bin/docker`、`/usr/local/bin/docker-compose`；另有紀錄使用 `--env-file .env.tunnel` | 實際執行器（v1／v2）、專案名、設定檔、env-file、override |
| 上游代理 | repo `nginx.conf`：`proxy_pass http://backend:8000/api/;` | NAS 上的 nginx 設定是否相同 |
| 特權 | `docker` 需 `sudo`（記憶檔） | 由使用者自行輸入 |
| 冒煙紀錄 | — | 由使用者指定測試用 ITR／NCR／NOI 各一筆 |

## 3. 預檢（唯讀；在 NAS SSH 終端機由使用者執行）

```bash
TS=$(date +%Y%m%d-%H%M%S)
W=~/docx-guard-$TS                    # 紀錄目錄（不作為 build context）
mkdir -p "$W/records" "$W/private" "$W/context"
chmod 700 "$W/private"                # 僅限本機保存的敏感原始設定
cd /volume1/docker/Qualitas

# 3.1 容器與映像身分（ID，不只名稱）
sudo /usr/local/bin/docker inspect qualitas-backend \
  --format 'container={{.Id}} image={{.Image}} configImage={{.Config.Image}} status={{.State.Status}} restarting={{.State.Restarting}} restarts={{.RestartCount}} started={{.State.StartedAt}}' \
  | tee "$W/records/precheck-container.txt"
IMG=$(sudo /usr/local/bin/docker inspect qualitas-backend --format '{{.Image}}'); echo "$IMG" > "$W/records/base-image-id.txt"
sudo /usr/local/bin/docker image inspect "$IMG" \
  --format 'id={{.Id}} digests={{.RepoDigests}} tags={{.RepoTags}} created={{.Created}} user={{.Config.User}} workdir={{.Config.WorkingDir}} cmd={{json .Config.Cmd}} entrypoint={{json .Config.Entrypoint}} ports={{json .Config.ExposedPorts}}' \
  | tee "$W/records/precheck-image.txt"
# Env：原文只進 private；紀錄與畫面只出現鍵名
sudo /usr/local/bin/docker image inspect "$IMG" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$W/private/base-image-env.txt"
cut -d= -f1 "$W/private/base-image-env.txt" | sort | tee "$W/records/base-image-env-keys.txt"

# 3.2 容器可寫層差異：是否已有其他熱修
sudo /usr/local/bin/docker diff qualitas-backend | tee "$W/records/precheck-docker-diff.txt"

# 3.3 helper 三處版本與權限
sudo /usr/local/bin/docker exec qualitas-backend sh -c 'sha256sum /app/core/docx_builder.py; stat -c "%a %u:%g %s" /app/core/docx_builder.py' | tee "$W/records/precheck-helper-container.txt"
sudo /usr/local/bin/docker run --rm --entrypoint sh "$IMG" -c 'sha256sum /app/core/docx_builder.py; stat -c "%a %u:%g %s" /app/core/docx_builder.py; python --version' | tee "$W/records/precheck-helper-image.txt"
sha256sum backend/core/docx_builder.py | tee "$W/records/precheck-helper-host.txt"

# 3.4 API 探針基準（部署前先記錄，部署後比對）
curl -sS -m 15 -D "$W/records/probe-before.headers" -o "$W/records/probe-before.body" -w '%{http_code}\n' https://qualitas.rokusumi.net/api/user/profile | tee "$W/records/probe-before.code"
```

**停止條件（任一成立就停止回報）**
- `precheck-docker-diff.txt` 在 `/app` 下有 `.py` 或其他程式檔的 `A`／`C`／`D`（只有 `__pycache__`、`/tmp` 等執行期產物可忽略，並逐條記錄判斷）。
- 容器內與映像內 helper 雜湊不同；或映像內雜湊不是比較基準 `95208d8a…`（線上版本與本機修復前不同，需重新審查 diff）。
- 容器非 `running` 或正在重啟；探針基準本身就是 5xx／逾時。

## 4. 門檻 G：compose 核對（**切換前必過**；全部唯讀）

```bash
# G1 原容器由誰、以哪些檔案啟動（compose 寫在容器標籤上）
sudo /usr/local/bin/docker inspect qualitas-backend --format '{{range $k,$v := .Config.Labels}}{{if or (eq $k "com.docker.compose.project") (eq $k "com.docker.compose.project.config_files") (eq $k "com.docker.compose.project.working_dir") (eq $k "com.docker.compose.project.environment_file") (eq $k "com.docker.compose.service") (eq $k "com.docker.compose.version")}}{{$k}}={{$v}}{{println}}{{end}}{{end}}' \
  | tee "$W/records/gate-compose-labels.txt"

# G2 可用的執行器
ls -l /usr/local/bin/docker-compose 2>&1 | tee "$W/records/gate-executors.txt"
sudo /usr/local/bin/docker-compose version 2>&1 | tee -a "$W/records/gate-executors.txt"
sudo /usr/local/bin/docker compose version 2>&1 | tee -a "$W/records/gate-executors.txt"
```

**G3 決定實際值並寫入 `$W/records/gate-decision.txt`**（使用者與審查方確認）：
- `EXECUTOR`：與 G1 `com.docker.compose.version` 相符的執行器（v1 `docker-compose` 或 v2 `docker compose`）。
- `PROJECT`：G1 的 `com.docker.compose.project`。
- `CONFIG_FILES`：G1 `config_files` 的**全部**檔案，順序不變（含任何既有 override）。
- `ENV_FILE`：G1 `environment_file`（v2 才有此標籤）；若標籤缺失，依原啟動紀錄判斷是否使用 `.env.tunnel`，**無法確定就不通過**。
- `WORKDIR`：G1 `working_dir`。

**G4 有效設定核對**（不輸出秘密）：用 G3 確定的執行器、專案名（`-p`）、全部設定檔（每個一個 `-f`，順序不變）與 env-file 執行 `config` 子指令，把輸出**只**存到 `"$W/private/effective-config.yml"`（含環境變數原值，不外傳）。該指令依 G3 實際值寫出，本文件不提供預填版本。之後只把結構欄位輸出到紀錄：
```bash
python3 - "$W/private/effective-config.yml" <<'PY' | tee "$W/records/gate-effective-backend.txt"
import sys, yaml
c = yaml.safe_load(open(sys.argv[1]))["services"]["backend"]
for k in ("container_name", "image", "build", "volumes", "networks", "env_file", "restart", "ports"):
    print(k, "=", c.get(k))
print("environment keys =", sorted((c.get("environment") or {}).keys()) if isinstance(c.get("environment"), dict) else c.get("environment") and sorted(e.split("=",1)[0] for e in c["environment"]))
PY
sudo /usr/local/bin/docker inspect qualitas-backend --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Mode}}){{println}}{{end}}networks={{range $n,$v := .NetworkSettings.Networks}}{{$n}} {{end}}' | tee "$W/records/gate-running-mounts-networks.txt"
```
（若 NAS 無 `python3`／`yaml`，改以人工檢視 `private` 內檔案，只把非秘密欄位抄入紀錄。）

**G 通過條件（全部成立）**：執行器、專案名、設定檔清單、env-file 都有確定值；有效設定的 `container_name`、`volumes`、`networks`、`env_file`、`restart` 與執行中容器一致；environment 鍵名與 §3.1 映像鍵名的差異已逐一解釋；預期加入 override 後**只有** `services.backend.image` 改變。任一不成立：不切換，回報。

## 5. 建置衍生映像（G 通過後；只準備，未執行）

```bash
ROLLBACK_TAG=qualitas-backend-rollback:$TS
sudo /usr/local/bin/docker tag "$IMG" "$ROLLBACK_TAG"           # 固定原映像，不刪除、不覆寫既有標籤

# 乾淨的 build context：只有 Dockerfile 與已審 helper
#（本機終端機先傳檔：scp -O backend/core/docx_builder.py ykdaniel@192.168.15.100:~/docx_builder.py.new）
cp ~/docx_builder.py.new "$W/context/docx_builder.py"
sha256sum "$W/context/docx_builder.py" | tee "$W/records/context-helper.sha256"    # 必須為 0e43664f…7b4cdd
printf 'FROM %s\nCOPY --chown=10001:10001 docx_builder.py /app/core/docx_builder.py\n' "$ROLLBACK_TAG" > "$W/context/Dockerfile"
ls -la "$W/context" | tee "$W/records/context-listing.txt"     # 必須只有 Dockerfile 與 docx_builder.py（加 . 與 ..）
# 若 §3.3 記錄的原檔權限不是 644，停止並另行審查權限還原方式。

FIX_TAG=qualitas-backend-docx-guard:$TS
sudo /usr/local/bin/docker build --pull=false -t "$FIX_TAG" "$W/context" 2>&1 | tee "$W/records/build.log"

# 驗證衍生映像（不啟動服務、不掛正式資料）
sudo /usr/local/bin/docker run --rm --entrypoint sh "$FIX_TAG" -c 'sha256sum /app/core/docx_builder.py; stat -c "%a %u:%g" /app/core/docx_builder.py' | tee "$W/records/fix-image-helper.txt"
for t in "$IMG" "$FIX_TAG"; do sudo /usr/local/bin/docker image inspect "$t" --format '{{.Config.User}}|{{.Config.WorkingDir}}|{{json .Config.Cmd}}|{{json .Config.Entrypoint}}|{{json .Config.ExposedPorts}}'; done | tee "$W/records/config-compare.txt"
#   兩行必須完全相同
sudo /usr/local/bin/docker image inspect "$FIX_TAG" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$W/private/fix-image-env.txt"
{ cmp -s "$W/private/base-image-env.txt" "$W/private/fix-image-env.txt" && echo "Env: SAME" || echo "Env: DIFFERENT"; } | tee "$W/records/env-compare.txt"
#   必須為 SAME；不輸出原文
sudo /usr/local/bin/docker run --rm --entrypoint python "$FIX_TAG" -c "import sys; sys.path.insert(0,'/app'); from core import docx_builder; print('import ok')"
```

## 6. 切換、就緒與冒煙

**切換指令在 G 通過後依 G3 實際值產生**，寫入 `$W/records/switch-command.txt` 後由審查方確認再執行。形式為：以 G3 的執行器、專案名、全部原設定檔（順序不變）與 env-file，再加上 `$W/override-$TS.yml`（內容只有 `services: backend: image: <FIX_TAG 實際值>`），執行 `up -d --no-build --no-deps backend`。切換後任何 backend 的 compose 操作都必須帶同一組檔案，否則可能遺失修復或順帶上線未審修改。

**就緒檢查（全部通過才算完成）**
```bash
sudo /usr/local/bin/docker inspect qualitas-backend --format 'container={{.Id}} image={{.Image}} status={{.State.Status}} restarting={{.State.Restarting}} restarts={{.RestartCount}} started={{.State.StartedAt}}' | tee "$W/records/post-container.txt"
#   image 必須等於 $FIX_TAG 的 ID
sudo /usr/local/bin/docker exec qualitas-backend sha256sum /app/core/docx_builder.py | tee "$W/records/post-helper.txt"   # 0e43664f…7b4cdd
sudo /usr/local/bin/docker ps -a | grep qualitas                                                                      # 三個容器皆 Up
sudo /usr/local/bin/docker logs --since "$(sed -n 's/.*started=\([^ ]*\).*/\1/p' "$W/records/post-container.txt")" qualitas-backend > "$W/records/post-logs.txt" 2>&1
grep -c "Application startup complete" "$W/records/post-logs.txt"; grep -c "Traceback" "$W/records/post-logs.txt"     # 前者 ≥1，後者 0
sudo /usr/local/bin/docker exec qualitas-backend python -c "import urllib.request;r=urllib.request.urlopen('http://127.0.0.1:8000/',timeout=10);print(r.status, r.read()[:80])"   # 200
curl -sS -m 15 -D "$W/records/probe-after.headers" -o "$W/records/probe-after.body" -w '%{http_code}\n' https://qualitas.rokusumi.net/api/user/profile | tee "$W/records/probe-after.code"
diff "$W/records/probe-before.code" "$W/records/probe-after.code" && diff "$W/records/probe-before.body" "$W/records/probe-after.body" && echo "probe: matches baseline"
```
- 探針解讀：**與部署前基準相同的 401** 只代表「請求經 nginx 到達後端且驗證路徑運作」，**不**證明應用完整就緒或修復已載入；後兩者由容器內 200、映像／helper 雜湊與合法匯出證明。探針出現 404、任何 5xx、逾時、或與基準不同的狀態／body，皆列異常。
- **nginx 上游**：`proxy_pass http://backend:8000` 在 nginx 啟動時解析；backend 容器重建後 IP 可能改變。若容器內 200 但探針 502，先診斷名稱解析與上游連線，不直接判定 helper 故障；重新載入或重啟 `qualitas-frontend` 不在本次核准範圍，需另行取得同意。

**合法匯出冒煙（由使用者登入；唯讀）**
- 使用者指定的測試用 ITR 與 NCR 各一筆（已有經正常上傳流程上傳的照片）：Export Word 成功、照片仍顯示。
- 一筆 NOI 匯出：附件檔名清單仍在。
- 不在正式站做負向測試；負向行為由本機 32 項測試覆蓋。
- 待確認：測試紀錄由誰指定；若無可用紀錄，是否允許在正式站建立（需另行同意）。

**異常判定 → §7 回退**：容器非 running 或重啟中；image ID 或 helper 雜湊不符；無啟動完成或有 Traceback；容器內非 200；探針與基準不同或為 404／5xx／逾時（nginx 上游問題先依上段診斷）；合法匯出失敗或照片消失。

## 7. 回退

**回退指令與切換指令同時在 G 通過後產生**，寫入 `$W/records/rollback-command.txt`：同一組執行器、專案名、原設定檔與 env-file，加上只把 `services.backend.image` 指向 `$ROLLBACK_TAG` 的 override，執行 `up -d --no-build --no-deps backend`。
- 回退後驗證：image ID 等於 `$W/records/base-image-id.txt`；helper 雜湊等於 §3.3 的映像內雜湊；重做 §6 就緒檢查。
- **回退會恢復已知的同前綴路徑缺口**，須通知審查方並記錄原因。
- `$ROLLBACK_TAG`、`$FIX_TAG`、`$W` 下全部紀錄保留不刪；`$W/private` 不外傳。

## 8. 備用：臨時熱修（僅限緊急，**不是**持久化部署）
僅在無法建置衍生映像、又必須立即止血時使用，且須在容器下一次重新建立**之前**完成 §5–§6：
```bash
sudo /usr/local/bin/docker cp qualitas-backend:/app/core/docx_builder.py "$W/records/container-docx_builder.py.bak"
sudo /usr/local/bin/docker cp "$W/context/docx_builder.py" qualitas-backend:/app/core/docx_builder.py
sudo /usr/local/bin/docker restart qualitas-backend
```
- 修改只存在這一個容器的可寫層；`restart` 保留，任何重新建立容器的操作都會讓它消失。
- 執行後立即做 §6 就緒檢查；回退為把 `.bak` 以 `docker cp` 放回並 `restart`。
- 只能記為「臨時熱修，待映像固化」，不能記為已部署。

## 9. Python 3.11 相容性：**未測**
- 本機無 Python 3.11；本機 Docker（colima）daemon 未運作。依指示不自行安裝或啟動，維持未測。本機測試只在 Python 3.14.6 執行。修改只用 `os.path.realpath`、`os.path.commonpath`、`ValueError`（3.11 皆有）——讀碼判斷，非實測。
- 依賴已核對：`requirements.txt` 含 `python-docx`、`fastapi`、`sqlalchemy`；`requirements-dev.txt` 含 `pytest>=9.0.0`、`httpx>=0.27.0,<0.28`（HTTP 測試所需）。
- 有 Docker 的可丟棄環境補測（不掛正式資料，只跑兩個已接受的測試檔；安裝失敗即停止，退出碼為真實結果）：
  ```bash
  docker run --rm -v "$PWD/backend":/src:ro -e DATABASE_URL=sqlite:///:memory: -e PYTHONDONTWRITEBYTECODE=1 python:3.11-slim \
    sh -c 'set -eu; python --version; cp -r /src /work; cd /work; pip install -q -r requirements.txt -r requirements-dev.txt; python -c "import docx, httpx, pytest; print(\"deps ok\")"; exec python -m pytest tests/test_docx_path_guard.py tests/test_docx_path_guard_http.py -v -p no:cacheprovider'
  rc=$?; echo "exit=$rc"; test "$rc" -eq 0
  ```
  `set -eu` 讓任一步失敗即以該退出碼結束；`exec` 使容器退出碼等於 pytest 的退出碼；外層先存 `$?` 再輸出。

## 10. 不在本次部署
- 本機分支其他任何修改（含尚未推送的提交與其他未提交檔案）、`NOI-EXPORT-DOCX-2026-001`（仍 REVISE）、ITP 英文必填（待決策）、手機版（延期）。
- 8240／3240 與 8198／3198 不受影響，保持原狀。
