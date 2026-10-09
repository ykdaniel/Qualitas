# KM 編輯載入保護（2026-09-30）

讀碼確認：既有文章開啟編輯後，表單即刻可操作，但非同步 refresh 完成時又會 setFormData/setChapters，可能覆蓋輸入；store fetchKMs 吞例外而 resolve，失敗可能被誤當沒有章節。本輪不宣稱已於修正前瀏覽器重現慢回應覆寫。

修正：正式編輯器使用 loadKMEditorSnapshot 取得獨立快照（不刷新共用store），目標文章不存在或清單失敗均拒絕載入。成功前不渲染編輯內容、Save停用且submit防呆；錯誤顯示友善文字與Retry；成功才設定id對應的ready狀態。effect清理忽略過期回應；依id/retry初始化，store更新不重設正在編輯的內容。新建仍可立即編輯。

驗證：兩項正式快照helper測試涵蓋目標/章節歸屬、網路失敗、目標不存在、真實零章節。前端121項測試、型別與建置通過。
獨立8202/3202環境先載入專用文章，撤回測試角色view權限後開啟編輯：真實403後出現友善說明、Retry、disabled Save，沒有章節欄位；恢復測試角色權限後Retry，原文章及內容載入，Save恢復可用。本輪未寫入文章，未測延遲回應/切換id瀏覽器競態或新建回歸；相關保護為讀碼證據，不與真實畫面混列。

重跑測資：seed_km_review.py → seed_km_permission_ui_review.py；seed_km_load_review.py撤回fixture角色view，傳 --env KM_REVIEW_ALLOW_VIEW=1 恢復。只允許isolated_stack.py seed環境。

使用者8198/3198未動、未改業務權限規則、未commit/push/部署。

專用8202/3202堆疊驗證後已拆除。
