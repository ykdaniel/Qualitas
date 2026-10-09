# DEPLOY-EXEC-2026-001 — DOCX 路徑防護後端部署紀錄（2026-10-09）

**結果：已上線。** 後端於 2026-10-09 12:14:09Z 以新映像啟動（使用者以 sudo 重建，輸出 `BUILD-DONE`）。

## 依據與範圍
- 變更：`backend/core/docx_builder.py`（`resolve_local_upload_path` 改用 `os.path.commonpath`），加上 `tests/test_docx_path_guard.py`、`tests/test_docx_path_guard_http.py`。DOCX-PATH-GUARD-2026-001 獨立審查 PASS；commit 52986ac2，已經 PR #3 合併進 main（CI 綠燈）。
- 依 DECISIONS「每批 PASS 後完成準備即提交、推送及部署」執行。
- 原計畫中的後端預檢 r3 以 056c245c 為基準，材料上線後已不適用（雜湊閘門必然 FAIL），改以下列唯讀核對取代；r3 腳本未執行。

## 準備
| 項目 | 結果 |
|---|---|
| 正式站唯讀核對 | NAS 後端原始碼與材料上線候選樹 341 檔全部相同；`docx_builder.py` 為舊版 `95208d8a…` |
| 候選樹 | 材料上線候選＋DOCX 3 檔；雜湊 `0e43664f…` / `4222b14b…` / `8251ca31…`，與審查紀錄相同 |
| Python 3.11 | DOCX＋KM 匯入 35 passed（`DEPLOY-EXEC-2026-001-evidence/docx-r1-py311-tests.txt`）；NCR／NOI／ITR＋DOCX 424 passed（`docx-r1-py311-ncr-noi-itr-tests.txt`）；CI 3.12 全套在同一程式綠燈 |
| 備份（NAS `~/deploy-docx-20261009T115405Z`） | DB online backup `ca67e5f4…874f` integrity ok；舊 `docx_builder.py.pre`；回退映像標記 `qualitas-backend:pre-docx-20261009T115405Z` |
| 上傳 | 包雜湊兩端相同，暫存逐檔 OK，套用後 live＝manifest（19:54 本地時間） |

## 上線驗證
- 啟動日誌：migrations completed、權限 72、無 STARTUP ABORTED／MigrationError；沒有資料庫結構變更。
- 對外：`/api/user/profile` 401、材料路由 401、首頁仍是材料版前端（`4f71ef9f…`）。
- 登入後 DOCX 匯出：待使用者以既有紀錄唯讀驗證（不新增資料）。
- 執行中映像的內容未直接核對（需 sudo）；新啟動晚於檔案套用，且以 `--build` 重建。

## 備註
- 19:23（本地時間）後端曾有一次非部署造成的乾淨重啟，日誌無錯誤，原因未知。
- 啟動自動備份照舊輪替（保留最新 7 份）。

## 回退
`sh ~/deploy-docx-20261009T115405Z/rollback.sh` 還原舊檔後重建；或改用 `pre-docx` 映像。資料不受影響。
