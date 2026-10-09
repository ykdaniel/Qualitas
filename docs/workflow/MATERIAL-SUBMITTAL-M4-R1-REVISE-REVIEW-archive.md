# MATERIAL-SUBMITTAL-M4 — REVIEW

TASK_ID: MATERIAL-SUBMITTAL-M4-2026-001
REVIEW_DATE: 2026-10-08

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

主要方向維持；只需補下列分類識別衝突，不重做看板或回覆天數設定。

## 審查範圍與證據
- 閱讀本輪 TASK、交接、看板元件、boardColumns／parseReplyDays、共用列表資料與切換、ProjectModal 與 projectStore 的 materialReplyDays 串接。既有未提交修改不視為本批全面驗收。
- M4 file-hashes.txt 所列檔案目前全部 MATCH。
- 已閱讀實作者瀏覽器紀錄：206 筆資料之載入更多、狀態分組與列表計數、版次／逾期、非拖曳、1280 桌面、由看板登錄外部結果及專案天數 10／null 往返。此為實作者證據，本次未重啟堆疊或獨立重跑瀏覽器。
- 交接的 163 項單元測試、tsc、lint、build 為已保存檢查證據；本次未重跑全套。
- 獨立執行實際 boardColumns 與轉譯後 SubmittalBoard 的輕量元素替身 probe（不是瀏覽器），結果保存於 MATERIAL-SUBMITTAL-M4-evidence/reviewer-category-probe.txt。

## REQUIRED_FIXES

### R1 — 分類名稱不能與狀態／未分類識別值混用（P2）
位置：react-app/src/components/MaterialSubmittal/SubmittalBoard.tsx 的 COLUMN_LABEL 與欄位標題；react-app/src/utils/materialSubmittal.ts 的 boardColumns／UNCATEGORISED。

分類為自由文字，但 category mode 直接以文字當 key，渲染時仍查狀態用的 COLUMN_LABEL。合法分類 Draft、Approved、other 會顯示成系統狀態／其他的翻譯，而非原分類名称。普通物件的繼承屬性名也不應被當成翻譯鍵。

此外分類文字 __uncategorised__ 與真正空白分類共存時，boardColumns 會產生兩個相同 key，且兩欄都顯示「未分類」。獨立 probe 已確認重複 key 及標題誤用；不聲稱已實測卡片遺失。

修正：以分組種類區分標題解析，分類原文直接顯示；為狀態、真實分類及空白分類使用不碰撞的欄位識別方式，不禁止使用者輸入這些合法分類名稱。

驗收：加入 Draft、Approved、other、constructor／toString、__uncategorised__ 與空白分類的案例，確認標題保留原文、空白才顯示未分類、所有欄 key 唯一且每張卡恰好出現一次；原狀態五欄與核准合併行為維持。至少以實際元件渲染或隔離瀏覽器核對標題，不只測純函式的卡片總數。

## NEXT_STEP
1. 逐字保存本輪 M4 控制文件為 R1-REVISE，建立小範圍補正輪，不動根目錄部署控制文件。
2. 只修 R1 與對應測試；執行相關單元測試、tsc、變更檔 lint，保存最終來源雜湊及標題渲染證據後交審。
3. 不要求重跑後端全套、全部 M4 瀏覽器流程或重新驗證未變的專案天數流程。
4. 手機延期、Python 3.11 部署前驗證、DEPLOY-EXEC 仍 PARTIAL 等限制維持。不啟動部署、不清理既有預覽環境。
