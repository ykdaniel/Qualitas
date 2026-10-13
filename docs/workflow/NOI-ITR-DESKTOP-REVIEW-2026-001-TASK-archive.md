# TASK.md — NOI 填表與接續 ITR 的桌面操作審閱（只觀察）

TASK_ID: NOI-ITR-DESKTOP-REVIEW-2026-001
SOURCE: 使用者經 GPT 轉交（2026-10-07）。

## 前一任務狀態（保留）
- `ITP-SUBJECT-WIDTH-2026-001`：R2 PASS，已逐字封存（`docs/workflow/ITP-SUBJECT-WIDTH-2026-001-R2-PASS-*`，另保留 `R1-REVISE-*`），8280／3280 已拆除。本輪開始前再次核對封存雜湊一致。
- 其他 ITP 批次 PASS 未部署；`DOCX-PATH-GUARD-2026-001` 產品 PASS 未部署；`NOI-EXPORT-DOCX-2026-001` REVISE。

## 性質
**只觀察、提出改善，不修改產品程式碼。**

## 走查（以第一次使用的現場工程師角度，桌面）
1. 新建 NOI：選 Project／Contractor／ITP，填 Subject、檢驗日期時間、Checkpoint 與聯絡資訊。
2. 保存並重新開啟：能否辨識所選廠商、ITP、已保存內容與目前狀態。
3. 從 NOI 接續建立或查看 ITR：沿用現有入口；觀察紀錄身分、來源資料與下一步是否清楚。沒有入口就如實記錄，不自行新增流程。

## 審閱重點
欄位順序與長文字空間；已存在卻需重填的資訊、自動帶入與不可編輯欄位是否易懂；必填／錯誤提示／保存狀態；NOI → ITR 是否能辨識開的是哪筆、完成後回哪裡。

## 測資（新建獨立隔離環境，真實長度）
- 尚無 ITR 的 NOI；已有一筆 ITR 的 NOI；有原始 ITR 與複驗 ITR 的 NOI。

## 限制
- 先讀相關 BACKLOG／交接，避免重複回報已修問題；不重跑已接受的權限、聯絡資訊帶入、導航、保存驗收，只驗證本次觀察所需路徑。
- 不改產品程式；不把現有行為稱為已確認政策；不自行修正或延伸範圍。
- 手機、NCR 照片 UX 延期。8240／3240、8198／3198、開發／正式資料庫不碰。不 commit／push／部署。

## 交付
- 最多三項有價值的發現（不湊數），每項：操作步驟、實際畫面與使用者影響；實機證據（讀碼推論另標）；分類（程式缺陷／UX 改善／待確認業務規則）；最小改善方案；是否與既有待辦重複。
- 更新 STATUS／handoff，保存截圖，列出未測事項；REVIEW.md 待獨立審查。
- 核對身分後拆除本批自建隔離環境。

## ALLOWED_PATHS
- `docs/workflow/`（證據、handoff）、`backend/scripts/verification/`（本批隔離種子，若需要）、`react-app/tests-browser/`（隔離啟動器）
- `TASK.md`／`STATUS.md`／`REVIEW.md`
