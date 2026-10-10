# DEPLOY-EXEC-2026-001 — 後端 sudo 唯讀預檢（使用者執行）

對應 `DOCX-PATH-GUARD-2026-001-deploy-handoff.md` v3 §3（容器／映像身分、可寫層差異、helper 三處雜湊、API 基準）與 §4 門檻 G（compose 標籤、執行器、env-file、有效設定對照執行中容器）。**只讀，不部署。**

## 使用者執行（在自己的 Mac 終端機）

```bash
ssh -t ykdaniel@192.168.15.100 'sha256sum ~/qualitas-backend-precheck.sh && bash ~/qualitas-backend-precheck.sh'
```

- 第一行雜湊必須是 `a609b6223f926ceb6076145ed55f3865518991778baa817084b1e09d9ccbe9c6`；不同就按 Ctrl-C 停止。
- 只在提示時輸入 NAS sudo 密碼。密碼不寫入報告，也不要傳給任何人。
- 跑完只需回覆「跑完了」。報告存在 NAS `~/qualitas-backend-precheck-<UTC時間>.txt`（權限 600），Claude 用既有 SSH 金鑰直接讀取，**不需要貼完整 docker inspect 或 compose 設定**。

## 腳本做什麼／不做什麼
- 腳本原檔：`docs/workflow/DEPLOY-EXEC-2026-001-backend-precheck.sh`（與 NAS 上的檔案雜湊相同）。
- 只讀：`docker inspect`、`docker image inspect`、`docker diff`、`docker exec`（只跑 `sha256sum`／`stat`）、`docker-compose config`（使用容器標籤上的專案名、設定檔、env-file）、未登入 GET `/api/user/profile`（只記狀態碼）。
- 原映像的 helper 用一個臨時容器讀取：`docker run --rm --network none --read-only`。不掛正式資料，跑完立即刪除。
- 不重啟、不建置、不打標籤、不改檔案或設定。
- **秘密處理**：完整 inspect／compose 設定只在管線記憶體中解析，不落地、不顯示。報告只有：容器／映像 ID、compose 標籤（路徑）、掛載來源→目的、網路、`/app` 下的 diff 行、helper 雜湊與權限、設定欄位、**環境變數鍵名**，以及檢查結果。值的比對只輸出「相同／不同的鍵名」，不輸出值。

## 判定（腳本最後列出 PASS／FAIL）
任一 FAIL 即停止，不部署。檢查項目：
- 容器 running、未重啟。
- 映像 ID 一致。
- `docker diff` 有執行，且 `/app` 下沒有程式檔變更。
- helper：容器內雜湊＝原映像雜湊＝修復前基準 `95208d8a…`，權限 644。
- 未登入探針回 401。
- G1：標籤齊全，service＝backend。
- G2：執行器版本＝標籤版本。
- G3：env-file 有標籤可定。
- G4：container_name、volumes、networks、restart、Cmd 與執行中容器一致；compose 環境鍵都在容器內，值相同（只比對不輸出）；容器的鍵都能由映像＋compose 解釋。

全部 PASS 仍需獨立審查後，才依 v3 §5–§7 產生實際建置／切換／回退指令。「加入 override 後只有 `services.backend.image` 改變」要等 override 檔產生後才能驗證，屬於部署步驟，不在本預檢內。

## 自測（Claude，2026-10-08）
- 本機 Colima 模擬容器（`python:3.11-slim`，helper＝基準 `95208d8a…`，帶 compose 標籤、bind mount、自訂網路、`SECRET_KEY` 等測試值；用假的 sudo／compose 執行器）：
  - 正常情況全部 PASS → `DEPLOY-EXEC-2026-001-evidence/backend-precheck-selftest-mock-pass.txt`。
  - Docker 無法連線：21 項 FAIL，不會出現空資料卻判 PASS（只有獨立的探針項 PASS）→ `…-docker-unreachable.txt`。
  - 容器內 helper 被熱修、compose 秘密值不一致：分別抓到 diff 有程式檔變更、容器與映像雜湊不同、`differ_keys=['SECRET_KEY']` → `…-tamper.txt`。
  - 三份輸出以 grep 檢查測試秘密值，出現次數皆為 0。模擬資源已清除。
- NAS 本身：腳本以 `scp` 放到 `~/qualitas-backend-precheck.sh`（700），雜湊與 repo 檔相同。
  - NAS bash 4.4 執行 `bash -n` 通過。
  - 內嵌 Python 在 NAS Python 3.8 `py_compile` 通過（暫存檔與 `/tmp/__pycache__` 已刪）。
  - NAS 上不用 sudo 試跑 `docker-compose … config --format json`：可由 Python 3.8 解析，並只印出結構。
- **未在 NAS 以 sudo 實跑**（需使用者密碼）。
