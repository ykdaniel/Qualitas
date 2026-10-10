# DEPLOY-EXEC-2026-001 — 前端切換與回退步驟（依現場預檢，待獨立審核；**尚未執行**）

## A. 現場事實（2026-10-07 15:59–16:01Z，遠端唯讀，已授權）
證據：`DEPLOY-EXEC-2026-001-evidence/`。
- 主機 `HOME-DS423PLUS`，SSH 使用者 `ykdaniel`（uid 1026，groups users/administrators/http）。**`sudo -n` 需要密碼**。
- 服務設定（NAS 上的 `docker-compose.yml`，與 repo 相同）：`qualitas-frontend` 為 `nginx:alpine`，`./react-app/dist:/usr/share/nginx/html:ro`、`./nginx.conf:/etc/nginx/conf.d/default.conf:ro`。NAS 另有 `.env.tunnel`。（實際容器掛載需 `docker inspect`＝需 sudo，**未直接核對**；改以下列內容比對證明服務內容。）
- NAS `nginx.conf`（sha256 `d0bd9e36…`，與 repo 版本不同檔但快取規則相同）：`root /usr/share/nginx/html`；`location = /index.html` no-cache；`location /` `try_files $uri $uri/ /index.html`；`location /assets/` `expires 1y` + `immutable`。
- `react-app/dist`：`drwxr-xr-x ykdaniel:users`，inode `376368`；104 個檔案，全部 644、目錄 755。
- **內容**：NAS `dist` 的 102 個檔案與 `20261007b` 清單逐檔 SHA-256 相同；另有 2 個 macOS 附加資訊檔 `._assets`、`._index.html`（不屬任何部署包）。
- **對外服務**：`https://qualitas.rokusumi.net/`、`/index.html`、`/assets/ITPDetail-vB1xYO_H.js`、`/assets/index-Ba-6qph1.js`、`/assets/ITP-CYLo9iOX.css` 的回應內容雜湊皆等於 NAS `dist` 對應檔 → **正式站目前前端＝NAS `dist`＝`20261007b`（＋2 個 `._` 檔）**。
- 快取：`index.html` 回應 `cache-control: no-cache, no-store, must-revalidate`、Cloudflare `cf-cache-status: DYNAMIC`；資產 `public, max-age=31536000, immutable`、Cloudflare `MISS`（之後會被快取）。
- **回退備份**：`~/Documents/Qualitas-deploy-artifacts/DEPLOY-EXEC-2026-001/rollback/nas-dist-backup-20261007T160049Z.tgz`（sha256 `ba12d3f1…b404`）；以 Python 直接讀取壓縮檔成員驗證 104 檔與遠端清單完全相同。注意：macOS 的 tar 解壓會吞掉 `._` 檔，**回退時只在 NAS 上解壓**。

## B. 切換原則
- `dist` 是 bind mount 來源目錄：**不刪除、不更換 `dist` 目錄本身**（保持 inode 376368），只在目錄內新增檔案與替換 `index.html`。
- **資產先到位、入口最後切換**：新資產檔名皆含新雜湊、與既有檔名不衝突，先全部複製進 `dist/assets/`；`index.html` 以同目錄 `mv` 原子替換為最後一步。
- **保留舊雜湊資產**：不刪除任何既有檔案（已開啟的舊頁面仍可延遲載入舊分塊）。
- 權限：NAS 預設 umask 0077 曾造成 403 → 執行時先 `umask 022`，並在替換入口前明確 `chmod 644`。
- 新資產完成前**不請求任何新檔名**（避免 Cloudflare 快取 404）。
- 不需要 sudo：所有步驟以 `ykdaniel` 身分對 `dist`（擁有者 ykdaniel）操作，nginx 唯讀掛載，內容即時生效，不重啟容器。

## C. 具體步驟（本機終端機以 SSH 金鑰執行；`TS` 執行時決定，下同）
候選包：`~/Documents/Qualitas-deploy-artifacts/DEPLOY-SCOPE-INVENTORY-2026-001/candidate/qualitas-frontend-candidate-056c245c-plus7.tgz`（sha256 `aa547fbde18914f67ada77cb53d7f01d61c878b39854749ae74ad35657c8a246`）。候選清單：同目錄 `manifests/frontend-candidate-build-sha256.txt`（102 檔）。

1. **漂移檢查**：重新取得 NAS `dist` 全檔雜湊，必須與 `DEPLOY-EXEC-2026-001-evidence/remote-dist-sha256.txt`（104 檔）完全相同；不同即停止。
2. **上傳**：`scp -O <候選包> ykdaniel@192.168.15.100:~/deploy-DEPLOY-EXEC-2026-001-$TS/candidate.tgz`；NAS 上 `sha256sum` 必須為 `aa547fbd…a246`。
3. **暫存解壓（NAS 上，GNU tar）**：`umask 022; mkdir staging; tar -xzf candidate.tgz -C staging`；暫存目錄全檔雜湊必須等於候選清單（102 檔）；`find staging -type f -exec chmod 644 {} +; find staging -type d -exec chmod 755 {} +`。
4. **資產先到位**：對 `staging/assets/*` 逐檔：若 `dist/assets/` 已有同名檔，內容雜湊必須相同（否則停止）；不存在則 `cp -p`（不覆寫）。完成後核對：候選清單中每個 `./assets/*` 都在 `dist/assets/` 且雜湊相同；`dist` inode 仍為 376368；既有 104 檔仍在且雜湊未變。
5. **入口最後切換**：`cp -p staging/index.html dist/.index.html.new && chmod 644 dist/.index.html.new && mv -f dist/.index.html.new dist/index.html`。
6. **部署後核對**：
   - NAS：候選清單 102 檔皆存在於 `dist` 且雜湊相同；舊資產保留（允許多出舊雜湊檔與 2 個 `._` 檔）；權限 644／755；inode 不變。
   - 對外：`/` 與 `/index.html` 回應雜湊＝候選 `index.html`；候選主 bundle 與 `ITPDetail`、`ITP` 新資產回 200 且雜湊相同；一個舊資產（如 `/assets/index-Ba-6qph1.js`）仍 200；`/api/user/profile` 未登入回 401（非 502／530）。
7. **冒煙（唯讀）**：未登入可做的僅為第 6 步。登入後的 ITP 畫面檢查（Criteria 左右排列、中英擇一必填提示、Insert After 顯示、Subject 整列）**需要使用者在瀏覽器自行登入**（Claude 不輸入正式站密碼）；只開啟、不按 Apply／Save，不按 Generate Checklist，不新增任何資料。

## D. 回退
- **觸發**：第 6 步任一項失敗，或冒煙發現前端錯誤。
- **快速回退（只換回入口）**：在 NAS 上把備份解壓到 `~/deploy-…-$TS/rollback-staging`（先 `scp -O` 上傳備份並核對 sha256 `ba12d3f1…b404`），`cp -p rollback-staging/index.html dist/.index.html.rb && chmod 644 dist/.index.html.rb && mv -f dist/.index.html.rb dist/index.html`。舊資產一直保留，因此回退後舊版立即完整可用。
- **核對**：`/` 回應雜湊回到 `3de542e7…e607`；NAS `index.html` 雜湊同備份。
- 新增的候選資產可暫留（不影響舊版）；如需完全恢復到備份內容，另以備份清單比對後刪除多出的新資產（不刪備份中存在的任何檔）。

## E. 後端：**被阻擋（真正阻礙）**
- v3 §3 預檢、門檻 G（容器標籤、`docker diff`、映像設定、compose 有效設定）、衍生映像建置與切換，**全部需要 `sudo docker`**；NAS 上 `sudo -n` 需要密碼，Claude 無法以非互動方式執行，也不會索取或保存密碼。
- Python 3.11 驗證已通過（官方 `python:3.11-slim`，Python 3.11.17，映像 `sha256:0dd364ba…c5ce`，32 passed，exit 0）。
- 需要使用者親自在自己的終端機執行 v3 §3 與門檻 G 的唯讀區塊（輸入 sudo 密碼），把輸出交回；或使用者另行決定其他方式。前端可先單獨部署。
