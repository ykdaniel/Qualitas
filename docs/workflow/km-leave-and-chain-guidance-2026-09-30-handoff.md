# KM 離開確認與檢驗流程引導（2026-09-30）

## 核對與修改
ITP已有取消/關閉ConfirmModal；Checklist已有範本用途提示，未重造。KM沒有未保存確認，本輪補formData+chapters初始化快照，取消/右上關閉有變更時使用既有ConfirmModal；留在表單保留輸入，明確離開不送保存。訊息指出已保存的資料仍保留，避免部分成功後誤稱全部撤銷。beforeunload對dirty/saving掛載瀏覽器提醒，卸載清理。

實測發現Quill把空字串轉為空段落，原始JSON比較會造成新建未修改也彈確認，已用正式kmDraftKey排除空段落差異，非空文字/圖片仍判為變更（兩項單元測試）。不宣稱HTML語意等價比較。

Checklist現有templateModeBanner補充NOI→ITR→連結範本的下一步。ITR連結區新增獨立實例提示，不新增跳頁/寫入按鈕，不改既有規則。

## 驗證與界限
獨立8202/3202：新建未改取消直接關閉；改標題後取消出現確認；Stay保留標題；右上關閉同樣確認；Leave關閉；唯讀DB只有原種子1篇文章，未新增草稿。
本輪沒有重新跑整條ITP/NOI/ITR鏈，流程文字為讀碼與型別/建置核對；beforeunload未實測原生對話框。站內SPA導航與返回、其他模組未保存保護尚未完成，不宣稱全站覆蓋。RichTextEditor非空HTML初始化格式差異是否導致多餘dirty提示尚待更多樣本。

使用者8198/3198資料/登入未動，未commit/push/部署。

最終檢查：123項前端單元測試、型別及建置通過；獨立堆疊已拆除。

## 同日追加：共用離開保護
後續已由 Shared/LeaveGuard 接管 KM 本地確認與 beforeunload，並補 SPA 導頁、上一頁、登出及其他主要表單。上方為前一輪歷史範圍；最新實作、實測與限制見 [表單離開保護交接](form-leave-guards-2026-09-30-handoff.md)。
