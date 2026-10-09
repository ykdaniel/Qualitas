# MATERIAL-SUBMITTAL-M4 — STATUS（待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M4-2026-001
ROUND: R1。M3 R2-PASS 控制文件已逐字封存為 `MATERIAL-SUBMITTAL-M3-R2-PASS-*-archive.md`；M3 的既有封存與證據保留不動。
根目錄 DEPLOY-EXEC 控制文件未改，使用者預覽 8240／3240 未碰。**未提交、未推送、未部署；不改後端；不重做 M3；不碰文件編號分頁問題。不自填 PASS。**

## RESULT
- [x] DONE（交獨立審查）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪實際修改（只有前端；另有一支只用於隔離環境的種子腳本）
| 檔案 | 內容 |
|---|---|
| `react-app/src/utils/materialSubmittal.ts` | 新增純函式：`boardColumns`（依狀態或分類分欄；每張卡片恰好出現一次；未知狀態放進「其他」欄，不會被隱藏；沒有分類的放在最後的「未分類」）。新增 `parseReplyDays`（空白＝null；只接受非負安全整數）。 |
| `react-app/tests-unit/materialBoard.test.ts`（新增） | 7 項：分欄不漏不重複、核准與附意見核准同欄、未知狀態、分類排序與未分類、回覆天數輸入（-1、1.5、1e3、空白、超大數） |
| `components/MaterialSubmittal/SubmittalBoard.tsx`（新增） | 看板視圖。卡片是 `button draggable={false}`，沒有拖曳處理；點擊後開啟既有的詳細頁。卡片內容：「最新 Rev n＋狀態」、「現行核准 Rev m」或「尚無核准版」；外部審查中才顯示預計回覆日，逾期加紅框並標「逾期」。欄寬 260px，看板容器可橫向捲動。 |
| `components/MaterialSubmittal/MaterialSubmittal.tsx` | 送審分頁加入「列表｜看板」切換與「依狀態／依分類」；兩種視圖共用同一份已載入資料、篩選、「已載入 N／共 T」與「載入更多」。切換按鈕沿用共用的 tabs 樣式，只在這裡以 inline 方式取消 margin 與 overflow（驗收時發現的 1px 捲軸），共用 CSS 不改。 |
| `components/MaterialSubmittal/materialText.ts` | 看板相關的中英文字 |
| `react-app/src/services/api.ts`、`src/store/projectStore.ts` | 專案型別加上 `materialReplyDays`（API 欄位已在 M1 提供） |
| `components/Contractors/ProjectModal.tsx` | 既有專案表單加入「材料送審回覆天數」：可空白；其他輸入只接受非負整數；不合法時顯示錯誤並停用儲存。沿用既有的 `PUT /api/projects/{id}`。 |
| `backend/scripts/verification/seed_material_m4_review.py`（新增，只用於隔離環境） | 接在 M3 種子之後執行：加入逾期、附意見核准、拒絕、修正後再送（其中一筆沒有分類）各一筆，以及 200 筆草稿，讓 M3-P1 共 206 筆 |

後端產品程式沒有修改。`LanguageContext.tsx` 雜湊與 M3 相同（`eeca6b2d…`）。完整雜湊見 `MATERIAL-SUBMITTAL-M4-evidence/file-hashes.txt`。
注意：`api.ts`、`projectStore.ts`、`ProjectModal.tsx` 在工作樹中原本就有其他未提交的修改。M4 只加了上述欄位，審查時請只看這部分的差異。

## 驗證（證據：`MATERIAL-SUBMITTAL-M4-evidence/`）
**自動檢查**（`frontend-checks.txt`；EXIT 是指令本身的退出碼）：
- `npm test`：**163 pass／0 fail，EXIT 0**（M3 為 156 項，新增 7 項）
- `npx tsc --noEmit -p .`：EXIT 0
- `npx eslint --max-warnings 0`（M4 涉及的 8 個檔案）：EXIT 0
- `npx vite build`（輸出到暫存目錄）：EXIT 0

**瀏覽器驗收**（`browser-acceptance.txt`＋截圖）：使用新的隔離環境（8310／3310），結束後已 down（`teardown.txt`）；8240／3240 仍在運作。
- **AC-M4-1**：
  - 第 1 頁有 200 張卡片，畫面顯示「已載入 200／共 206 筆」，與 API total 206 相同。
  - 按載入更多後卡片數為 206，按鈕隨之消失。
  - 篩選「外部審查中」時，看板 2 張＝列表 2 筆＝API 2 筆。
  - 依分類分組時，各欄加總為 200，與已載入筆數相同。
- **AC-M4-2**：MSA-1 只有一張卡片，顯示「最新 Rev 2 外部審查中／現行核准 Rev 1 核准」。
- **AC-M4-3**：
  - 逾期的那筆在看板卡片與列表都有標示（紅色、粗體）。
  - 勾選「只看逾期」時，看板與列表都只剩這 1 筆。
- **AC-M4-4**：
  - 卡片不可拖曳。
  - 實際用滑鼠把卡片拖到「拒絕」欄：卡片仍在原欄，沒有開啟對話框，API 狀態沒有改變。
- **AC-M4-5**（1280×800）：
  - 5 個欄位互不重疊。
  - 看板內可橫向捲動（scrollWidth 1348，clientWidth 939）。
  - 整個頁面沒有橫向溢出，工具列沒有重疊。
- **AC-M4-6**：
  - 資料流程：Rev 0 修正後再送 → Rev 1 核准 → Rev 2 審查中，由種子建立；最後一步在 UI 從看板開啟詳細頁，登錄「附意見核准」。
  - Network：POST result 回 200 → 看板重新讀取。
  - 卡片移到「已核准」欄，顯示「最新 Rev 2／現行核准 Rev 2 附意見核准」，API 讀回的值一致。附截圖。
- **專案回覆天數**：
  - 輸入 -1：顯示錯誤，儲存按鈕停用。
  - 輸入 10：PUT 送出 10，回應 10。
  - 清空：PUT 送出 null，回應 null。
  - P1 原本的 14 正確讀回。
  - P2 設為 10 之後送交：預計回覆日自動帶入 2026-10-18，伺服器保存的值也是 2026-10-18。

## 未驗證／限制
- 手機寬度（不在範圍內）與深色模式未檢查。
- 依分類分組只在第 1 頁檢查。
- AC-M4-6 的外部決定者姓名在輸入時被測試工具打亂（只是測試資料，不是程式問題）。
- Python 3.11 與後端全套：沿用原有限制。M4 沒有修改後端程式。
- 文件編號規則頁的分頁問題仍是獨立待辦，未混入本輪。

## 下一步
交 M4 獨立審查。PASS 前不提交、不部署。
