# QWORKFLOW-UX-2026-002 — 目前步驟文字：手機可視範圍證據補齊

延續 QWORKFLOW-UX-2026-001，處理獨立審查 REVISE 判定的 R1（完整原文見
`docs/workflow/QWORKFLOW-UX-2026-001-archive.md`）。**產品邏輯（`currentStepText()`）與桌面
呈現本輪未重開、未重寫**，只補手機可視範圍的真實幾何證據與兩項紀錄精確化。

## R1 — 手機上文字實際可讀，不只是存在（已完成，**實測未發現裁切，無需產品修正**）

**問題**：前一輪的手機檢查只核對 `document.documentElement.scrollWidth - clientWidth`（整頁
水平溢出）為 0，但第一項斷言用 `count() === 1` 卻命名為「visible without horizontal
scroll」——元素存在於 DOM 不代表文字真的落在可視範圍、沒被表格自己的 `.tableWrapper`
（`overflow-x: auto`，一個獨立的裁切容器）或緊鄰的 sticky 欄位裁切/遮住。

**本輪驗證方法**：在 375px 寬度，對表格做**垂直**捲動（`table.scrollIntoView({block:
'start', inline: 'nearest'})`，刻意不用會意外橫向捲動目標元素的 `scrollIntoViewIfNeeded`）
讓表格進入視野，核對表格自己的水平捲動位置維持在 **≤5px 容差**（不是嚴格的
`scrollLeft === 0`——這是 `scrollIntoView` 本身造成的實際容差，不宣稱單純是次像素誤差）。
對三列（低完成度、22% 完成度顯示另一個 current 名稱、100% 完成顯示 Accepted）各自核對：

1. `boundingBox()` 取得的實際渲染尺寸非零；
2. 元素左上角座標在 viewport 內（沒有被捲到螢幕外）；
3. 元素右邊界沒有超出 375px viewport 寬度（沒有被裁掉一部分）；
4. 在元素自己 bounding box 的**中心點**做 `document.elementFromPoint()` 命中測試，確認
   命中的真的是這個目前步驟元素本身（或其子節點），不是疊在上面的其他東西（例如相鄰的
   sticky 欄位）。**這只證明中心點沒有被遮住，不能單獨證明元素四個邊緣都沒有被裁切**——這是
   前一輪 `isVisible()`/`count()` 完全無法偵測、但本身也不是「決定性」的單一證明。

**實測結果（隔離環境，39/39 通過）**：三列的文字元素右邊界分別落在約 364px，距 375px
viewport 邊界約 **11px** 餘裕；命中測試全部確認中心點未被其他元素覆蓋。「文字完整可讀」這
個結論是上述自動檢查**搭配**這三列各自的實機截圖（`qw-06`/`qw-07`/`qw-08`，各自的表格列
近照；`qw-09`，含完整表格範圍的手機總覽——補足前一輪手機截圖沒拍到表格本身的缺口）一起
佐證的，**證據範圍限於本輪這三個指定樣本**，不代表所有文字長度與語系組合都已驗證過。**沒有
發現裁切，不需要修改 `Workflow.tsx` 或 `Workflow.module.css` 任何一行**——R1 以補驗證資產
與文件的方式完成，產品程式碼維持前一輪通過審查的版本不變。

過程中發現並修正了測試腳本本身的一個問題（不是產品缺陷）：前一輪 scenario 3 用
`locator.screenshot()` 給第 100% 完成那一列的最後一欄拍近照，Playwright 的
`locator.screenshot()` 內部會呼叫 `scrollIntoViewIfNeeded()`，這個呼叫本身把表格的檢查點
欄位橫向捲動了 274px——這正是這次審查要求必須避免的「意外橫向捲動」。已移除該行，改為全部
用 `page.screenshot({ clip })` 搭配 `boundingBox()` 算出的座標截圖，不會觸發任何捲動。

## 紀錄精確化（不另開調查）

1. **完成度描述**：`QTS-QWUP1-NOI-000002` 前一輪稱為「MID（中完成度）」，實際完成度是
   **22%**（9 個檢查點中 2 個 done）。本檔與 `STATUS.md` 已改稱「另一個 current 檢查點名稱
   （完成度 22%）」，不再宣稱涵蓋「中完成度」這個區間本身——這只是「與低完成度那列顯示不同
   文字」的一個額外資料點，不是中段區間的代表樣本。
2. **節點導向的實測範圍**：前一輪聲稱「節點點擊仍開啟正確的紀錄（NOI/ITR/NCR）」，但瀏覽器
   腳本從頭到尾只實際點擊並驗證了 `wh_inspection` 檢查點 → `/noi` 這一條路徑。本檔與
   `STATUS.md` 已精確區分：
   - **本輪實機測試過**：`wh_inspection` 檢查點點擊 → 正確開啟對應的 NOI 紀錄。
   - **未修改、但本輪也未實測**：`handleCheckpointClick` 裡導向 ITR（`itr` 檢查點）或 NCR
     （`ncr`/`moc`/`improvement`/`reinspection`/`close_ncr` 等檢查點）的分支、排序邏輯、
     bucket 篩選、既有授權行為。這些邏輯本身在這兩輪都沒有被修改過，但「沒改」不等於「本輪
     實測過仍正常」，兩者在本檔裡分開列示，不得混為一談。

兩項精確化均依審查要求「不另開調查」，未因此新增測試範圍或重新調查其他項目；原有「未測限制」
段落照舊保留（見 `docs/workflow/QWORKFLOW-UX-2026-001-handoff.md`）。

## 測試結果（本輪實際執行）

- `node tests-browser/qworkflow-currentstep-review.mjs` → **39/39 通過**（自建隔離堆疊，
  backend/vite 8200/3200，完成後已拆除並以 `lsof` 確認埠號釋放）。
- `node --check tests-browser/qworkflow-currentstep-review.mjs` → 通過。
- 本輪**未修改任何產品程式碼**（`Workflow.tsx`、`Workflow.module.css`、
  `LanguageContext.tsx` 皆維持 QWORKFLOW-UX-2026-001 通過審查時的版本不變），依 TASK.md
  「延續的既有限制」段落（未改產品程式碼則略過重跑）明確略過 `npm test`/`npm run build`
  重跑，不是依據 ACCEPTANCE_CRITERIA 第 6 條（該條是完成後拆除隔離堆疊並核對埠號釋放，
  與是否重跑建置無關）。

## 未測限制（延續自 001，未擴大；本輪新增的範圍澄清已併入上方「紀錄精確化」）

- 手機幾何實測只做了**三列**（低完成度、22% 完成度、100% Accepted）；Void-ITR 那一列本輪
  手機段落**未**另外做幾何驗證，只在前一輪核對過文字與低完成度列一致，不稱四種形狀皆已做過
  手機幾何驗證。其餘檢查點名稱走相同程式路徑與 CSS，風險低但未逐一實測。
- 中文（zh）locale 下的手機顯示未另外實機驗證，僅讀碼確認翻譯值存在、邏輯與英文路徑共用。
- ITR/NCR 節點導向、排序、bucket 篩選、授權行為：見上方「紀錄精確化」第 2 點，本輪與上一輪
  皆未實測。

## 隔離與可重跑資產

- `react-app/tests-browser/qworkflow-currentstep-review.mjs`（本輪重寫手機段落，R1）。
- `backend/scripts/verification/seed_qworkflow_currentstep_review.py`（本輪未修改，沿用
  001 版本）。
- `docs/workflow/QWORKFLOW-UX-2026-002-evidence/`（8 張截圖，本輪新增；取代前一輪手機相關
  截圖，前一輪桌面相關截圖如實保留在
  `docs/workflow/QWORKFLOW-UX-2026-001-evidence/`，未覆蓋）。

## 埠號釋放

隔離堆疊（backend/vite 8200/3200，root 為 `qualitas-manual-14ufc97h`）已於完成後以
`isolated_stack.py down` 拆除，並以 `lsof` 確認埠號釋放；使用者 8198（backend）/3198
（vite）全程監聽未受影響。

## 結案（獨立審查 PASS，2026-10-03）

QWORKFLOW-UX-2026-002 經獨立審查判定 **PASS**，見 `REVIEW.md`（TASK_ID:
QWORKFLOW-UX-2026-002）。**不再開 QWORKFLOW-UX-2026-003**。

審查確認已實際查看 `qw-06`／`qw-07`／`qw-08`（三列近照）與 `qw-09`（手機表格總覽）截圖，
補足前一輪手機截圖沒拍到表格本身的缺口；並執行 `node --check` 通過。審查**未**重新執行
隔離瀏覽器、`npm test` 或 `build`——39/39 的執行結果與隔離環境拆除情況，是審查引用 Claude
本輪的執行紀錄，不是審查者獨立重跑產生的。

審查同時指出並已於上方本檔與 `STATUS.md` 修正的幾點：

- 表格水平捲動的實際驗證容差是 **≤5px**，不是嚴格的 `scrollLeft === 0`，也不宣稱這單純是
  次像素誤差。
- 右邊界與 viewport 邊界的餘裕是 375−364 ≈ **11px**（先前文件誤寫為「363px 餘裕」）。
- 手機幾何實測範圍是**三列**（低完成度、22%、100% Accepted），Void-ITR 只有前一輪的文字
  一致性驗證，沒有另外做手機幾何驗證；先前文件的「4 種形狀」用語已更正。
- 略過 `npm test`/`npm run build` 重跑的依據是 TASK.md「延續的既有限制」段落，不是
  ACCEPTANCE_CRITERIA 第 6 條（該條與建置重跑無關）。
- 中心點命中測試只證明中心未被遮住，不能單獨證明元素四個邊緣都沒有裁切；「文字完整可讀」
  是這組自動檢查**搭配**三列實機截圖一起佐證的，證據範圍限於本輪三個指定樣本，不代表所有
  文字長度與語系組合都已驗證過。

PASS 判定的範圍與限制（審查原文已明確指出，一併保留）：

- 不由這三個英文樣本推論全語系（尤其中文）或全部 9 個檢查點皆已完成手機驗收。
- R1 的核心可讀性證據已補足，未見需要產品修正的缺陷；此結論限於本批指定範圍。
- `BACKLOG.md` #52 的既有未測限制（ITR/NCR 節點導向、排序、bucket 篩選、授權行為等）維持
  原樣，不因本輪結案而視為已驗證。

本次文件結案僅同步 `BACKLOG.md` #52 的對應條目與本檔的結案狀態，並修正上述幾處文字，未新增
測試、未重跑任何測試、未修改任何產品程式碼、未 commit/push/部署。
