# DOCX-PATH-GUARD-2026-001 — 部署交接（**只準備，未執行**）

> 狀態：**本機修復已通過獨立審查（PASS），尚未部署。** 正式站目前仍跑舊版 helper。
> 本文件不是部署授權；實際部署需使用者明確指示。部署範圍**只限**本次已審的一個檔案。

## 1. 部署內容

| 項目 | 值 |
|---|---|
| 唯一部署檔案 | `backend/core/docx_builder.py`（本機工作樹，未提交） |
| 修復後 SHA-256（要上線的版本） | `0e43664f4e600804688cd37263bcd1b84e0c48da64f4767cc147cf2cf07b4cdd` |
| 修復前 SHA-256（本機 HEAD `056c245c` 的版本，預期與正式站目前版本相同） | `95208d8af5c231f4f3de22b4fc74f7e0e5d604d79bac191ceceb80f768e78e6d` |
| 差異 | 只有 `resolve_local_upload_path` 的目錄包含判定，見 `DOCX-PATH-GUARD-2026-001-evidence/docx_builder.diff` |
| 不部署 | 兩個新測試檔（正式容器不需要）、`BACKLOG.md`、任何其他檔案；**不**打包整個 `backend/` 或工作樹 |

## 2. 目標服務

| 項目 | 值 | 來源 |
|---|---|---|
| 主機 | Synology NAS `192.168.15.100`，使用者 `ykdaniel` | 記憶檔 `deployment_nas.md` |
| 專案目錄 | `/volume1/docker/Qualitas/` | 同上 |
| 服務／容器 | compose service `backend`，容器名 `qualitas-backend` | repo `docker-compose.yml` |
| 程式碼位置 | **建置時打包進映像**（`backend/Dockerfile`：`COPY . .`，`WORKDIR /app`），未以 volume 掛載程式碼 → 容器內路徑 `/app/core/docx_builder.py` | repo `Dockerfile`、`docker-compose.yml` |
| 執行方式 | `uvicorn main:app`，單一程序，uid 10001 | repo `Dockerfile` |
| 容器 Python | `python:3.11-slim`（本機測試用 3.14.6；`os.path.commonpath` 兩版都有，但**未在 3.11 上實測**） | repo `Dockerfile` |

**待確認（部署前必查，全部唯讀）**
1. NAS 上的 `docker-compose.yml`／`Dockerfile` 是否與 repo 一致。
2. 正式站目前的檔案版本：主機檔與容器內檔的 SHA-256 是否都等於上表「修復前」值。
3. 執行者與 sudo：`docker` 需 `sudo /usr/local/bin/docker`，需密碼；非互動 SSH 要加 `-t`（記憶檔）。
4. 維護時段：重啟後端期間 `/api/*` 會短暫失敗（前端與通道不受影響）。
5. 冒煙檢查用的紀錄（見 §5）。

## 3. 部署方式

### 方案 A（建議）：只替換單一檔案並重啟，不重建映像
理由：`COPY . .` 會把 NAS `backend/` 目錄的**全部現況**打包；若主機目錄有尚未建置的檔案，重建會順帶上線未審修改。方案 A 只動一個檔案。

```bash
# (本機終端機) 傳檔到 NAS 家目錄
scp -O backend/core/docx_builder.py ykdaniel@192.168.15.100:~/docx_builder.py.new
```

```bash
# (NAS SSH 終端機) 0) 預檢：三個值都要對才繼續，否則停止回報
sha256sum ~/docx_builder.py.new                                   # 應為 0e43664f…7b4cdd
sha256sum /volume1/docker/Qualitas/backend/core/docx_builder.py   # 應為 95208d8a…e78e6d
sudo /usr/local/bin/docker exec qualitas-backend sha256sum /app/core/docx_builder.py   # 應為 95208d8a…e78e6d

# 1) 備份（主機檔＋容器內檔）
cp -p /volume1/docker/Qualitas/backend/core/docx_builder.py ~/docx_builder.py.bak-20261007
sudo /usr/local/bin/docker cp qualitas-backend:/app/core/docx_builder.py ~/docx_builder.py.container-bak-20261007
sha256sum ~/docx_builder.py.bak-20261007 ~/docx_builder.py.container-bak-20261007

# 2) 更新主機檔（讓日後重建也帶著修復）
cp ~/docx_builder.py.new /volume1/docker/Qualitas/backend/core/docx_builder.py
chmod 644 /volume1/docker/Qualitas/backend/core/docx_builder.py

# 3) 放進執行中的容器並重啟（重啟保留容器檔案系統；檔案大小改變會使舊 .pyc 失效）
sudo /usr/local/bin/docker cp ~/docx_builder.py.new qualitas-backend:/app/core/docx_builder.py
sudo /usr/local/bin/docker restart qualitas-backend

# 4) 確認
sudo /usr/local/bin/docker exec qualitas-backend sha256sum /app/core/docx_builder.py   # 應為 0e43664f…7b4cdd
sudo /usr/local/bin/docker ps -a | grep qualitas        # 三個容器都要 Up
sudo /usr/local/bin/docker logs --tail=50 qualitas-backend
```

注意：方案 A 之後，容器內檔案與映像不同；之後若有人執行 `up -d`／重建，會改用主機目錄重新打包（主機檔已在步驟 2 更新，所以修復仍會保留）。

### 方案 B：重建映像（**只在**確認主機 `backend/` 與執行中映像一致時才可用）
```bash
cd /volume1/docker/Qualitas && sudo /usr/local/bin/docker-compose --env-file .env.tunnel up -d --build backend
```
前提：先比對主機 `backend/` 程式檔與容器 `/app` 的雜湊清單（排除 `qualitas.db`、`uploads/`、`backups/`、`logs/`、`.env`、`__pycache__`），只差 `core/docx_builder.py` 才可用；否則會順帶上線未審修改。

## 4. 回退

```bash
# (NAS SSH) 方案 A 的回退
cp -p ~/docx_builder.py.bak-20261007 /volume1/docker/Qualitas/backend/core/docx_builder.py
sudo /usr/local/bin/docker cp ~/docx_builder.py.container-bak-20261007 qualitas-backend:/app/core/docx_builder.py
sudo /usr/local/bin/docker restart qualitas-backend
sudo /usr/local/bin/docker exec qualitas-backend sha256sum /app/core/docx_builder.py   # 應回到 95208d8a…e78e6d
```
回退觸發條件：重啟後容器不是 Up、日誌出現 `docx_builder` 相關錯誤、或 §5 冒煙檢查失敗。回退會恢復已知的路徑缺口，回退後須通知審查方。

## 5. 部署後冒煙檢查（只用合法測試資料，唯讀）

1. 基本：`https://qualitas.rokusumi.net/` 回 200；三個容器 Up；後端日誌無新錯誤。
2. 匯出：由有權限的使用者登入（**我不能代為輸入正式站密碼**），選一筆**指定的測試用** ITR 或 NCR，該紀錄須已有經正常上傳流程上傳的照片：
   - 按「Export Word」，下載成功（200）。
   - 打開 .docx，確認照片仍正常顯示（證明合法根內圖片未被誤擋）。
   - 一筆 NOI 匯出，確認附件檔名清單仍在。
3. **不在正式站做負向測試**：不寫入任何越界路徑、不建立同前綴目錄、不讀任何非測試紀錄的內容。負向行為由本機 32 項測試覆蓋。

**待確認**：哪一筆紀錄是可用的合法測試資料（建議使用者指定測試專案中的一筆 ITR 與一筆 NCR）；若正式站沒有現成的測試紀錄，是否允許建立一筆（屬正式資料寫入，需使用者另行同意）。

## 6. 不在本次部署
- 本機分支其他任何修改（含 122 個尚未推送的提交與其他未提交檔案）、`NOI-EXPORT-DOCX-2026-001`（仍 REVISE）、ITP 英文必填（待決策）、手機版（延期）。
- 8240／3240 隔離環境與 8198／3198 使用者環境不受部署影響，保持原狀。
