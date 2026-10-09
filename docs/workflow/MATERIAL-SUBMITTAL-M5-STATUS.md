# MATERIAL-SUBMITTAL-M5 — STATUS（R2：已上線）

TASK_ID: MATERIAL-SUBMITTAL-M5-2026-001 · ROUND: R2 · R1 已封存為 `MATERIAL-SUBMITTAL-M5-R1-SUPERSEDED-*-archive.md`。
依使用者決定略過獨立審查（M6 R2 與本輪皆**未經獨立審查**），但完成全部準備後才上線。未提交、未推送。

## RESULT
- [x] DONE（已上線；登入後冒煙待使用者執行）

## 上線
- 後端：2026-10-09 06:46:04Z（UTC）新容器啟動（映像 `sha256:e38e3389…`）；使用者以 sudo 執行標記與重建，回退映像 `qualitas-backend:pre-m5-20261009T055016Z`。
- 前端：同日 06:46Z 後新增 69 個資產並原子替換 `index.html`（`4f71ef9f…3a5e`）；dist inode 376368 不變，舊資產全部保留（現有 238 個）。
- 服務中斷：後端重建切換時約 40 秒 `/api/*` 回 502（14:45:37–14:46:04 本地時間），其餘時間正常。

## 準備與驗證（`MATERIAL-SUBMITTAL-M5-evidence/`）
| 項目 | 結果 |
|---|---|
| 正式站唯讀核對 | 後端原始碼與 056c245c 的 332 檔全部相同、無多餘 .py；前端為 DEPLOY-EXEC 上線版；DB 34 表、無材料表 |
| 部署範圍 | 後端 21 檔（材料，修改 12／新增 9），前端基準＋材料 21＋已上線 ITP 7；完整性：工作樹中 backend／react-app 的變更只有 DOCX 3 檔未納入（刻意排除） |
| Python 3.11 全套（候選樹，repo 結構） | `r2-py311-backend-full-suite.txt`：**2304 passed，16 skipped，EXIT 0**（Pillow 12.3.0） |
| 升級／回退演練（3.11） | 空白資料庫 `r2-upgrade-rollback-rehearsal-empty.txt`、**正式資料庫複本** `r2-upgrade-rollback-rehearsal-prodcopy.txt`：6 階段皆 PASS，EXIT 0 |
| 前端候選 | `r2-frontend-candidate-checks.txt`：tsc、npm test 144、vite build 皆 EXIT 0；106 檔 |
| 備份（NAS `~/deploy-material-m5-20261009T055016Z`） | DB online backup `8c926896…715da` integrity ok；uploads 清單；後端程式快照 `c345dd74…6687`；前端入口與清單；啟動時另有自動備份 `qualitas_20261009_064604.db` |
| 上傳核對 | 後端包 `1709b6e5…016f`、前端包 `f8017fb1…23d5` 兩端雜湊相同，暫存區逐檔 OK；套用後 live 原始碼＝manifest（`r2-deploy-log.txt`） |
| 啟動日誌 | migrations completed、權限同步 72、無 STARTUP ABORTED／MigrationError |
| 正式 DB（唯讀） | 4 張材料表、12 個索引、client_request_id、2 個材料權限（描述為新文字）、權限 72、資料列 0、quick_check ok |
| 對外 | `r2-post-deploy-http-check.txt`：/ 與 /index.html＝候選；主 bundle、MaterialSubmittal、Dashboard 資產 200 且相同；舊資產 200；/api/user/profile 401；材料路由 401（原 404） |

## 備註
- 啟動時自動備份輪替刪除了 `backups/qualitas_20260901_145117.db`（保留最新 7 份的既有行為）；本次的 B1 備份不受輪替影響。
- 重建時出現 `CLOUDFLARE_TUNNEL_TOKEN variable is not set` 警告：只重建 backend，tunnel 容器未被重建，對外檢查正常。
- 三個容器的 `docker ps` 狀態：指令最後一步在等第二次 sudo 密碼，待使用者確認；對外檢查已證明 tunnel、前端、後端都在服務。
- 正式資料庫複本存於本機 `~/Documents/Qualitas-deploy-artifacts/MATERIAL-SUBMITTAL-M5/r2/prodcopy/`（700），只供演練。

## 待使用者
1. 登入後唯讀冒煙：材料頁（空清單、表格／展示架切換）、儀表板材料卡片（0）、文件編號規則頁有 MSA、ITP 頁正常。**不新增業務資料**；之後由你決定何時開始登錄材料。
2. IAM：admin 以外的角色需手動指派 `查看核准材料`／`登錄與編輯核准材料`。
3. 是否提交（commit）這批材料程式；目前只在工作樹與部署產物中。
4. M6 R2／M5 的獨立審查：額度恢復後可補審。

## 回退
見 `MATERIAL-SUBMITTAL-M5-deploy-plan.md` §6（前端換回 `frontend-index-pre-m5.html`；後端用 pre-m5 映像或 `rollback-backend-code.sh` 後重建；資料保留）。
