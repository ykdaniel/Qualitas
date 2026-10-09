# ITP-INPUT-UX-IMPLEMENT-2026-003 — 交接摘要

SOURCE_TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-002（REVISE，R1/R2 兩項測試方法缺陷）

## 做了什麼
只修改測試腳本 `react-app/tests-browser/itp-input-ux-implement2-review.mjs`，未動產品程式碼：

1. **R1 列印驗證**：原本用「找得到含標記文字的 div，找不到就退回整頁 body 搜尋」的方式驗證列印畫面，但列表畫面本身也含同一標記與同樣的 `pre-line` 樣式，所以原邏輯可能根本沒有驗到 `ITPPrintTemplate`。改為以列印元件獨有的「Inspection & Test Plan」標題為錨點定位實際的 `createPortal` 根節點，先斷言根節點與目標列各恰好命中 1 筆，再於根節點內做完整文字嚴格相等＋`white-space` 樣式比對；移除所有 fallback 與可跳過的成功路徑。
2. **R2 複製來源比對**：原本是「完整相等 OR 前 30 字元子字串相符」，後半段被改掉也可能通過。改為複製前先從來源項目自己的編輯面板讀出完整 EN/CH 值，操作後再讀一次，兩次嚴格 `===` 比較，移除前綴後援。

## 證據
獨立隔離環境（backend 8260 / vite 3260，與使用者 8198/3198 無關，執行前後以 `lsof` 確認未受影響）執行同一支腳本的完整連續流程（技術上無法只抽跑 R1/R2 兩步），**20 項檢查全數 PASS**（整支腳本的執行總數，非兩條獨立流程各自的檢查數）。全文與截圖在 `docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-003-evidence/`。

## 證據類型區分（避免混稱）
R1 驗證的是 **列印 portal DOM 與其 computed style**（`ITPPrintTemplate` 透過 portal 掛載後、Activity EN 欄位的實際渲染文字與 computed `white-space`）——精確比對範圍僅 Activity EN，未對 Criteria 或其他欄位新增獨立的列印比對。**不是**瀏覽器原生系統列印預覽視窗的截圖，也不是 `@media print` 樣式表或 PDF 分頁驗證——那些無法用 Playwright 直接驗證，本輪未聲稱測過。

## 未做的事
- 未修改任何產品程式碼（本輪沒有發現新產品缺陷）。
- 未重跑已接受的版面矩陣、build/lint/unit test（因為沒有產品變更）。
- 未 commit／push／部署。

功能已實作並通過本批驗收，未 commit／push／部署。
