# DOCX-PATH-GUARD-2026-001 — 部署交接 v2（**只準備，未執行**）

> **本機修復通過（產品 PASS 不變），本次未部署；線上實際版本待唯讀核對。**
> v1 經 `DOCX-PATH-GUARD-2026-001-deploy-review.md` 判為 REVISE，原文逐字保留於 `DOCX-PATH-GUARD-2026-001-deploy-handoff-v1-REVISED.md`。
> 本文件不是部署授權。部署範圍只限本次已審的單一檔案。本文件不索取、不記錄任何 sudo 或正式站密碼；需要特權的指令由使用者在自己的終端機輸入。

## v1 → v2 修正
1. **撤回** v1「方案 A 之後 `up -d`／重建必然保留修復」的說法。`docker cp`＋`restart` 只改同一容器的可寫層：容器**重新建立**（`compose up` 重建容器、`down`／`rm`、映像更新後重建等）就會失去；`compose up -d` 不保證重新建置映像；更新 NAS 主機檔也不會讓既有映像自動帶入修復。v1 方案 A 降為「僅限緊急的臨時熱修」（§7）。
2. 主方案改為**以已確認的部署映像 ID 為基底、只加入已審單檔的衍生映像**（§4），並先預檢容器可寫層有無其他熱修（§3）。
3. 「正式站仍跑舊版」改為「本次未部署，線上實際版本待唯讀核對」。本機 HEAD 雜湊只是比較基準，不是遠端證據。
4. 刪除「檔案大小改變會使 .pyc 失效」這類通用保證。
5. 補上後端就緒檢查（§5）、每次唯一名稱的備份與回退（§3、§6）。
6. Python 3.11 相容性：**未測**（§8）。

## 1. 部署內容

| 項目 | 值 |
|---|---|
| 唯一部署檔案 | `backend/core/docx_builder.py`（本機工作樹，未提交） |
| 要上線版本 SHA-256 | `0e43664f4e600804688cd37263bcd1b84e0c48da64f4767cc147cf2cf07b4cdd` |
| 比較基準（本機 HEAD `056c245c` 的修復前版本） | `95208d8af5c231f4f3de22b4fc74f7e0e5d604d79bac191ceceb80f768e78e6d` — **僅供比對，不代表線上版本** |
| 不部署 | 新測試檔、`BACKLOG.md`、文件、其他任何檔案；不打包整個 `backend/` 或工作樹；不使用 NAS 主機的 `backend/` 目錄作為 build context |

## 2. 目標與已知／待確認資訊

| 項目 | 已知（來源） | 待確認 |
|---|---|---|
| 主機 | NAS `192.168.15.100`，使用者 `ykdaniel`（記憶檔） | — |
| 專案目錄 | `/volume1/docker/Qualitas/`（記憶檔） | — |
| 服務／容器名 | compose service `backend`、`container_name: qualitas-backend`（repo `docker-compose.yml`） | NAS 上的 compose 檔是否與 repo 一致；compose 專案名與預設映像名 |
| 程式碼位置 | 建置時打包進映像（repo `Dockerfile` `COPY . .`、`WORKDIR /app`），compose 未掛載程式碼；容器內 `/app/core/docx_builder.py` | NAS 上的 Dockerfile 是否一致 |
| 映像設定 | `python:3.11-slim`、`USER qualitas`(uid 10001)、`CMD uvicorn main:app ... --port 8000`（repo Dockerfile） | **實際部署映像的 ID、Cmd、User、Env、WorkingDir**（§3 記錄） |
| docker／compose 版本 | 記憶檔：`/usr/local/bin/docker`、`/usr/local/bin/docker-compose`；其他對話紀錄另見 `docker compose --env-file .env.tunnel` 的用法 | 實際是 compose v1 或 v2、是否需要 `--env-file .env.tunnel`、`docker build` 是否用 BuildKit |
| 特權 | `docker` 需 `sudo`（記憶檔） | 由使用者自行輸入，不記錄 |
| 冒煙用測試紀錄 | — | 由使用者指定（§5） |

## 3. 預檢（全部唯讀；在 NAS SSH 終端機由使用者執行）

```bash
TS=$(date +%Y%m%d-%H%M%S); W=~/docx-guard-$TS; mkdir "$W"; echo "$W"     # 本次工作目錄，名稱唯一
cd /volume1/docker/Qualitas

# 3.1 記錄容器與映像的身分（ID，不只名稱）
sudo /usr/local/bin/docker inspect qualitas-backend \
  --format 'container={{.Id}} image={{.Image}} configImage={{.Config.Image}} status={{.State.Status}} restarting={{.State.Restarting}} restarts={{.RestartCount}} started={{.State.StartedAt}}' \
  | tee "$W/precheck-container.txt"
IMG=$(sudo /usr/local/bin/docker inspect qualitas-backend --format '{{.Image}}'); echo "$IMG" | tee "$W/base-image-id.txt"
sudo /usr/local/bin/docker image inspect "$IMG" \
  --format 'id={{.Id}} digests={{.RepoDigests}} tags={{.RepoTags}} created={{.Created}} user={{.Config.User}} workdir={{.Config.WorkingDir}} cmd={{json .Config.Cmd}} entrypoint={{json .Config.Entrypoint}} env={{json .Config.Env}}' \
  | tee "$W/precheck-image.txt"

# 3.2 容器可寫層與映像的差異：找出是否已有其他熱修
sudo /usr/local/bin/docker diff qualitas-backend | tee "$W/precheck-docker-diff.txt"

# 3.3 helper 的三個版本與權限
sudo /usr/local/bin/docker exec qualitas-backend sh -c 'sha256sum /app/core/docx_builder.py; stat -c "%a %u:%g %s" /app/core/docx_builder.py' | tee "$W/precheck-helper-container.txt"
sudo /usr/local/bin/docker run --rm --entrypoint sh "$IMG" -c 'sha256sum /app/core/docx_builder.py; stat -c "%a %u:%g %s" /app/core/docx_builder.py; python --version' | tee "$W/precheck-helper-image.txt"
sha256sum backend/core/docx_builder.py | tee "$W/precheck-helper-host.txt"

# 3.4 compose 有效設定與版本
sudo /usr/local/bin/docker-compose version | tee "$W/precheck-compose-version.txt"
sudo /usr/local/bin/docker version --format '{{.Server.Version}}' | tee "$W/precheck-docker-version.txt"
```

**停止條件（任一成立就停止、回報，不進入 §4）**
- `precheck-docker-diff.txt` 在 `/app` 下出現 `.py` 或其他程式檔的 `A`／`C`／`D`（只有 `__pycache__`、`/tmp` 等執行期產物可忽略，並逐條記錄判斷）。代表容器內有映像以外的熱修，衍生自原映像會遺失它們。
- 容器內與映像內的 helper 雜湊不同。
- 映像內 helper 雜湊不是比較基準 `95208d8a…`（代表線上版本與本機修復前版本不同，修復 diff 需要重新審查是否仍只改一處）。
- 容器狀態不是 `running`，或正在重啟。

## 4. 主方案：單檔衍生映像（只準備，未執行）

```bash
# 4.1 把原映像固定成唯一的回退標籤（不刪除、不覆寫任何既有標籤）
ROLLBACK_TAG=qualitas-backend-rollback:$TS
sudo /usr/local/bin/docker tag "$IMG" "$ROLLBACK_TAG"

# 4.2 build context 只有兩個檔案：Dockerfile 與已審 helper
#    （本機終端機先傳檔：scp -O backend/core/docx_builder.py ykdaniel@192.168.15.100:~/docx_builder.py.new）
cp ~/docx_builder.py.new "$W/docx_builder.py"
sha256sum "$W/docx_builder.py"            # 必須為 0e43664f…7b4cdd，否則停止
cat > "$W/Dockerfile" <<EOF
FROM $ROLLBACK_TAG
COPY --chown=10001:10001 docx_builder.py /app/core/docx_builder.py
EOF
# 若 §3.3 記錄的原檔權限不是 644，於 COPY 後以 USER root + chmod 還原相同權限，再切回 USER qualitas（需另審）。

FIX_TAG=qualitas-backend-docx-guard:$TS
sudo /usr/local/bin/docker build --pull=false -t "$FIX_TAG" "$W"     # 不從 registry 拉基底；context 只有 $W

# 4.3 驗證衍生映像（不啟動服務、不掛正式資料）
sudo /usr/local/bin/docker run --rm --entrypoint sh "$FIX_TAG" -c 'sha256sum /app/core/docx_builder.py; stat -c "%a %u:%g" /app/core/docx_builder.py'
#   必須為 0e43664f…7b4cdd
for t in "$IMG" "$FIX_TAG"; do sudo /usr/local/bin/docker image inspect "$t" --format '{{.Config.User}}|{{.Config.WorkingDir}}|{{json .Config.Cmd}}|{{json .Config.Entrypoint}}|{{json .Config.Env}}|{{json .Config.ExposedPorts}}'; done
#   兩行必須完全相同（只有檔案層不同）
sudo /usr/local/bin/docker run --rm --entrypoint python "$FIX_TAG" -c "import sys; sys.path.insert(0,'/app'); from core import docx_builder; print('import ok')"

# 4.4 受控 compose override（唯一檔名；不修改原 docker-compose.yml）
cat > docker-compose.docx-guard-$TS.yml <<EOF
services:
  backend:
    image: $FIX_TAG
EOF
# 切換：只重建 backend 容器、不建置、不動相依服務
sudo /usr/local/bin/docker-compose [--env-file .env.tunnel] -f docker-compose.yml -f docker-compose.docx-guard-$TS.yml up -d --no-build --no-deps backend
#   [--env-file .env.tunnel] 依 §2 待確認結果決定是否需要
```

**切換後必讀**
- 之後任何對 backend 的 compose 操作都必須帶同一個 override 檔，否則 compose 會回到原設定（重新使用預設映像，或在帶 `--build` 時用 NAS 主機的 `backend/` 目錄重新建置，**可能遺失修復或順帶上線未審修改**）。這是持久化的前提，需寫入正式部署紀錄。
- 是否同步更新 NAS 主機的 `backend/core/docx_builder.py`、或日後改回標準建置流程，屬另一個決定，本任務不處理。

## 5. 就緒與冒煙檢查

```bash
# 5.1 容器狀態與身分
sudo /usr/local/bin/docker inspect qualitas-backend --format 'container={{.Id}} image={{.Image}} status={{.State.Status}} restarting={{.State.Restarting}} restarts={{.RestartCount}} started={{.State.StartedAt}}' | tee "$W/post-container.txt"
#   image 應為 $FIX_TAG 的 ID；新 container ID 與 §3.1 不同屬正常（容器已重建）
sudo /usr/local/bin/docker exec qualitas-backend sha256sum /app/core/docx_builder.py     # 0e43664f…7b4cdd
sudo /usr/local/bin/docker ps -a | grep qualitas                                         # 三個容器皆 Up

# 5.2 後端就緒：日誌出現啟動完成，且容器內直接打應用根路徑
sudo /usr/local/bin/docker logs --since "$(cat "$W/post-container.txt" | sed -n 's/.*started=\([^ ]*\).*/\1/p')" qualitas-backend 2>&1 | tee "$W/post-logs.txt" | tail -40
#   應看到 uvicorn 的 "Application startup complete"，且無 Traceback
sudo /usr/local/bin/docker exec qualitas-backend python -c "import urllib.request,json;r=urllib.request.urlopen('http://127.0.0.1:8000/');print(r.status, r.read()[:80])"
#   應為 200 與 "... is running"
```

```bash
# 5.3 經 nginx／通道的 API 可達性（本機或任一終端機，不需登入）
curl -s -o /dev/null -w '%{http_code}\n' https://qualitas.rokusumi.net/                      # 200（只代表前端）
curl -s -o /dev/null -w '%{http_code}\n' https://qualitas.rokusumi.net/api/user/profile      # 401＝請求到達後端並被驗證拒絕；502／530＝後端或通道異常
```

**5.4 合法匯出冒煙（由使用者登入；唯讀）**
- 使用使用者指定的**測試用** ITR 與 NCR 各一筆，須已有經正常上傳流程上傳的照片：按「Export Word」，下載成功，照片仍顯示（合法根內圖片未被誤擋）。
- 一筆 NOI 匯出：附件檔名清單仍在。
- **不在正式站做負向測試**（不寫越界路徑、不建同前綴目錄、不讀非測試紀錄內容）；負向行為由本機 32 項測試覆蓋。
- 待確認：測試紀錄由誰指定；若正式站沒有可用的測試紀錄，是否允許建立（屬正式資料寫入，需另行同意）。

**失敗判定 → 進入 §6 回退**：容器非 running 或持續重啟；日誌有 Traceback 或無啟動完成；5.2 非 200；5.3 API 為 502／530；5.4 合法匯出失敗或照片消失。

## 6. 回退

```bash
cd /volume1/docker/Qualitas
cat > docker-compose.docx-guard-rollback-$TS.yml <<EOF
services:
  backend:
    image: $ROLLBACK_TAG
EOF
sudo /usr/local/bin/docker-compose [--env-file .env.tunnel] -f docker-compose.yml -f docker-compose.docx-guard-rollback-$TS.yml up -d --no-build --no-deps backend
sudo /usr/local/bin/docker inspect qualitas-backend --format 'image={{.Image}} status={{.State.Status}}'   # image 應等於 $W/base-image-id.txt
sudo /usr/local/bin/docker exec qualitas-backend sha256sum /app/core/docx_builder.py                      # 應等於 §3.3 的映像內雜湊
```
- 回退後重做 §5.1–5.3。
- **回退會恢復已知的同前綴路徑缺口**，回退後須通知審查方並記錄原因。
- `$ROLLBACK_TAG`、`$FIX_TAG`、`$W` 下的全部預檢與部署紀錄都保留，不刪除。

## 7. 備用：臨時熱修（僅限緊急，**不是**持久化部署）

只在無法建置衍生映像、且必須立即止血時使用，並須在容器下一次被重新建立**之前**完成 §4：

```bash
cp -p -n /volume1/docker/Qualitas/backend/core/docx_builder.py "$W/host-docx_builder.py.bak"   # 唯一目錄，不覆寫
sudo /usr/local/bin/docker cp qualitas-backend:/app/core/docx_builder.py "$W/container-docx_builder.py.bak"
sudo /usr/local/bin/docker cp "$W/docx_builder.py" qualitas-backend:/app/core/docx_builder.py
sudo /usr/local/bin/docker restart qualitas-backend
```
- 修改只存在於**這一個容器**的可寫層；`restart` 會保留，但任何重新建立容器的操作都會讓它消失、回到映像內的舊版。
- 執行後立即做 §5；回退為把 `$W/container-docx_builder.py.bak` 以 `docker cp` 放回並 `restart`。
- 不能把熱修記錄為「已部署」，只能記為「臨時熱修，待映像固化」。

## 8. Python 3.11 相容性：**未測**
- 本機沒有 Python 3.11 直譯器；本機 Docker（colima）daemon 未運作。依指示不自行建立新環境，故未測。本機測試只在 Python 3.14.6 上執行。
- 修改只使用 `os.path.realpath`、`os.path.commonpath`、`ValueError`，皆為 3.11 已有的標準函式庫；這是**讀碼判斷，不是實測**。
- 若要補測（可丟棄環境、不掛正式資料、只跑兩個已接受的測試檔），可在有 Docker 的機器上：
  ```bash
  docker run --rm -v "$PWD/backend":/src:ro -e DATABASE_URL=sqlite:///:memory: -e PYTHONDONTWRITEBYTECODE=1 python:3.11-slim \
    sh -c 'cp -r /src /work && cd /work && pip install -q -r requirements.txt -r requirements-dev.txt && python -m pytest tests/test_docx_path_guard.py tests/test_docx_path_guard_http.py -v -p no:cacheprovider; echo exit=$?'
  ```
  也可在 §4.3 後於衍生映像內補跑（需另裝 pytest，屬部署相容性檢查）。

## 9. 不在本次部署
- 本機分支其他任何修改（含尚未推送的提交與其他未提交檔案）、`NOI-EXPORT-DOCX-2026-001`（仍 REVISE）、ITP 英文必填（待決策）、手機版（延期）。
- 8240／3240 隔離環境與 8198／3198 使用者環境不受影響，保持原狀。
