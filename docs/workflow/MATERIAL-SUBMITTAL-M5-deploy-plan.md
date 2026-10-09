# MATERIAL-SUBMITTAL-M5 — 部署方案（R2，使用者決定略過獨立審查後執行）

TASK_ID: MATERIAL-SUBMITTAL-M5-2026-001 · R1 方案已封存為 `MATERIAL-SUBMITTAL-M5-R1-SUPERSEDED-deploy-plan-archive.md`。
NAS 工作目錄：`~/deploy-material-m5-20261009T055016Z`（700）。本機產物：`~/Documents/Qualitas-deploy-artifacts/MATERIAL-SUBMITTAL-M5/r2/`（700）。

## 1. 正式站現況（2026-10-09 唯讀核對）
- 後端原始碼：NAS `backend/` 中 056c245c 的 332 個檔案**全部相同**，沒有多出的 .py（除 macOS `._*` 附加檔）→ 正式站程式＝基準 056c245c。執行中的映像未核對（需要 sudo）。
- 前端：`dist/index.html` sha256 `63ae5c2e…bf3`，169 個資產（DEPLOY-EXEC 上線後狀態）。
- 資料庫：6.7 MB，34 張表，沒有材料表；70 個權限、2 個使用者、1 個專案、4 個承包商。
- 磁碟：/volume1 使用 21%。

## 2. 部署範圍
- 後端：只有 21 個材料檔（修改 12、新增 9），清單 `overlay-backend-rel.txt`；`backend-overlay.tgz` sha256 `1709b6e5…016f`。**不含** DOCX（docx_builder 與 2 個測試，屬 DEPLOY-EXEC）與 `scripts/verification/`。
- 前端：基準＋材料 21 檔＋已上線的 ITP 7 檔（雜湊等於 DEPLOY-SCOPE-INVENTORY 上線版），建置出 106 個檔案；`index.html` `4f71ef9f…3a5e`。相對正式站：新增 69 個資產、36 個相同、0 個衝突。
- requirements.txt、Dockerfile、package.json 與基準相同（不需新套件；Pillow 由 `qrcode[pil]` 安裝，3.11 映像中為 12.3.0）。

## 3. 已完成的驗證
- Python 3.11 全套（候選樹，repo 目錄結構）：見 STATUS。
- 升級／回退演練（Python 3.11）：空白資料庫、**正式資料庫複本**兩種都 6 個階段 PASS（`r2-upgrade-rollback-rehearsal-*.txt`）。
- 前端候選：tsc、npm test 144、vite build 都是 EXIT 0。

## 4. 備份（已完成，位於 NAS 工作目錄）
| 項目 | 檔案 | 核對 |
|---|---|---|
| B1 資料庫 | `qualitas-pre-m5.db`（SQLite online backup，600） | sha256 `8c926896…715da`，integrity ok；本機副本相同雜湊（只用於演練） |
| B2 上傳檔 | `uploads-manifest.txt` | 6 個檔案的清單與雜湊 |
| B3 後端程式 | `backend-code-pre-m5.tgz` | sha256 `c345dd74…6687` |
| B4 前端 | `frontend-index-pre-m5.html`、`frontend-dist-pre-m5-sha256.txt` | 174 個檔案的清單（含 `._*`） |
| B3' 映像 | 由使用者在切換指令中標記 `qualitas-backend:pre-m5-20261009T055016Z` | — |

## 5. 切換步驟
1. Claude：`apply-backend.sh`——把暫存區核對過的 21 個檔案複製進 `backend/`，再核對一次（不需要 sudo；執行中的容器不受影響）。
2. **使用者**（需要 sudo 密碼）：標記目前映像為 pre-m5、重建後端。
3. Claude：讀 `backend/logs/app.log` 確認啟動與 migration；對外 `/api/user/profile` 未登入 401、材料路由未登入 401（舊版是 404）。
4. Claude：前端——先把 69 個新資產複製進 `dist/assets/`，最後以同目錄 `mv` 原子替換 `index.html`（不刪除 dist 目錄、不刪舊資產）。
5. Claude：對外核對 `/` 與新資產雜湊；使用者確認三個容器都是 Up。
6. **使用者**：登入後唯讀冒煙（不新增業務資料）：開啟材料頁（空清單、表格／展示架切換）、儀表板材料卡片（0）、文件編號規則頁有 MSA、ITP 頁正常。上線後由管理員在 IAM 指派材料權限（admin 自動擁有）。

## 6. 回退（L1：只回退程式，保留資料；已演練）
- 前端：`cp -p frontend-index-pre-m5.html dist/.index.html.rb && chmod 644 … && mv -f dist/.index.html.rb dist/index.html`（舊資產一直保留）。
- 後端，快：把 `qualitas-backend:pre-m5-20261009T055016Z` 這個映像重新標回 compose 使用的名稱再 `up -d`；或穩：`rollback-backend-code.sh`（還原 12 檔、移除 9 檔並核對）後重建。
- 材料資料與新欄位留在資料庫，舊版會忽略（演練 phase C／D）。L2（還原整個資料庫 B1）只用於證實的資料損毀，會遺失切換後所有寫入，須使用者決定。
