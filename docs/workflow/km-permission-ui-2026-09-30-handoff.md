# KM 操作入口依既有權限顯示

## 重現與修正

独立 8202／3202 環境，以既有 `seed_km_review.py` 的 km_viewer（僅 km:view:all）登入。修改前實際畫面可見新增文章、刪除、編輯及匯入 Word。路由早已有 KM_CREATE／KM_UPDATE／KM_DELETE 分別把關，本批不改後端。

- `KM.tsx` 依 create／update／delete 權限控制新增、編輯、刪除入口及事件處理；編輯 Modal 也要求相應權限才渲染。
- `columns.tsx` 刪除按鈕依 canDelete 顯示，未傳參數預設不顯示。
- `KMDetail.tsx` 編輯、章節編輯與 Word 匯入依 update 權限顯示；匯入處理函式也檢查。閱讀、列印、匯出、歷史版本入口不變。

## 驗證

新增 `seed_km_permission_ui_review.py`（要求隔離環境）提供一筆可辨識文章。

- 真實瀏覽器：viewer 修改前四種入口皆存在；修改後新增／刪除消失，仍可開文章阅读，詳情頁編輯／匯入消失，Print／匯出 Word／歷史版本入口保留。
- 真實瀏覽器：km_editor（view/create/update，無 delete）仍有新增、編輯、匯入入口但沒有刪除；點 Edit 修改章節名稱並 Save 成功。唯讀 DB 確認父文章版本 2，子章節名稱為 `Permission Review Updated`。
- 新增 2 項直接執行正式欄位元件的單元測試，確認缺 delete 不渲染按鈕，以及有 delete 時點擊傳遞正確 article id 且阻止列點擊冒泡。
- 本輪前端 **112 passed**，型別檢查與 production build 通過。

## 限制

未實際上傳 Word、未點列印／匯出，這些僅確認入口顯示；未做有刪除權限帳號的瀏覽器刪除、新增文章完整保存、動態撤權與 create-only/update-only 組合。新增／更新／刪除後端拒絕機制僅讀碼核對，本輪未重跑後端測試。不把按鈕隱藏當成後端授權防線。

未改後端或權限設定，未動使用者 8198／3198 及開發資料，未使用 stash／reset／checkout，未 commit／push／部署。

本輪隔離堆疊已拆除、8202／3202 已釋放；8198／3198 仍在監聽，僅關閉本輪測試分頁。

## 追加：缺少 KM 檢視權限的入口與訊息（2026-09-30）

使用者在 3198 的 Chain Full 帳號看到原始 `km:view:all` 拒絕訊息，證明上一輪只處理寫入操作入口，漏掉無 view 的情境。

- AppLayout 依既有 km:view:all 隱藏 KM 側欄入口；其他模組未改。
- KM 直接網址在無 view 時顯示中英文友善說明，不發起該元件的清單讀取，也不顯示快取內容。
- store 清單請求遭 403 時記錄 accessDenied，清空文章清單，頁面同樣顯示友善提示；其他載入錯誤保留錯誤狀態但不呈現原始 API 內容。
- 未授予帳號權限、未改後端規則。

本輪驗證：新增兩項正式 store 測試（403 清除舊文章與恢復、網路錯誤不誤判權限），前端 114/114；含型別檢查的 production build 通過。透過瀏覽器唯讀檢查使用者現有 3198/km 頁面，確認 Chain Full 側欄無 KM 按鈕，主區域顯示友善英文說明；未操作表單或寫入資料。本輪未另啟隔離堆疊，未重跑先前有 view 的瀏覽器案例；403 恢復為 mock service 單元證據，不宣稱真實動態撤權瀏覽器驗證。
