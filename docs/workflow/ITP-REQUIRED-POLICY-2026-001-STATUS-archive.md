# STATUS.md — Claude 執行結果

TASK_ID: ITP-REQUIRED-POLICY-2026-001

## RESULT
- [x] DONE（待獨立審查；本文件不填 PASS）
- [ ] PARTIAL
- [ ] BLOCKED

## 前一任務狀態（保留）
- `ITP-CRITERIA-LAYOUT-2026-001`：PASS，已封存；未提交、未部署。
- `DOCX-PATH-GUARD-2026-001`：產品 PASS，未部署。`NOI-EXPORT-DOCX-2026-001`：REVISE。

## 決策與文件
- `DECISIONS.md` 新增「ITP 檢驗項目 Activity／Standard 中英擇一必填」（2026-10-07）。
- `BACKLOG.md` #36：標題改為決策狀態，並於原文前附決策說明（註明取代先前「延後」狀態與 Claude 自行加入的英文必填）；歷史原文保留未改。

## 實際變更（未提交的工作樹變更）
1. 新增 `react-app/src/utils/itpItemValidation.ts`：`hasEitherLanguage()`（英文或中文 `trim()` 後非空即算已填；舊格式字串 Standard 以其本身判斷）、`missingRequiredItemFields()`（Activity、Standard 各自判斷）。
2. `ITPDetail.tsx`（`handleSave`）與 `ITPAdvancedEditor.tsx`（`handleSaveItem`）：原本的「Activity(EN) 與 Standard(EN) 必填」改為呼叫 `missingRequiredItemFields(editingItem)`；有缺就以 toast 提示並提前返回（面板不關、輸入保留）。新增與編輯共用同一路徑。
3. 兩個檔案的 Activity、Standard 欄位組標題：移除紅色星號，改顯示「英文或中文至少填一項」／「English or Chinese — at least one」。
4. `LanguageContext.tsx` 新增兩個鍵（中英各一）：`itp.itemPanel.eitherLanguageRequired`、`itp.itemPanel.eitherLanguageRequiredToast`。
5. 新增 `react-app/tests-unit/itpItemValidation.test.ts`（4 個測試）與 `react-app/tests-browser/itp-required-policy-vite-launcher.mjs`（8270／3270）。
- 換行字元：`ITPAdvancedEditor.tsx`、`LanguageContext.tsx` 為 CRLF，本次以逐位元組、依原檔換行方式修改，修改後兩檔 CR 數等於行數；`ITPDetail.tsx` 維持 LF。
- 未改：資料結構、保存、排序、核准；其他欄位的必填；歷史資料（未回填、未清洗）；無自動翻譯或複製。

## 其他驗證的核對
- 前端：`ITPDetail.tsx`、`ITPAdvancedEditor.tsx` 以外，未找到其他對 Activity／Standard 的必填驗證。
- 後端：讀碼未發現 ITP 項目 Activity／Standard 驗證，無衝突。
- **非驗證的下游影響（發現，本批未修）**：
  - `Insert After` 選單只顯示 `activity.en`，只填中文的項目顯示為「A2 -」（實測）。
  - `ITPModals.tsx` Generate Checklist 只取 `activity.en`／`criteria[].en`：只填中文的項目產生的 Checklist 項目仍有 `[項目編號]` 前綴，但**中文活動描述未帶入**（只剩項目編號），**中文 Criteria 也未帶入**（讀碼確認，未實測產生）。（2026-10-07 依審查更正：原寫「產生空白項目文字」不精確。）
  兩者需另行決定是否改為「英文為空時改用中文」。

## 前端檢查（`docs/workflow/ITP-REQUIRED-POLICY-2026-001-evidence/`，完整輸出含退出碼與 5 個變更檔雜湊）
| 檢查 | 結果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | 133 pass／0 fail（含新增 4 項），exit 0 |
| `npx eslint` 限定 5 個變更檔 | **0 errors、11 warnings、exit 0**（警告未清除，不代表全專案 lint 通過） |
- 第一次執行時，zsh 未把檔案清單變數拆開，導致檔頭雜湊缺失、eslint 找不到檔案（exit 2）；該次 tsc／build／test 本身正常。原輸出保留於 `attempt1-shell-wordsplit-bug/`，改用陣列重跑，上表為重跑結果。

## 瀏覽器驗收（隔離 8270／3270；詳見 `browser-results.md`，截圖 `01`、`02`）
- `/itp/:id`（`ITPDetail`）：新增 6＋編輯 6 情境 **12／12 符合**。兩者皆空、只有空白字元（含全形空白）、Activity 有值但 Standard 只有空白 → 阻擋、輸入保留；只英文、只中文、兩者皆填 → 可套用。
- 清單頁（`ITPAdvancedEditor`）：同一矩陣 **12／12 符合**。
- 只填中文（含換行、開頭全形空白、結尾空白）：Apply → Save Document → 重新載入 → 重開，中文逐字保留、英文仍空；清單頁編輯器讀出相同內容。
- 更正我的一個誤判：清單頁彈窗在 Apply 時就會立即寫入伺服器（`ITPModals.tsx` `handleItemsChange`，既有行為，本批未改），所以清單頁矩陣的允許情境已寫入隔離資料庫（A3–A5、B1）。

## 限制／未做
- 中文介面的標示文字未切換語言截圖；未做寬度矩陣；手機延期。
- 量測為頁內 JavaScript，非保存的自動化測試；規則本身有單元測試。
- 未提交、推送、部署。

## 仍在運作的環境
- 本輪新開 8270／3270（run `fc3f0a50`）——保留待審，審查後再拆除。
- 8240／3240、8198／3198 未觸碰。
