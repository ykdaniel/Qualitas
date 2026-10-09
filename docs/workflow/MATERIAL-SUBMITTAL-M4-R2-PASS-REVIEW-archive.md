# MATERIAL-SUBMITTAL-M4 — REVIEW

TASK_ID: MATERIAL-SUBMITTAL-M4-2026-001
ROUND: R2
REVIEWER: GPT
DATE: 2026-10-09

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## 審查範圍與結論
僅複核 R1 的分類標題與欄位識別碰撞補正，不重審已接受的 M4 其他流程。

- BoardColumn 以 kind 區分狀態、分類、未分類與未知狀態；分類 key 帶 category: 前綴，固定狀態帶 status: 前綴，不再與空白分類哨兵碰撞。
- 分類標題直接取 category；只有固定狀態查翻譯表。Draft、Approved、other、constructor、toString、__proto__、__uncategorised__ 等名稱不再被當成狀態或物件屬性。
- 空白分類仍獨立歸組；狀態五欄及兩種核准結果合併規則保持不變。
- 新測試包含實際 SubmittalBoard 與 LanguageProvider 的中英渲染，並核對唯一 key、分組與卡片完整性。未發現本輪阻擋問題。

## 驗證證據
- 獨立重跑 materialBoard.test.ts 與 materialBoardCategoryNames.test.ts：12 passed、0 failed、0 skipped、EXIT 0。完整輸出：MATERIAL-SUBMITTAL-M4-evidence/reviewer-r2-board-tests.txt。
- 審查者第一次執行器誤把 esbuild 產出的 CSS 也傳給 node --test，造成額外一項執行器失敗；12 項實際測試當時均通過。已修正為只執行 .mjs，原輸出保留於 reviewer-r2-board-tests-attempt1-runner-error.txt，不採作正式結果。產品與測試檔未修改。
- 核對 r2-file-hashes.txt 的 11 份檔案，當前 SHA-256 全數吻合。
- 已讀 r2-frontend-checks.txt：提交者 npm test 168 passed、tsc 與本輪四檔 lint 均 EXIT 0；兩種變異的失敗結果為提交者紀錄，未獨立重做。
- 已核對 r2-category-heading-render.txt。標題證據為伺服器端實際元件渲染，不宣稱本輪瀏覽器驗收。

## REQUIRED_FIXES
無。

## 限制
- 未重跑全部瀏覽器流程、前端全套檢查、後端全套或專案天數的瀏覽器驗收；沿用未變部分的既有證據。
- Python 3.11 的材料功能驗證仍須在部署前完成。
- 本 PASS 僅接受 M4 補正，不代表材料功能已部署，也不代表根目錄 DEPLOY-EXEC 已結案。

## NEXT_STEP
1. 逐字封存 M4 R2-PASS 的 TASK／STATUS／REVIEW，保留 R1-REVISE 與全部證據。
2. 進入 M5 部署準備：使用獨立控制文件，盤點 M1–M4 已審來源、Python 3.11 驗證、migration 與資料備份／回退，以及現場切換方案。既有 DOCX 單檔部署方案不能直接作為材料後端整批部署方案。
3. 延續既有部署授權與審查門檻；不混入未審修改、不推送未全面審查的基準提交。具體部署準備與現場檢查完成前，不切換正式服務。
4. 不覆寫根目錄 DEPLOY-EXEC 控制文件；保留使用者預覽環境。
