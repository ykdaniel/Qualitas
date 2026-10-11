# AUDIT-BUTTON-TEST-2026-10-11 — 稽核模組全按鈕測試報告

> 只測試、不修改。所有檢查都在隔離環境執行，未動任何 `backend/`、`react-app/src/` 原始碼、開發資料庫或正式站。

## 測試環境

| 項目 | 內容 |
|---|---|
| 受測版本 | 候選樹 HEAD `d78e9023`（Audit 程式碼與 AUDIT-BUTTONS commit `9afcb977` 相同）：`~/Documents/Qualitas-deploy-artifacts/AUDIT-BUTTON-TEST-2026-10-11/cand` |
| 隔離環境 | vite `3323`／backend `8323`（`stack.json` 同資料夾；每次測試前重建並重新 seed） |
| 帳號 | `audit_full`（view/create/update/delete）、`audit_viewer`（view + create，既有紀錄唯讀、不可刪）、`audit_multi`（view/create/update，限 AHB-P1/P2 兩專案）；密碼為隔離環境專用測試常數 |
| 種子資料 | `seed_audit_hardening_b_review.py`、`seed_audit_export_docx_review.py`、`seed_audit_agenda_review.py`，加上暫存 seed（新增 Active 承包商「Second Vendor」，讓承包商篩選／排程有兩列可比） |
| 測試日期 | 2026-10-11（瀏覽器時間；種子稽核皆為 2026-10-01，排程「本月」= 2026 年 10 月） |
| 測試腳本 | `react-app/tests-browser/audit-all-buttons-check.mjs`（Playwright headless、zh 介面、1400×900） |
| 證據 | `docs/workflow/AUDIT-BUTTON-TEST-2026-10-11-evidence/`：`shots/`（截圖）、`downloads/`（7 個實際下載的 Word 檔）、`results.json`（每項檢查的原始結果與各狀態探測值）、`run-output.txt`（最後一次完整執行輸出） |
| 不在本次範圍 | **AUDIT-TEMPLATES 模板庫**：仍在 R2 審查中，不在此 build，未測。第 4 步只有固定的 4 個模板 chip（ISO 9001:2015／ISO 45001／品質管理程序書／供應商評鑑表）。 |

說明：
- `window.print` 以 stub 計數（不開對話框），列印檢查的是「是否呼叫列印一次」與「掛上的正式列印版型 `.audit-print-root` 的種類與內容」。
- Word 檢查的是實際下載：檔名、`?kind=`、檔頭 `PK`（zip/docx）、`word/document.xml` 內的標題與內容文字。
- 種子資料中 `AHB-EXPORT-1` 本身就是 **In Progress**；狀態矩陣用它代表 In Progress，另外第 B 節也透過 UI 從頭建立了一筆 In Progress 稽核（`QTS-RV-AUDIT-000001`）跑完 5 步。
- 腳本先前兩次失敗都是腳本問題（第 1 步才有編號欄、清單超過一頁時找不到列、API 建立時漏送空白日期），已修正腳本後重跑；以下只列產品行為。

## 摘要

| 結果 | 數量 | 說明 |
|---|---|---|
| PASS | 173 | |
| **FAIL** | **2** | #36 承包商欄篩選把「沒有承包商」的稽核也列入；#41 點擊停用（灰色）的刪除鈕會開啟該筆稽核 |
| 待確認 | 4 | #14 排程同日多筆只顯示一個圖示；#39 清單沒有編輯圖示；#68 刪除當天唯一時段後預設午餐仍留著；#103 第 5 步沒有證據檔上傳欄 |
| 未測 | 3 | 模板庫（不在此 build）；實際列印對話框／紙本（以 stub 代替）；Planned／Completed 狀態的按鈕矩陣（超出指定的 4 種狀態，只驗了狀態下拉選項） |
| 觀察（非錯誤） | 見下方 | 唯讀時沒有任何說明（6 個組合）、日期警告為英文、表格控制項為英文等 |

整體：清單頁、5 個步驟的所有按鈕、列印 3 種、Word 3 種、未儲存提示、狀態鎖定與權限（UI 與 API 雙層）皆如預期；兩個 FAIL 都在清單頁資料表，影響小。

## 重新執行

```bash
# 1) 重建並 seed 隔離環境（只用 3323/8323）
A=~/Documents/Qualitas-deploy-artifacts/AUDIT-BUTTON-TEST-2026-10-11
cd $A/cand/backend
ROOT=$(python3 -c "import json;print(json.load(open('$A/stack.json'))['root'])")
python3 scripts/verification/isolated_stack.py down --root $ROOT
python3 scripts/verification/isolated_stack.py up --port 8323 --vite-port 3323 \
  --vite-script ../react-app/tests-browser/zz-btntest-launcher-3323.mjs > $A/stack.json
NEW=$(python3 -c "import json;print(json.load(open('$A/stack.json'))['root'])")
for s in seed_audit_hardening_b_review.py seed_audit_export_docx_review.py seed_audit_agenda_review.py; do
  python3 scripts/verification/isolated_stack.py seed --root $NEW --script scripts/verification/$s
done
python3 scripts/verification/isolated_stack.py seed --root $NEW --script /tmp/claude-501/btntest/seed_btntest_extra.py
curl -s -o /dev/null http://127.0.0.1:3323/; sleep 6
# 2) 執行（腳本會拒絕非 3323/8323 或非剛 seed 的環境）
cd /Users/nook/Documents/Qualitas/react-app/tests-browser
node audit-all-buttons-check.mjs $A/stack.json /Users/nook/Documents/Qualitas/docs/workflow/AUDIT-BUTTON-TEST-2026-10-11-evidence
```

暫存 seed `/tmp/claude-501/btntest/seed_btntest_extra.py` 的內容（若 /tmp 被清掉，照此重建即可）：

```python
import json, os, sys
if not os.environ.get("DATABASE_URL"):
    sys.exit("refusing to seed: DATABASE_URL is not set")
sys.path.insert(0, os.getcwd())
import database, models
d = database.SessionLocal()
d.add(models.Contractor(id="btn-vendor-2", name="Second Vendor", abbreviation="SV", status="active"))
d.commit(); d.close()
print("SEED " + json.dumps({"ok": True}))
```

同一流程也寫成 `/tmp/claude-501/btntest/reset.sh`（暫存）。腳本會建立測試資料（Second Vendor 稽核 1 筆、無承包商的 filler 4 筆、待刪 Void 1 筆、UI 建立的 In Progress 1 筆、Void 即時鎖定 1 筆、audit_viewer 建立 1 筆），所以每次執行前都要重建。

## 檢查表

證據欄的路徑相對於 `docs/workflow/AUDIT-BUTTON-TEST-2026-10-11-evidence/`。「實際」欄為腳本記錄的原始值（過長者截斷，完整值見 `results.json`）。

### A. 清單頁（audit_full；audit_viewer 的清單檢查見 C 節）

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 1 | 清單 | 頁面載入 | 列出 7 筆種子稽核 | ["AHB-DRAFT-1","AHB-VOID-1","AHB-CLOSED-1","AHB-LEGACY-1","AHB-EXPORT-1","AHB-AGENDA-1","AHB-AGENDA-CLOSED-1"] | PASS | `shots/A01-list.png` |
| 2 | 工具列 | 搜尋框（編號） | 輸入 export 只剩 AHB-EXPORT-1 | ["AHB-EXPORT-1"] | PASS |  |
| 3 | 工具列 | 搜尋框（狀態） | 輸入 closed 只剩 2 筆 Closed | ["AHB-CLOSED-1","AHB-AGENDA-CLOSED-1"] | PASS |  |
| 4 | 工具列 | 搜尋框（稽核員） | 輸入 王稽核 列出稽核員為王稽核的 3 筆 | ["AHB-EXPORT-1","AHB-AGENDA-1","AHB-AGENDA-CLOSED-1"] | PASS |  |
| 5 | 工具列 | 搜尋框（無結果） | 無符合時顯示「沒有符合條件的資料」 | {"rows":[],"noData":1} | PASS | `shots/A02-search-empty.png` |
| 6 | 工具列 | 搜尋框（清空） | 清空後回到 7 筆 | 7 | PASS |  |
| 7 | 工具列 | 新增稽核 | 開啟空白精靈：第 1 步、編號空白、狀態 Draft、可選 Draft/Planned/In Progress/Completed | {"open":true,"docNo":"","title":"","step":1,"status":"Draft","options":["Draft","Planned","In Progress","Completed"]} | PASS | `shots/A03-add-wizard.png` |
| 8 | 精靈 | ✕ 關閉（新稽核、未修改） | 直接關閉、不出現未儲存提示 | {"open":false,"modal":0} | PASS |  |
| 9 | 排程月曆 | 上一月 ‹ | 月份由 2026年10月 變 2026年9月 | {"m0":"2026年10月","mPrev":"2026年9月"} | PASS |  |
| 10 | 排程月曆 | 今天 | 回到本月 2026年10月 | 2026年10月 | PASS |  |
| 11 | 排程月曆 | 下一月 › | 連按兩次：11月、12月 | {"mNext":"2026年11月","mNext2":"2026年12月"} | PASS |  |
| 12 | 排程月曆 | 9 月無稽核 | 9 月格內沒有稽核圖示 | 0 | PASS |  |
| 13 | 排程月曆 | 10 月排程列 | 只列有稽核的 Active 承包商（Review Vendor） | ["Review Vendor"] | PASS | `shots/A04-matrix.png` |
| 14 | 排程月曆 | 同日多筆稽核顯示 | 10/01 同一承包商有 7 筆稽核，應能看到／點到每一筆 | 10/01 格只顯示 1 個圖示：AHB-DRAFT-1: Draft in P1 | 待確認 | `shots/A04-matrix.png` |
| 15 | 排程月曆 | 點擊排程圖示 | 開啟該筆稽核（AHB-DRAFT-1） | AHB-DRAFT-1 | PASS | `shots/A05-matrix-open.png` |
| 16 | 承包商面板 | 面板內容 | 全部 13、Review Vendor 7、Second Vendor 1 | ["全部 13","Review Vendor 7","Second Vendor 1"] | PASS |  |
| 17 | 承包商面板 | 點 Second Vendor | 清單只剩該承包商 1 筆；排程只剩該承包商 | {"rows":["QTS-SV-AUDIT-000001"],"matrix":["Second Vendor"]} | PASS | `shots/A06-vendor-filter.png` |
| 18 | 承包商面板 | 再點一次 Second Vendor | 取消篩選，回到全部（第一頁 10 筆） | 10 | PASS |  |
| 19 | 承包商面板 | 點 Review Vendor | 只列 7 筆 Review Vendor | 7 | PASS |  |
| 20 | 承包商面板 | 點 全部 | 取消篩選 | 10 | PASS |  |
| 21 | 分頁 | 初始 | Page 1 of 2，10 筆 | {"page":"Page 1 of 2","rows":10} | PASS |  |
| 22 | 分頁 | 下一頁 › | Page 2 of 2，3 筆 | {"page":"Page 2 of 2","rows":3} | PASS | `shots/A07-page2.png` |
| 23 | 分頁 | 上一頁 ‹ | 回到 Page 1 | {"page":"Page 1 of 2"} | PASS |  |
| 24 | 分頁 | 最後一頁 » | Page 2 of 2 | {"page":"Page 2 of 2"} | PASS |  |
| 25 | 分頁 | 第一頁 « | Page 1，上一頁停用 | {"page":"Page 1 of 2","prevDisabled":true} | PASS |  |
| 26 | 分頁 | 每頁筆數 10→20 | Page 1 of 1，13 筆 | {"page":"Page 1 of 1","rows":13} | PASS |  |
| 27 | 資料表 | View（欄位清單） | 列出可隱藏欄位 | ["AuditNo","Title","Date","Contractor","Location","Auditor","Status"] | PASS |  |
| 28 | 資料表 | View 取消勾選 location | 「地點」欄隱藏 | ["#","稽核編號","主旨","日期","承包商","稽核員","狀態","操作"] | PASS | `shots/A08-view-hide-location.png` |
| 29 | 資料表 | View 重新勾選 location | 「地點」欄恢復 | ["#","稽核編號","主旨","日期","承包商","地點","稽核員","狀態","操作"] | PASS |  |
| 30 | 資料表 | 欄標題選單（稽核編號） | 出現 Sort Asc / Sort Desc / Hide Column / Filter | Sort Asc Sort Desc Hide Column Filter | PASS |  |
| 31 | 資料表 | Sort Desc | 依編號遞減 | ["QTS-SV-AUDIT-000001","QTS-NA-AUDIT-000005","QTS-NA-AUDIT-000004"] | PASS |  |
| 32 | 資料表 | Sort Asc | 依編號遞增 | ["AHB-AGENDA-1","AHB-AGENDA-CLOSED-1","AHB-CLOSED-1"] | PASS |  |
| 33 | 資料表 | 狀態欄 Filter = Closed | 只剩 2 筆 Closed | ["AHB-AGENDA-CLOSED-1","AHB-CLOSED-1"] | PASS | `shots/A09-status-filter.png` |
| 34 | 資料表 | 狀態欄 Filter = All | 回到全部 | 13 | PASS |  |
| 35 | 資料表 | 主旨欄 Filter 文字 | 輸入 Agenda 只剩 2 筆 | ["AHB-AGENDA-1","AHB-AGENDA-CLOSED-1"] | PASS |  |
| 36 | 資料表 | 承包商欄 Filter = Second Vendor | 只剩 Second Vendor 的 1 筆 | ["QTS-NA-AUDIT-000001","QTS-NA-AUDIT-000002","QTS-NA-AUDIT-000003","QTS-NA-AUDIT-000004","QTS-NA-AUDIT-000005","QTS-SV-AUDIT-000001"] | **FAIL** | `shots/A09b-contractor-filter.png` |
| 37 | 資料表 | Hide Column（稽核員） | 「稽核員」欄隱藏，可由 View 恢復 | ["#","稽核編號","主旨","日期","承包商","地點","狀態","操作"] | PASS |  |
| 38 | 資料表 | 點擊整列 | 開啟該筆稽核精靈 | AHB-DRAFT-1 | PASS | `shots/A10-row-open.png` |
| 39 | 資料表 | 編輯圖示 | （任務提到「edit icon」） | 操作欄只有刪除鈕（每列 1 個按鈕），沒有編輯圖示；開啟只能點整列 | 待確認 |  |
| 40 | 資料表 | 刪除鈕（非 Void 列） | 停用，提示「請先將此稽核作廢，才能刪除」 | {"disabled":true,"title":"請先將此稽核作廢，才能刪除"} | PASS |  |
| 41 | 資料表 | 點停用的刪除鈕 | 不刪除、不開啟精靈 | {"wizardOpened":true,"modal":0} | **FAIL** | `shots/A11-disabled-trash-opens.png` |
| 42 | 資料表 | 刪除鈕（Void 列） | 可按，提示「刪除」 | {"disabled":false,"title":"刪除"} | PASS |  |
| 43 | 資料表 | 刪除鈕 → 確認視窗 | 出現 ConfirmModal「確認刪除／您確定要刪除此稽核嗎？」，不開啟精靈 | {"modal":1,"text":"確認刪除 × 您確定要刪除此稽核嗎？ 取消 刪除","wizard":false} | PASS | `shots/A12-delete-confirm.png` |
| 44 | 資料表 | 確認視窗「取消」 | 視窗關閉、資料仍在 | {"modal":0,"row":1} | PASS |  |
| 45 | 資料表 | 確認視窗「×」 | 視窗關閉、資料仍在 | {"modal":0,"row":1} | PASS |  |
| 46 | 資料表 | 確認視窗「刪除」 | 列消失、API 回 404 | {"row":0,"api":404} | PASS | `shots/A13-deleted.png` |
| 47 | API | DELETE 非 Void（audit_full） | 後端拒絕（400），資料保留 | {"status":400,"detail":"Cannot delete Audit 'AHB-DRAFT-1' with status 'Draft'. Please Void the Audit first, then delete."} | PASS |  |

### B1. 精靈第 1 步（專案資訊）

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 48 | 第1步 | 上一步 | 第 1 步不顯示上一步 | 0 | PASS |  |
| 49 | 第1步 | 結束日早於開始日 | 跳出日期順序警告 toast | {"warned":true,"text":"稽核結束日 (2026-10-20) is before 稽核開始日 (2026-10-21)"} | PASS | `shots/B01-date-warning.png` |
| 50 | 第1步 | 狀態下拉（新稽核） | 可選 In Progress | In Progress | PASS |  |
| 51 | 第1步 | 狀態下拉（Draft 既有稽核） | 只列 Draft / Planned / Void（工作流程允許的） | ["Draft","Planned","Void"] | PASS |  |
| 52 | 第1步 | 狀態改 Void + 儲存草稿 | 存成 Void 後精靈立即鎖定（欄位停用、儲存草稿與完成鈕消失） | {"titleDisabled":true,"saveDraft":0,"status":"Void","submit":0} | PASS | `shots/B15-void-live-lock.png` |
| 53 | 第1步 | 專案下拉（舊資料只有專案名稱） | 自動對應到 AHB-P1 | AHB-P1 | PASS |  |

### B2. 精靈導覽（上一步／下一步／步驟列）

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 54 | 導覽 | 下一步 | 第 1→2 步（人員與範圍） | {"step":2,"h":"人員與範圍"} | PASS |  |
| 55 | 導覽 | 上一步 | 回第 1 步，已填資料保留 | {"step":1,"title":"BTN 進行中稽核"} | PASS |  |
| 56 | 導覽 | 步驟列點第 4 步 | 直接跳到「配置查檢表」 | {"step":4,"h":"配置查檢表"} | PASS |  |
| 57 | 導覽 | 步驟列點第 5 步 | 第 5 步無「下一步」，顯示「完成並建立計畫」 | {"step":5,"next":0,"submit":1} | PASS | `shots/B02-step5-footer.png` |
| 58 | 導覽 | 步驟列點第 1 步 | 回第 1 步，資料保留 | {"step":1,"title":"BTN 進行中稽核"} | PASS |  |

### B3. 精靈第 2 步（人員與範圍）

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 59 | 第2步 | 人員／範圍欄位輸入 | 7 個欄位皆可輸入 | true | PASS | `shots/B03-step2.png` |

### B4. 精靈第 3 步（稽核計畫 Agenda、列印計畫、Word 計畫）

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 60 | 第3步 | 空白議程 | 顯示「尚未安排行程…」 | 1 | PASS |  |
| 61 | 第3步 | 列印稽核計畫（未儲存的新稽核） | 呼叫列印一次、列印內容為 plan | {"calls":1,"kind":"plan"} | PASS |  |
| 62 | 第3步 | 匯出 Word（未儲存） | 新稽核首次儲存前不顯示 Word 鈕 | 0 | PASS |  |
| 63 | 第3步 | 新增一列（新的一天） | 新增 2026-10-21 時段 + 灰底 12:00–13:00 Lunch Time；稽核員預設王稽核 | [{"kind":"session","date":"2026-10-21","start":"","end":"","item":"","auditor":"王稽核","bg":"rgba(0, 0, 0, 0)"},{"kind":"lunch","date":"2026-10-21","start":"12:00","end":"13:00","item":"Lunch Time","auditor":"","bg":"oklch(0.968 0.0… | PASS | `shots/B04-agenda-lunch.png` |
| 64 | 第3步 | 新增一列（同一天） | 接續 10/21、從 13:00 開始，不再加午餐 | [{"kind":"session","date":"2026-10-21","start":"09:00","end":"10:00","item":"文件審查","auditor":"王稽核","bg":"rgba(0, 0, 0, 0)"},{"kind":"lunch","date":"2026-10-21","start":"12:00","end":"13:00","item":"Lunch Time","auditor":"","bg":"o… | PASS |  |
| 65 | 第3步 | 結束早於開始 + 儲存草稿 | 顯示紅字提示，儲存被擋（toast，無 POST） | {"notice":1,"toast":true,"posts":0} | PASS | `shots/B05-agenda-timeorder.png` |
| 66 | 第3步 | 刪除列（垃圾桶） | 該列移除 | 2 | PASS |  |
| 67 | 第3步 | 日期改到期間外（10/25） | 黃色提示「部分日期不在稽核期間」，10/25 自動加午餐 | {"outside":1,"lunches":["2026-10-21","2026-10-25"]} | PASS | `shots/B06-agenda-outside.png` |
| 68 | 第3步 | 刪除當天唯一時段 | （設計未明）當天未修改的預設午餐是否一併移除 | 刪除 10/25 唯一時段後，10/25 的預設午餐仍留在議程 | 待確認 |  |
| 69 | 第3步 | 刪除午餐列 | 午餐列可刪除 | 2 | PASS |  |
| 70 | 第3步 | 列印稽核計畫 | 列印一次、kind=plan、內容含編號與議程 | {"calls":1,"kind":"plan","hasNo":true,"hasItem":true} | PASS |  |
| 71 | 第3步 | 匯出 Word（計畫） | 下載 QTS-RV-AUDIT-000001-Plan.docx（docx、標題 內部稽核計畫） | {"file":"QTS-RV-AUDIT-000001-Plan.docx","kind":"plan","zip":true,"title":true,"hasItem":true} | PASS | `downloads/QTS-RV-AUDIT-000001-Plan.docx` |

### B5. 精靈第 4 步（模板、自訂查檢項、列印查檢表、Word 查檢表）

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 72 | 第4步 | 模板選項 | 固定 4 個：ISO 9001:2015 / ISO 45001 / 品質管理程序書 / 供應商評鑑表 | ["ISO 9001:2015","ISO 45001","品質管理程序書","供應商評鑑表"] | PASS |  |
| 73 | 第4步 | 模板 chip 點選 | 4 個皆可選取（變色） | [true,true,true,true] | PASS |  |
| 74 | 第4步 | 模板 chip 再點取消 | ISO 45001 取消選取，其餘保留 | [true,false,true,true] | PASS | `shots/B08-templates.png` |
| 75 | 第4步 | ISO 條文下拉選 7.2 | 自動帶入條文與查檢問題 | {"clause":"Competence","task":"How do you determine the necessary competence of person(s) doing work under your control?"} | PASS |  |
| 76 | 第4步 | 新增（+） | 新增 1 筆、輸入欄清空 | {"items":1,"task":""} | PASS |  |
| 77 | 第4步 | 查檢問題欄按 Enter | 等同新增 | 2 | PASS |  |
| 78 | 第4步 | 自訂條文 → ✕ | 自訂編號欄出現；按 ✕ 回到下拉、欄位清空 | {"customShown":1,"select":true,"clause":"","task":""} | PASS |  |
| 79 | 第4步 | 自訂條文新增 | 新增編號 C-1 的項目 | 3 條文編號 CLAUSE NO. C-1 CLAUSE DESCRIPTION 現場安全 AUDIT QUESTION 是否配戴安全帽？ | PASS | `shots/B09-custom-items.png` |
| 80 | 第4步 | 空白時按 + | 不新增 | 3 | PASS |  |
| 81 | 第4步 | 編輯（筆）→ 儲存 | 項目內容更新 | 1 條文編號 CLAUSE NO. 7.2 CLAUSE DESCRIPTION Competence AUDIT QUESTION 人員資格是否有紀錄？（已修改） | PASS |  |
| 82 | 第4步 | 編輯 → 取消 | 內容不變 | 1 條文編號 CLAUSE NO. 7.2 CLAUSE DESCRIPTION Competence AUDIT QUESTION 人員資格是否有紀錄？（已修改） | PASS |  |
| 83 | 第4步 | 編輯自訂條文項目 | 編輯列顯示自訂編號輸入框（C-1） | C-1 | PASS |  |
| 84 | 第4步 | 編輯中改 ISO 條文下拉 | 改為 9.1 並帶入條文 | 2 條文編號 CLAUSE NO. 9.1 CLAUSE DESCRIPTION Monitoring, measurement, analysis and evaluation AUDIT QUESTION How do you determine what needs to be monitored and measured? | PASS |  |
| 85 | 第4步 | 刪除項目（垃圾桶） | 項目移除 | {"before":4,"after":3} | PASS |  |
| 86 | 第4步 | 未按新增就儲存草稿 | toast 提醒、不送出 | {"toast":true,"POST":0,"PUT":0,"DELETE":0,"docx":0} | PASS |  |
| 87 | 第4步 | 編輯中就儲存草稿 | toast 提醒、不送出 | {"toast":true,"POST":0,"PUT":0,"DELETE":0,"docx":0} | PASS |  |
| 88 | 第4步 | 有未儲存修改時按匯出 Word | toast 要求先儲存、不下載 | {"toast":true,"docx":0} | PASS | `shots/B10-export-save-first.png` |
| 89 | 第4步 | 儲存草稿 | 模板 3 個、查檢項 3 筆（7.2 / 9.1 / C-1）已儲存 | {"put":1,"templates":["ISO 9001:2015","品質管理程序書","供應商評鑑表"],"nos":["7.2","9.1","C-1"]} | PASS |  |
| 90 | 第4步 | 列印查檢表 | 列印一次、kind=checklist、含查檢項 | {"calls":1,"kind":"checklist","hasItem":true} | PASS |  |
| 91 | 第4步 | 匯出 Word（查檢表） | 下載 QTS-RV-AUDIT-000001-Checklist.docx（docx、標題 稽核查檢表） | {"file":"QTS-RV-AUDIT-000001-Checklist.docx","kind":"checklist","zip":true,"title":true,"hasItem":true} | PASS | `downloads/QTS-RV-AUDIT-000001-Checklist.docx` |

### B6. 精靈第 5 步（Pass／Fail／!、篩選、搜尋、備註、列印報告、Word 報告）

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 92 | 第5步 | 統計卡 | 總數 3、進度 0%、符合 0、不符合 0 | ["3","0%","0","0"] | PASS |  |
| 93 | 第5步 | 未評估項目預設 | 預設亮起「!」（待改善） | true | PASS |  |
| 94 | 第5步 | Pass ✓ 按鈕 | 第 1 列變綠色符合 | true | PASS |  |
| 95 | 第5步 | Fail ✕ 按鈕 | 第 2 列變紅色不符合 | true | PASS |  |
| 96 | 第5步 | Warning ! 按鈕 | 第 3 列由符合切回「!」 | {"warn":true,"passOff":true} | PASS |  |
| 97 | 第5步 | 統計即時更新 | 符合 1、不符合 1、進度 67% | ["3","67%","1","1"] | PASS |  |
| 98 | 第5步 | 更新日期欄 | 改狀態後記錄今天 2026-10-11 | 2026-10-11 | PASS | `shots/B11-step5-status.png` |
| 99 | 第5步 | 分類篩選 chip | 有 全部 / 7.2 / 9.1 / C-1；點 9.1 剩 1 列，點 全部 回 3 列 | {"chipTexts":["全部","7.2","9.1","C-1"],"c1":1,"c2":3} | PASS |  |
| 100 | 第5步 | 搜尋框 | 輸入 Competence 剩 1 列 | 1 | PASS |  |
| 101 | 第5步 | 搜尋框按 Enter | 不送出表單、精靈不關閉 | {"stillOpen":true,"POST":0,"PUT":0,"DELETE":0,"docx":0} | PASS |  |
| 102 | 第5步 | 無結果 → 重設過濾條件 | 顯示「找不到符合條件的項目」；重設後搜尋清空、回 3 列 | {"none":1,"search":"","rows":3} | PASS | `shots/B12-step5-noresults.png` |
| 103 | 第5步 | 證據／附件輸入 | （任務：有則測） | 第 5 步沒有任何檔案／證據上傳欄（input[type=file] = 0），只有備註與稽核發現文字欄 | 待確認 |  |
| 104 | 第5步 | 列印報告 | 列印一次、kind=report、含備註與稽核發現（未儲存內容也印出） | {"calls":1,"kind":"report","note":true,"findings":true} | PASS |  |
| 105 | 第5步 | 匯出 Word（報告） | 下載 QTS-RV-AUDIT-000001.docx（docx、標題 內部稽核報告、含備註與發現） | {"file":"QTS-RV-AUDIT-000001.docx","kind":"report","zip":true,"title":true,"note":true,"findings":true} | PASS | `downloads/QTS-RV-AUDIT-000001.docx` |

### B7. 頁尾：儲存草稿、完成並建立計畫

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 106 | 頁尾 | 儲存草稿（新稽核首次） | POST 1 次、產生編號、顯示「進度已於…」、Word 鈕出現；狀態 In Progress、議程 2 列 | {"posts":1,"newNo":"QTS-RV-AUDIT-000001","msg":1,"word":1,"status":"In Progress","agenda":2} | PASS | `shots/B07-saved-draft.png` |
| 107 | 頁尾 | 儲存草稿（第二次） | PUT 1 次、不再 POST（不產生重複稽核） | {"POST":0,"PUT":1,"DELETE":0,"docx":0} | PASS |  |
| 108 | 頁尾 | 完成並建立計畫（第 5 步） | PUT 儲存並關閉精靈；狀態維持 In Progress；評估結果、備註、發現已存 | {"put":1,"closed":true,"status":"In Progress","statuses":["pass","fail","pending"],"notes":["Remark A 人員資格表已備","兩份資格證明過期",""],"findings":"整體符合，一項待改善。","listStatus":"In Progress"} | PASS | `shots/B13-after-submit.png` |

### B8. ✕ 關閉與未儲存提示

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 109 | 精靈 | ✕ 關閉（既有稽核、未修改） | 直接關閉、無提示 | {"open":false,"modal":0} | PASS |  |
| 110 | 精靈 | ✕ 關閉（有未儲存修改） | 出現「未儲存的變更」視窗，按鈕「留下並儲存」／「離開」 | {"modal":1,"text":"未儲存的變更 × 確定離開嗎？尚未保存的編輯將遺失，已保存到伺服器的內容仍會保留。 留下並儲存 離開"} | PASS | `shots/B14-unsaved-modal.png` |
| 111 | 精靈 | 未儲存視窗「留下並儲存」 | 視窗關閉、精靈保留修改內容 | {"open":true,"modal":0,"title":"BTN 進行中稽核（未儲存）"} | PASS |  |
| 112 | 精靈 | 未儲存視窗「離開」 | 精靈關閉、修改未存（標題不變） | {"open":false,"title":"BTN 進行中稽核"} | PASS |  |
| 113 | 精靈 | ✕ 關閉（第 4 步有未新增的查檢項） | 同樣出現未儲存提示 | 1 | PASS |  |
| 114 | 精靈 | ✕ 關閉（以 ?openId= 深連結開啟） | 開啟 AHB-DRAFT-1；關閉後回到前一頁（/） | {"opened":"AHB-DRAFT-1","url":"/"} | PASS |  |
| 115 | 精靈 | ✕ 關閉（剛鎖定的稽核） | 直接關閉、無提示 | {"open":false,"modal":0} | PASS |  |

### C. 狀態與權限（Draft／In Progress／Closed／Void × audit_full／audit_viewer，另含 audit_multi 與 API 防線）

| # | 位置 | 按鈕／檢查 | 預期 | 實際 | 結果 | 證據 |
|---|---|---|---|---|---|---|
| 116 | audit_full／Draft（AHB-DRAFT-1） | 編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現） | 全部可用 | {"step1":{"title":false,"project":false,"status":false,"startDate":false,"statusOptions":["Draft","Planned","Void"]},"step2AllDisabled":false,"step3":{"addRow":true,"rowDelete":0,"rows":0,"inputsDisabled":true},"step4":{"chipDisab… | PASS | `shots/C-audit_full-Draft-step4.png` |
| 117 | audit_full／Draft（AHB-DRAFT-1） | 儲存草稿／完成並建立計畫 | 顯示 | {"saveDraft":1,"submit":1} | PASS |  |
| 118 | audit_full／Draft（AHB-DRAFT-1） | 下一步／上一步／步驟列 | 唯讀時仍可瀏覽各步 | {"back1":0,"next1":1,"afterNext":2,"afterBack":1,"next5":0} | PASS |  |
| 119 | audit_full／Draft（AHB-DRAFT-1） | 列印（第 3/4/5 步）＋匯出 Word | 三步皆有列印與 Word | [1,1,1,1,1,1] | PASS | `shots/C-audit_full-Draft-step5.png` |
| 120 | audit_full／Draft（AHB-DRAFT-1） | 第 5 步分類篩選／搜尋 | 仍可使用（只是瀏覽） | {"chipDisabled":false,"searchDisabled":false} | PASS |  |
| 121 | audit_full／Draft（AHB-DRAFT-1） | 狀態下拉選項 | Draft / Planned / Void | ["Draft","Planned","Void"] | PASS |  |
| 122 | audit_full／In Progress（AHB-EXPORT-1） | 編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現） | 全部可用 | {"step1":{"title":false,"project":false,"status":false,"startDate":false,"statusOptions":["In Progress","Completed","Void"]},"step2AllDisabled":false,"step3":{"addRow":true,"rowDelete":0,"rows":0,"inputsDisabled":true},"step4":{"c… | PASS | `shots/C-audit_full-InProgress-step4.png` |
| 123 | audit_full／In Progress（AHB-EXPORT-1） | 儲存草稿／完成並建立計畫 | 顯示 | {"saveDraft":1,"submit":1} | PASS |  |
| 124 | audit_full／In Progress（AHB-EXPORT-1） | 下一步／上一步／步驟列 | 唯讀時仍可瀏覽各步 | {"back1":0,"next1":1,"afterNext":2,"afterBack":1,"next5":0} | PASS |  |
| 125 | audit_full／In Progress（AHB-EXPORT-1） | 列印（第 3/4/5 步）＋匯出 Word | 三步皆有列印與 Word | [1,1,1,1,1,1] | PASS | `shots/C-audit_full-InProgress-step5.png` |
| 126 | audit_full／In Progress（AHB-EXPORT-1） | 第 5 步分類篩選／搜尋 | 仍可使用（只是瀏覽） | {"chipDisabled":false,"searchDisabled":false} | PASS |  |
| 127 | audit_full／In Progress（AHB-EXPORT-1） | 狀態下拉選項 | In Progress / Completed / Void | ["In Progress","Completed","Void"] | PASS |  |
| 128 | audit_full／Closed（AHB-CLOSED-1） | 編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現） | 全部停用／隱藏（唯讀） | {"step1":{"title":true,"project":true,"status":true,"startDate":true,"statusOptions":["Closed"]},"step2AllDisabled":true,"step3":{"addRow":false,"rowDelete":0,"rows":0,"inputsDisabled":true},"step4":{"chipDisabled":true,"taskDisab… | PASS | `shots/C-audit_full-Closed-step4.png` |
| 129 | audit_full／Closed（AHB-CLOSED-1） | 儲存草稿／完成並建立計畫 | 隱藏 | {"saveDraft":0,"submit":0} | PASS |  |
| 130 | audit_full／Closed（AHB-CLOSED-1） | 下一步／上一步／步驟列 | 唯讀時仍可瀏覽各步 | {"back1":0,"next1":1,"afterNext":2,"afterBack":1,"next5":0} | PASS |  |
| 131 | audit_full／Closed（AHB-CLOSED-1） | 列印（第 3/4/5 步）＋匯出 Word | 三步皆有列印與 Word | [1,1,1,1,1,1] | PASS | `shots/C-audit_full-Closed-step5.png` |
| 132 | audit_full／Closed（AHB-CLOSED-1） | 第 5 步分類篩選／搜尋 | 仍可使用（只是瀏覽） | {"chipDisabled":false,"searchDisabled":false} | PASS |  |
| 133 | audit_full／Closed（AHB-CLOSED-1） | 點擊鎖定中的 Fail ✕ | 沒有反應（狀態不變） | 無變化 | PASS |  |
| 134 | audit_full／Closed（AHB-CLOSED-1） | 列印報告＋匯出 Word（唯讀） | 列印 kind=report；下載 AHB-CLOSED-1.docx | {"print":"report","calls":1,"file":"AHB-CLOSED-1.docx","zip":true} | PASS | `downloads/AHB-CLOSED-1.docx` |
| 135 | audit_full／Void（AHB-VOID-1） | 編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現） | 全部停用／隱藏（唯讀） | {"step1":{"title":true,"project":true,"status":true,"startDate":true,"statusOptions":["Void"]},"step2AllDisabled":true,"step3":{"addRow":false,"rowDelete":0,"rows":0,"inputsDisabled":true},"step4":{"chipDisabled":true,"taskDisable… | PASS | `shots/C-audit_full-Void-step4.png` |
| 136 | audit_full／Void（AHB-VOID-1） | 儲存草稿／完成並建立計畫 | 隱藏 | {"saveDraft":0,"submit":0} | PASS |  |
| 137 | audit_full／Void（AHB-VOID-1） | 下一步／上一步／步驟列 | 唯讀時仍可瀏覽各步 | {"back1":0,"next1":1,"afterNext":2,"afterBack":1,"next5":0} | PASS |  |
| 138 | audit_full／Void（AHB-VOID-1） | 列印（第 3/4/5 步）＋匯出 Word | 三步皆有列印與 Word | [1,1,1,1,1,1] | PASS | `shots/C-audit_full-Void-step5.png` |
| 139 | audit_full／Void（AHB-VOID-1） | 第 5 步分類篩選／搜尋 | 仍可使用（只是瀏覽） | {"chipDisabled":false,"searchDisabled":false} | PASS |  |
| 140 | audit_full／Void（AHB-VOID-1） | 點擊鎖定中的 Fail ✕ | 沒有反應（狀態不變） | 無變化 | PASS |  |
| 141 | audit_full／Void（AHB-VOID-1） | 列印報告＋匯出 Word（唯讀） | 列印 kind=report；下載 AHB-VOID-1.docx | {"print":"report","calls":1,"file":"AHB-VOID-1.docx","zip":true} | PASS | `downloads/AHB-VOID-1.docx` |
| 142 | audit_full／API | PUT Closed 稽核（改標題） | 後端拒絕（400），資料不變 | {"status":400,"detail":"Cannot modify Audit 'AHB-CLOSED-1' with status 'Closed' — no fields can be changed once an audit is closed or void."} | PASS |  |
| 143 | audit_full／API | DELETE Closed 稽核 | 後端拒絕（400） | 400 | PASS |  |
| 144 | audit_viewer／Draft（AHB-DRAFT-1） | 編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現） | 全部停用／隱藏（唯讀） | {"step1":{"title":true,"project":true,"status":true,"startDate":true,"statusOptions":["Draft","Planned","Void"]},"step2AllDisabled":true,"step3":{"addRow":false,"rowDelete":0,"rows":0,"inputsDisabled":true},"step4":{"chipDisabled"… | PASS | `shots/C-audit_viewer-Draft-step4.png` |
| 145 | audit_viewer／Draft（AHB-DRAFT-1） | 儲存草稿／完成並建立計畫 | 隱藏 | {"saveDraft":0,"submit":0} | PASS |  |
| 146 | audit_viewer／Draft（AHB-DRAFT-1） | 下一步／上一步／步驟列 | 唯讀時仍可瀏覽各步 | {"back1":0,"next1":1,"afterNext":2,"afterBack":1,"next5":0} | PASS |  |
| 147 | audit_viewer／Draft（AHB-DRAFT-1） | 列印（第 3/4/5 步）＋匯出 Word | 三步皆有列印與 Word | [1,1,1,1,1,1] | PASS | `shots/C-audit_viewer-Draft-step5.png` |
| 148 | audit_viewer／Draft（AHB-DRAFT-1） | 第 5 步分類篩選／搜尋 | 仍可使用（只是瀏覽） | {"chipDisabled":false,"searchDisabled":false} | PASS |  |
| 149 | audit_viewer／Draft（AHB-DRAFT-1） | 點擊鎖定中的 Fail ✕ | 沒有反應（狀態不變） | 無變化 | PASS |  |
| 150 | audit_viewer／Draft（AHB-DRAFT-1） | 列印報告＋匯出 Word（唯讀） | 列印 kind=report；下載 AHB-DRAFT-1.docx | {"print":"report","calls":1,"file":"AHB-DRAFT-1.docx","zip":true} | PASS | `downloads/AHB-DRAFT-1.docx` |
| 151 | audit_viewer／In Progress（AHB-EXPORT-1） | 編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現） | 全部停用／隱藏（唯讀） | {"step1":{"title":true,"project":true,"status":true,"startDate":true,"statusOptions":["In Progress","Completed","Void"]},"step2AllDisabled":true,"step3":{"addRow":false,"rowDelete":0,"rows":0,"inputsDisabled":true},"step4":{"chipD… | PASS | `shots/C-audit_viewer-InProgress-step4.png` |
| 152 | audit_viewer／In Progress（AHB-EXPORT-1） | 儲存草稿／完成並建立計畫 | 隱藏 | {"saveDraft":0,"submit":0} | PASS |  |
| 153 | audit_viewer／In Progress（AHB-EXPORT-1） | 下一步／上一步／步驟列 | 唯讀時仍可瀏覽各步 | {"back1":0,"next1":1,"afterNext":2,"afterBack":1,"next5":0} | PASS |  |
| 154 | audit_viewer／In Progress（AHB-EXPORT-1） | 列印（第 3/4/5 步）＋匯出 Word | 三步皆有列印與 Word | [1,1,1,1,1,1] | PASS | `shots/C-audit_viewer-InProgress-step5.png` |
| 155 | audit_viewer／In Progress（AHB-EXPORT-1） | 第 5 步分類篩選／搜尋 | 仍可使用（只是瀏覽） | {"chipDisabled":false,"searchDisabled":false} | PASS |  |
| 156 | audit_viewer／In Progress（AHB-EXPORT-1） | 點擊鎖定中的 Fail ✕ | 沒有反應（狀態不變） | 無變化 | PASS |  |
| 157 | audit_viewer／In Progress（AHB-EXPORT-1） | 列印報告＋匯出 Word（唯讀） | 列印 kind=report；下載 AHB-EXPORT-1.docx | {"print":"report","calls":1,"file":"AHB-EXPORT-1.docx","zip":true} | PASS | `downloads/AHB-EXPORT-1.docx` |
| 158 | audit_viewer／Closed（AHB-CLOSED-1） | 編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現） | 全部停用／隱藏（唯讀） | {"step1":{"title":true,"project":true,"status":true,"startDate":true,"statusOptions":["Closed"]},"step2AllDisabled":true,"step3":{"addRow":false,"rowDelete":0,"rows":0,"inputsDisabled":true},"step4":{"chipDisabled":true,"taskDisab… | PASS | `shots/C-audit_viewer-Closed-step4.png` |
| 159 | audit_viewer／Closed（AHB-CLOSED-1） | 儲存草稿／完成並建立計畫 | 隱藏 | {"saveDraft":0,"submit":0} | PASS |  |
| 160 | audit_viewer／Closed（AHB-CLOSED-1） | 下一步／上一步／步驟列 | 唯讀時仍可瀏覽各步 | {"back1":0,"next1":1,"afterNext":2,"afterBack":1,"next5":0} | PASS |  |
| 161 | audit_viewer／Closed（AHB-CLOSED-1） | 列印（第 3/4/5 步）＋匯出 Word | 三步皆有列印與 Word | [1,1,1,1,1,1] | PASS | `shots/C-audit_viewer-Closed-step5.png` |
| 162 | audit_viewer／Closed（AHB-CLOSED-1） | 第 5 步分類篩選／搜尋 | 仍可使用（只是瀏覽） | {"chipDisabled":false,"searchDisabled":false} | PASS |  |
| 163 | audit_viewer／Closed（AHB-CLOSED-1） | 點擊鎖定中的 Fail ✕ | 沒有反應（狀態不變） | 無變化 | PASS |  |
| 164 | audit_viewer／Closed（AHB-CLOSED-1） | 列印報告＋匯出 Word（唯讀） | 列印 kind=report；下載 AHB-CLOSED-1.docx | {"print":"report","calls":1,"file":"AHB-CLOSED-1.docx","zip":true} | PASS | `downloads/AHB-CLOSED-1.docx` |
| 165 | audit_viewer／Void（AHB-VOID-1） | 編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現） | 全部停用／隱藏（唯讀） | {"step1":{"title":true,"project":true,"status":true,"startDate":true,"statusOptions":["Void"]},"step2AllDisabled":true,"step3":{"addRow":false,"rowDelete":0,"rows":0,"inputsDisabled":true},"step4":{"chipDisabled":true,"taskDisable… | PASS | `shots/C-audit_viewer-Void-step4.png` |
| 166 | audit_viewer／Void（AHB-VOID-1） | 儲存草稿／完成並建立計畫 | 隱藏 | {"saveDraft":0,"submit":0} | PASS |  |
| 167 | audit_viewer／Void（AHB-VOID-1） | 下一步／上一步／步驟列 | 唯讀時仍可瀏覽各步 | {"back1":0,"next1":1,"afterNext":2,"afterBack":1,"next5":0} | PASS |  |
| 168 | audit_viewer／Void（AHB-VOID-1） | 列印（第 3/4/5 步）＋匯出 Word | 三步皆有列印與 Word | [1,1,1,1,1,1] | PASS | `shots/C-audit_viewer-Void-step5.png` |
| 169 | audit_viewer／Void（AHB-VOID-1） | 第 5 步分類篩選／搜尋 | 仍可使用（只是瀏覽） | {"chipDisabled":false,"searchDisabled":false} | PASS |  |
| 170 | audit_viewer／Void（AHB-VOID-1） | 點擊鎖定中的 Fail ✕ | 沒有反應（狀態不變） | 無變化 | PASS |  |
| 171 | audit_viewer／Void（AHB-VOID-1） | 列印報告＋匯出 Word（唯讀） | 列印 kind=report；下載 AHB-VOID-1.docx | {"print":"report","calls":1,"file":"AHB-VOID-1.docx","zip":true} | PASS | `downloads/AHB-VOID-1.docx` |
| 172 | audit_viewer／清單 | 新增稽核 | 有建立權限 → 顯示 | 1 | PASS |  |
| 173 | audit_viewer／清單 | 刪除鈕（含 Void 列） | 全部停用，提示「您沒有刪除稽核的權限」 | {"all":10,"disabled":10,"voidTitle":"您沒有刪除稽核的權限"} | PASS | `shots/C-viewer-list.png` |
| 174 | audit_viewer／API | DELETE Void 稽核 | 403 | 403 | PASS |  |
| 175 | audit_viewer／API | PUT 既有稽核 | 403 | 403 | PASS |  |
| 176 | audit_viewer／新稽核 | 新稽核可編輯 | 欄位可填、顯示儲存草稿 | true | PASS |  |
| 177 | audit_viewer／新稽核 | 儲存草稿（首次建立） | 建立成功（POST 1 次、有編號），之後轉唯讀並顯示黃色說明、儲存草稿消失 | {"posts":1,"docNo":"QTS-NA-AUDIT-000007","notice":1,"saveDraft":0,"titleDisabled":true} | PASS | `shots/C-viewer-created.png` |
| 178 | audit_viewer／新稽核 | ✕ 關閉 | 直接關閉、無提示 | {"open":false,"modal":0} | PASS |  |
| 179 | audit_multi（限 2 專案） | 清單＋開啟 Draft | 看得到 P1/P2 的稽核（不含無專案的舊資料）；Draft 可編輯 | {"rows":14,"legacy":false,"editable":true} | PASS | `shots/C-multi-draft.png` |
## FAIL 重現步驟

### FAIL 1（#36）承包商欄篩選會把「沒有承包商」的稽核也列進來

- 帳號：`audit_full`（任何能看清單的帳號皆同）
- 資料：至少一筆有承包商「Second Vendor」的稽核（`QTS-SV-AUDIT-000001`），以及幾筆沒有選承包商的稽核（`QTS-NA-AUDIT-000001`～`000005`；用「新增稽核」不選承包商、按儲存草稿即可產生）
- 步驟：
  1. 進入「稽核」清單頁。
  2. 點資料表標題「承包商」→ 彈出選單的 Filter 下拉 → 選「Second Vendor」。
- 預期：只剩承包商為 Second Vendor 的 1 筆。
- 實際：6 筆——Second Vendor 那 1 筆，加上 5 筆承包商欄顯示「-」的稽核。
- 截圖：`shots/A09b-contractor-filter.png`
- 讀碼推測（僅供參考，未修改）：`react-app/src/components/Audit/columns.tsx` 承包商欄的 `filterFn` 是 `value.includes(row.getValue(id))`，`value` 是選到的字串，所以 `"Second Vendor".includes("")` 為真（空白承包商永遠符合），也會做子字串比對（例如名稱為 "Vendor" 的承包商在篩 "Second Vendor" 時也會出現）。狀態欄用同樣寫法，因狀態不會是空字串，實務上沒有出現問題。左側「承包商」面板的篩選（#16–#20）用的是完全相等比對，正常。

### FAIL 2（#41）點擊停用（灰色）的刪除鈕會開啟該筆稽核

- 帳號：`audit_full`（`audit_viewer` 在任何一列都一樣，因為他所有刪除鈕都是停用的）
- 稽核：`AHB-DRAFT-1`（Draft；任何非 Void 的列皆可）
- 步驟：
  1. 進入「稽核」清單頁。
  2. 在 AHB-DRAFT-1 那一列，點「操作」欄的灰色垃圾桶（提示文字「請先將此稽核作廢，才能刪除」）。
- 預期：沒有動作（不刪除、也不開啟稽核）。`columns.tsx` 的註解寫明「the row itself opens the record; a click here must not also open it」。
- 實際：不會刪除，但整個稽核精靈被打開（AHB-DRAFT-1 第 1 步）。
- 截圖：`shots/A11-disabled-trash-opens.png`
- 讀碼推測：按鈕上的 `e.stopPropagation()` 寫在按鈕自己的 `onClick`，按鈕 `disabled` 時這個 handler 不會執行，Chrome 便把點擊交給外層的列（`onRowClick` → 開啟）。嚴重度低：不會造成資料變動，只是「點了不能按的刪除鈕卻跳出表單」。

## 待確認（行為已觀察，預期不明）

1. **#14 排程同一承包商同一天多筆稽核，只顯示一個圖示。** 種子 7 筆稽核都是 Review Vendor／2026-10-01，排程 10/01 格只顯示 `AHB-DRAFT-1` 一個圖示（tooltip 也只列這筆），其他 6 筆無法從排程點開（`getAuditForMatrix` 用 `find` 只取第一筆）。實務上同承包商同日多筆是否會發生、要不要顯示數量或清單，請決定。截圖 `shots/A04-matrix.png`。
2. **#39 清單沒有「編輯」圖示。** 操作欄只有刪除鈕；開啟稽核只能點整列（或點排程圖示）。若原本預期有編輯鈕，需另開需求；目前行為與程式一致。
3. **#68 刪除某天唯一的時段後，該天的預設午餐（未修改的 12:00–13:00 Lunch Time）仍留在議程。** 依 `AuditAgendaEditor` 的設計，「改日期」把當天最後一個時段移走時，舊日期未修改的午餐會一起移除（先前 `audit-buttons-check.mjs` 7b 驗過；本次 #67 驗了改到新日期會自動加該日午餐），但「刪除列」不會。兩者是否應一致，請決定。可手動刪除該午餐列（#69 PASS）。截圖 `shots/B06-agenda-outside.png`。
4. **#103 第 5 步沒有證據檔／附件上傳。** 欄位標題是「查核備註 / 證據說明」，只能輸入文字（已驗證文字會存入、列印與 Word 都有）。若需要上傳照片或檔案，屬新功能。

## 觀察（非錯誤）

1. **唯讀時畫面沒有任何說明。** Closed、Void（所有帳號）以及 audit_viewer 開啟任何既有稽核時，欄位全部停用、儲存草稿與「完成並建立計畫」隱藏（皆 PASS），但沒有任何「此稽核已關閉／已作廢／您沒有修改權限」的提示；第 5 步備註欄仍顯示「點擊輸入...」提示字，Pass／!／Fail 鈕外觀與可編輯時幾乎相同，點了沒反應（#133、#140、#149、#156、#163、#170）。對照：audit_viewer 自己新建後轉唯讀時，有黃色說明框（C 節 PASS）。截圖 `shots/C-audit_full-Closed-step5.png`、`shots/C-audit_viewer-Draft-step5.png` 等。
2. **日期順序警告是英文。** 結束日早於開始日時的 toast：「稽核結束日 (2026-10-20) is before 稽核開始日 (2026-10-21)」（中英夾雜）。截圖 `shots/B01-date-warning.png`。
3. **「完成並建立計畫」不會改變狀態。** 第 5 步的主按鈕只是「儲存並關閉」，In Progress 按下後仍是 In Progress（#108，依現行設計判定 PASS）。按鈕文字容易讓人以為會完成／建立計畫；狀態需在第 1 步下拉手動改。
4. **資料表控制項為英文。** 中文介面下仍顯示 View／Toggle columns、欄位代號（AuditNo、Title…）、Sort Asc／Sort Desc／Hide Column／Filter、Rows per page、Page 1 of 2、「0 of 13 row(s) selected.」。屬共用 DataTable，非稽核專屬。
5. **「#」欄顯示的是原始資料序號，不是畫面上的列序。** 排序或篩選後會出現 9、10、11、12、13、8 這種跳號（`shots/A09b-contractor-filter.png`）。
6. **audit_multi（限 2 專案）看不到沒有 project_id 的舊資料 `AHB-LEGACY-1`**，符合專案範圍設計；其餘 P1／P2 稽核可見、Draft 可編輯（C 節 PASS）。
7. 依設計且已驗證：只有 Void 能刪（Closed 連 audit_full 也不能刪，後端也回 400）；列印用畫面上的內容（含未儲存修改），Word 用已儲存資料、有未儲存修改時先 toast 要求儲存；以 `?openId=` 深連結開啟的稽核，關閉後回到前一頁；唯讀時第 5 步的分類篩選與搜尋仍可用（只是瀏覽）。

## 未測

1. AUDIT-TEMPLATES 模板庫：不在此 build（R2 審查中）。
2. 實際列印對話框與紙本版面：以 `window.print` stub 代替，只驗證呼叫次數與列印版型 DOM 的種類／內容（版面另有 `audit-print-template-check.mjs`）。
3. Planned／Completed 狀態下的按鈕矩陣：任務指定 Draft／In Progress／Closed／Void，這兩種只驗了狀態下拉選項（Draft→Planned/Void、In Progress→Completed/Void）。英文介面與手機寬度本次未重測（先前 `audit-buttons-check.mjs` 已涵蓋）。
