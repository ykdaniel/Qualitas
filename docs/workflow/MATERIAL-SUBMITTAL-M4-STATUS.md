# MATERIAL-SUBMITTAL-M4 — STATUS（R2 補正輪，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M4-2026-001
ROUND: R2。R1 的 TASK／STATUS／REVIEW／handoff 已逐字封存為 `MATERIAL-SUBMITTAL-M4-R1-REVISE-*-archive.md`（以 cmp 確認內容相同）；REVIEW 已重設為待審。
根目錄 DEPLOY-EXEC 控制文件未改，使用者預覽環境未碰。本輪沒有啟動隔離環境。**未提交、未推送、未部署；不重做看板；不改後端。不自填 PASS。**

## RESULT
- [x] DONE（審查 R1 已補正，交獨立審查）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪實際修改（只處理審查 R1）
| 檔案 | 內容 |
|---|---|
| `react-app/src/utils/materialSubmittal.ts` | `BoardColumn` 改為帶 `kind` 的型別：`status`、`otherStatus`、`category`、`uncategorised`。key 分別為 `status:<狀態>`、`otherStatus`、`category:<分類原文>`、`uncategorised`。分類 key 一律帶前綴，所以不會與兩個特殊欄相同；分類文字經過去重，所以同一模式內的 key 唯一。移除 `UNCATEGORISED` 這個哨兵字串。只有空白或缺少分類才歸入「未分類」，`__uncategorised__` 只是一個普通分類。分欄與合併規則不變。 |
| `components/MaterialSubmittal/SubmittalBoard.tsx` | 依欄的 `kind` 決定標題：只有狀態欄查翻譯表，而且表的型別只限 5 個固定狀態鍵，分類文字不會被拿去查。分類欄直接顯示原文；未分類與其他狀態使用各自的文字。新增 `data-kind` 與 `data-testid="column-heading"`。 |
| `react-app/tests-unit/materialBoard.test.ts` | 隨新的 key 格式更新期望值，並檢查 kind |
| `react-app/tests-unit/materialBoardCategoryNames.test.ts`（新增） | 5 項。分類名稱涵蓋 Draft、Approved、Submitted、other、otherStatus、uncategorised、status:Draft、category:Pipe、constructor、toString、`__proto__`、hasOwnProperty、`__uncategorised__`，以及空白、只有空格、null。①純函式：每個名稱都是獨立的分類欄，key 唯一，只有空白／null 進未分類，每張卡恰好出現一次，未分類排在最後。②狀態模式維持 5 欄，核准與附意見核准合併。③④⑤以 `react-dom/server` 搭配真正的 `LanguageProvider` 渲染實際的 `SubmittalBoard`：中文與英文的分類標題都是原文、只有一個未分類、section key 唯一、卡片數＝資料筆數；狀態模式的中文標題仍是翻譯。 |

其他 M4 檔案的雜湊與 R1 相同（`r2-file-hashes.txt` 附逐檔比對），`LanguageContext.tsx` 仍為 `eeca6b2d…`。

## 驗證（證據：`MATERIAL-SUBMITTAL-M4-evidence/`）
- `r2-frontend-checks.txt`（EXIT 是指令本身的退出碼）：
  - `npm test` **168 pass／0 fail，EXIT 0**（R1 為 163 項，新增 5 項）
  - `npx tsc --noEmit -p .` EXIT 0
  - `npx eslint --max-warnings 0`（本輪 4 個變更檔）EXIT 0
- **變異測試**：在 `$TMPDIR` 的暫存複本中進行，repo 檔案未動。
  - ① 把分類標題改回查狀態翻譯 → 中英渲染測試失敗。
  - ② 恢復舊的 key 格式（分類原文當 key、空白用 `__uncategorised__`）→ key 唯一測試與兩個渲染測試失敗。
  - 新測試能抓到審查指出的兩個問題。
- `r2-category-heading-render.txt`：用與審查 probe 相同的輸入，加上 other、constructor、toString、Pipe 與只有空格的分類，渲染實際元件（不是瀏覽器）。
  - 中文與英文的分類標題都是原文，包括 `Draft`、`Approved`、`other`、`constructor`、`toString`、`__uncategorised__`。
  - 只有一欄「未分類／Uncategorised」，收 3 張（空白、空格、null）。
  - key 全部唯一，渲染卡片 10＝資料 10。
  - 狀態模式仍為 草稿、外部審查中、修正後再送、拒絕、已核准（含附意見核准）。

## 對 R1 證據的影響
- 欄位的 data-testid 從 `column-Submitted` 這類格式改為 `column-status:Submitted`、`column-category:Fire`。R1 瀏覽器紀錄中的 testid 是舊名稱，行為沒有改變。依審查指示，本輪不重跑瀏覽器流程。
- 專案回覆天數相關檔案未變（雜湊相同），未重驗。

## 未驗證／限制
- 標題是以伺服器端渲染實際元件核對，不是在瀏覽器裡核對。
- 手機寬度延期；Python 3.11 須在部署前驗證；後端全套未重跑（本輪沒有改後端）。
- DEPLOY-EXEC-2026-001 仍為 PARTIAL。
- 文件編號規則頁的分頁問題仍是獨立待辦。

## 下一步
交 M4 R2 獨立審查。PASS 前不提交、不部署。
