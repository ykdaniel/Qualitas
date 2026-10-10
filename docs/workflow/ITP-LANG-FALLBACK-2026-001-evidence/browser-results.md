# ITP-LANG-FALLBACK-2026-001 — 隔離環境重現與驗證（2026-10-07，約 15:20–15:35Z）

環境：沿用本輪專用隔離堆疊 backend `127.0.0.1:8270`、vite `127.0.0.1:3270`（使用前核對身分：run `fc3f0a50`，目錄 `qualitas-manual-ra667pd8`）。
新測資：`backend/scripts/verification/seed_itp_lang_fallback_review.py` 另建 ITP `lang-itp-1`（`QTS-IUX1-ITP-LANG01`）與帳號 `lang_tester`（itp view/create/update、checklist view/create、contractors view；一次性密碼存 scratchpad，不入 repo），避免前次必填矩陣資料（A2–A5、B1）干擾。
瀏覽器：Claude 內建瀏覽器。方法：頁面內 JavaScript 讀取下拉選項；Generate Checklist 以畫面按鈕實際觸發，讀取瀏覽器網路紀錄中的 POST 回應本文，再以新的 `GET /api/checklist/{id}`（`cache: 'no-store'`）獨立重讀。

## 測資（`lang-itp-1` 的 phase A）

| 項目 | Activity | Criteria |
|---|---|---|
| A1 | 只中文 | 兩條只中文 |
| A2 | 只英文 | 一條只英文 |
| A3 | 雙語 | 一條雙語 |
| A4 | 英文 `'   '`、中文有值 | 四條依序：雙語、只中文、英文 `'  '`＋中文、只英文 |
| A5 | 舊格式字串 | 舊格式字串 |
| A6 | 只中文 | 無 |

## 1. 修改前重現（程式為 `ITP-REQUIRED-POLICY-2026-001` 結束時的版本）

Insert After 選項文字（兩個入口相同）：
- `/itp/lang-itp-1`（`ITPDetail`）：`["At the Beginning","At the End","A1 -","A2 - English-only activity: check mill certificates","A3 - Bilingual activity","A4 -","A5 - Legacy plain-string activity","A6 -"]`
- 清單頁（`ITPAdvancedEditor`）：`["At the Beginning (最前面)","At the End (最後面)","A1 -","A2 - …","A3 - Bilingual activity","A4 -","A5 - Legacy plain-string activity","A6 -"]`

Generate Checklist（清單頁按鈕）→ toast「Checklist QTS-SSE-CHECKLIST-000001 created successfully」。POST `/api/checklist/` 回應中的 `detail_data.items`（逐字）：
```json
[{"id":1,"item":"[A1] ","criteria":""},
 {"id":2,"item":"[A2] English-only activity: check mill certificates","criteria":"EN criterion one"},
 {"id":3,"item":"[A3] Bilingual activity","criteria":"Bilingual criterion"},
 {"id":4,"item":"[A4]    ","criteria":"Mixed EN 1;   ; Mixed EN 4 only"},
 {"id":5,"item":"[A5] Legacy plain-string activity","criteria":"Legacy plain-string criteria"},
 {"id":6,"item":"[A6] ","criteria":""}]
```
（每項另有 `"situation":"","result":""`，省略。checklist id `118abc99-7beb-425c-98a1-1d8fbc17d8ee`。）
→ 實測確認：只中文的活動描述未帶入（只剩 `[項目編號]`），中文 Criteria 未帶入；A4 的英文空白被當成內容保留，只中文的那條 Criteria 被丟棄。

來源 ITP（產生前）：`GET /api/itp/lang-itp-1` 的 `detail_data` 以 `JSON.stringify` 後 SHA-256 = `e95655964777ccb22574a9d01b4eaa0079ae6959754a1f83916d188208fd20b1`，phase A 6 項，`rev` = `Rev1.0`。

## 2. 修改後驗證

Insert After 選項文字：
- `ITPDetail`：`["At the Beginning","At the End","A1 - 僅中文活動：核對鋼筋出廠證明","A2 - English-only activity: check mill certificates","A3 - Bilingual activity","A4 - 英文只有空白、中文有值的活動","A5 - Legacy plain-string activity","A6 - 無準則的中文活動"]`，選項值 `["beginning","end","A1",…,"A6"]` 不變。
- `ITPAdvancedEditor`：`["At the Beginning (最前面)","At the End (最後面)","A1 - 僅中文活動：核對鋼筋出廠證明","A2 - English-only activity: check mill certificates","A3 - Bilingual activity","A4 - 英文只有空白、中文有值的活動","A5 - Legacy plain-string activity","A6 - 無準則的中文活動"]`，選項值不變。

Generate Checklist → toast「Checklist QTS-SSE-CHECKLIST-000002 created successfully」。POST 回應 `detail_data.items`（逐字）：
```json
[{"id":1,"item":"[A1] 僅中文活動：核對鋼筋出廠證明","criteria":"中文準則一; 中文準則二"},
 {"id":2,"item":"[A2] English-only activity: check mill certificates","criteria":"EN criterion one"},
 {"id":3,"item":"[A3] Bilingual activity","criteria":"Bilingual criterion"},
 {"id":4,"item":"[A4] 英文只有空白、中文有值的活動","criteria":"Mixed EN 1; 混合二僅中文; 混合三英文空白; Mixed EN 4 only"},
 {"id":5,"item":"[A5] Legacy plain-string activity","criteria":"Legacy plain-string criteria"},
 {"id":6,"item":"[A6] 無準則的中文活動","criteria":"無準則的中文活動"}]
```
（checklist id `d852f8d9-9b7f-4428-bd9d-5dff1c6aa98b`，`itpId` = `lang-itp-1`，`itpVersion` = `Rev1.0`。）

獨立重讀（新的 GET，不使用建立回應）：
- `GET /api/checklist/d852f8d9-…` → 200，`recordsNo` = `QTS-SSE-CHECKLIST-000002`，`itpId` = `lang-itp-1`；6 項與上方預期逐項比對 `perItem = [true,true,true,true,true,true]`。
- `GET /api/checklist/118abc99-…`（修改前產生的 000001）→ 內容與第 1 節相同，未被回填。
- 來源 ITP：`detail_data` SHA-256 仍為 `e9565596…08fd20b1`（`unchanged = true`），phase A 6 項，`rev` = `Rev1.0`。

對照：A2（只英文）、A3（雙語）、A5（舊字串）修改前後輸出完全相同；A6 無 Criteria 時仍以 Activity 代替（既有行為），只是 Activity 現在帶入中文。Criteria 合併仍為原順序、`'; '` 分隔。

## 限制
- 原生下拉選單展開時無法截圖，Insert After 以頁內讀取的選項文字為證據（截圖 `01` 只顯示面板與收合的選單）。
- 隔離資料庫中新增了兩份 Checklist（000001 修改前、000002 修改後），僅隔離環境。
- 量測為頁內 JavaScript 與網路紀錄；取值規則另有單元測試（`tests-unit/itpItemValidation.test.ts` 新增 3 項）。
