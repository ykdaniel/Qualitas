# NOI-ITR-DESKTOP-REVIEW-2026-001 — 審閱發現（只觀察，未改程式）

日期：2026-10-07（約 15:40–15:55Z）。審閱者：Claude（執行者自行走查，非獨立審查）。
環境：新建隔離堆疊 backend `127.0.0.1:8290`、vite `127.0.0.1:3290`（run `b22ccf95`）；種子 `backend/scripts/verification/seed_noi_itr_desktop_review.py`（本批新寫；舊的 `seed_noi_itr_ux_review.py` 沒有 ITP、帳號沒有 ITP 權限、文字為短標籤，故未沿用）。帳號 `site_engineer`（noi／itr view·create·update、itp／ncr／contractors view），一次性密碼存 scratchpad。
瀏覽器：Claude 內建瀏覽器，視埠模擬 1440×900。量測以頁內 JavaScript 讀取 DOM；截圖於 `NOI-ITR-DESKTOP-REVIEW-2026-001-evidence/`。

## 避免重複：先讀的既有紀錄
由子代理整理既有交接與 BACKLOG（摘要於本文末）。下列已修或已驗收，不再回報：Related Documents 開啟精確 ITR 與返回 `/noi`、未存變更提示、聯絡資訊自動帶入與提示、ITR 標頭「From NOI」唯讀、複驗 ITR 的 RE-INSPECTION 標籤、Q-Workflow 欄位與步驟文字。

## 走查路徑（實測）
1. `/noi` → Add New NOI：Contractor 預設為第一個廠商「廠商A」（系統預設示範廠商，非本專案廠商），聯絡人／電話／Email 自動帶入其資料；ITP 選單只有「Select」（截圖 `02`）。改選「Formosa Heavy Structural…」後，聯絡資訊改帶入正確廠商並顯示「Filled from the contractor's info — you can edit it.」，ITP 選單出現 `QTS-NDR1-ITP-000001`。
2. 填 Subject（147 字元）、Issue／Inspection Date、Inspection Time `14:30`、Event # `B2`、Checkpoint `H`；未填齊時 Save 為停用、tooltip「Fields marked with * are required」，欄位紅框；填齊後可存（截圖 `03`）。Save 後彈窗關閉，產生 `QTS-FHS-NOI-000001`（本次量測時未擷取到 toast；這只是觀察限制，不代表系統沒有成功提示）。
3. 重新開啟：Reference no.、Contractor、ITP、Subject、Event #、Checkpoint、Status `Open` 皆正確；底部 Related Documents 的 Upstream 顯示 ITP 編號＋完整名稱與狀態；無 Downstream；彈窗按鈕為 Print／Export Word／Cancel／Save，**沒有建立 ITR 的入口**（截圖 `04`）。
4. 現有入口：`/itr` → Add New ITR → 「NOI no. (Source)」選擇 `QTS-FHS-NOI-000001` → Contractor、Subject（前綴 `ITR-`）、Related ITP、Inspection Date、Due Date 自動帶入並標「From NOI」唯讀（截圖 `05`；已驗收行為）。
5. 另選已有一筆 In Progress ITR 的 `QTS-NDR1-NOI-000002` → 無任何提示 → Save 成功，建立 `QTS-FHS-ITR-000001`；API 確認 NOI-000002 現有兩筆 `isReInspection=false`、皆 In Progress 的 ITR；NOI-000002 的 Related Documents Downstream 並列兩筆（截圖 `06`）。
6. NOI-000003：原始 ITR（Reject）、複驗 ITR（顯示 RE-INSPECTION 標籤）、NCR 並列（截圖 `07`，既有行為，未回報）。

---

## 發現 1：選擇來源單據時只看得到編號（NOI 的 ITP、ITR 的 NOI）
- **分類**：UX 改善
- **操作與畫面（實測）**：
  - Add NOI → ITP no. 選單選項為 `["Select","QTS-NDR1-ITP-000001"]`，沒有 ITP 名稱。
  - Add ITR → NOI no. (Source) 選單選項為 `["Select NOI","QTS-NDR1-NOI-000001","…000002","…000003","QTS-FHS-NOI-000001"]`，沒有 Subject、檢驗日期或 Event #。
  - 同一筆 ITP 的完整名稱其實已載入：存檔後 NOI 底部 Related Documents 會顯示「Structural Steel Erection and Welding Inspection and Test Plan for Warehouse Block B Superstructure」（截圖 `04`）。
- **使用者影響**：第一次使用的工程師必須記得編號，或離開表單去查；同一廠商有多份 ITP、同一專案有多筆 NOI 時，容易選錯來源，而選錯會連帶帶入錯誤的 Subject／ITP／日期（ITR 這些欄位唯讀，要改只能換來源）。
- **最小改善**：選項文字改為「編號 – 名稱／Subject（截斷）」，NOI 選項可再加檢驗日期；`value` 維持編號，不改資料與保存。
- **重複性**：未在 BACKLOG／交接找到相同項目。

## 發現 2：已有 ITR 的 NOI 可再建一筆並行的普通 ITR，且畫面沒有任何提示
- **分類**：待確認業務規則（是否允許）＋ UX 改善（至少要讓使用者知道）
- **操作與畫面（實測）**：Add ITR → 選 `QTS-NDR1-NOI-000002`（已有 `QTS-NDR1-ITR-000001`，In Progress）→ 無警示 → Save 成功建立 `QTS-FHS-ITR-000001`。之後 NOI-000002 的 Related Documents 並列兩筆 In Progress ITR，標題相近，沒有標籤區分（截圖 `06`）；對照 NOI-000003 的複驗 ITR 有 RE-INSPECTION 標籤（截圖 `07`）。
- **讀碼（未改）**：`ITRService.create_itr` 前段沒有「同一 NOI 已有 ITR」的檢查；ITR 表單的 NOI 選單沒有過濾或標示已有 ITR 的 NOI。
- **使用者影響**：建立時畫面未提示該 NOI 已有 ITR；之後 NOI 底下可見兩筆不同編號的普通 ITR。兩筆是否都有效、是否應限制數量，待業務確認（可能有合理的多筆需求）。對 Q-Workflow 與 NOI 結案判斷的影響未測，不作為已確認影響。（2026-10-07 依審查更正：原寫「無法判斷哪一筆才是有效紀錄」，推定只有一筆有效，予以撤回。）
- **最小改善**（依業務規則二擇一，需使用者決定）：
  - 若「一個 NOI 只應有一筆普通 ITR（失敗走複驗）」：NOI 選單標示或排除已有普通 ITR 的 NOI，後端同步拒絕。
  - 若允許多筆：選到已有 ITR 的 NOI 時顯示提示（例如「此 NOI 已有 1 筆 ITR：QTS-…」）並要求確認，Related Documents 標示建立順序。
- **重複性**：未找到相同項目；與 BACKLOG #32（ITR→ITR、ITR→NCR 等缺少關聯連結）相關但不同。**現有行為不代表已確認政策。**

## 發現 3：Event # 與 Checkpoint 要手動重打，雖然選定的 ITP 已有這些資訊
- **分類**：UX 改善（Checkpoint 取哪一方的 VP 屬待確認業務規則）
- **操作與畫面（實測）**：選定 ITP 後，Event # 仍是空白的自由文字輸入（無 datalist、無 placeholder、無提示），Checkpoint 仍為「Select」；Checkpoint 選項為 `R / MS / W / H`。種子 ITP 的項目為 A1、B1、B2，且各有 VP（例如 B2 為 Sub H／Main H／Emp H）。
- **使用者影響**：工程師要另外打開 ITP 查項目編號與 Hold/Witness 點再手打；打錯（如 `B 2`、不存在的編號）時畫面不會提示，手填可能與 ITP 項目編號不一致；目前是否存在 NOI 與 ITP 項目之間的正式關聯契約、不一致會造成什麼影響，尚未確認。（2026-10-07 依審查更正：原寫「對應就斷了」，予以撤回。）
- **最小改善**：選定 ITP 後，Event # 提供該 ITP 項目的建議清單（編號＋活動描述），保留自由輸入；Checkpoint 先不自動帶值，只在選定項目旁顯示該項目的 VP 供參考——由誰的 VP 決定 Checkpoint 需另行確認。
- **重複性**：與 BACKLOG「P4 — ITP ↔ NOI scheduling + Hold/Witness points」方向重疊（P4 為大型路線圖：由 H/W 點產生 NOI、排程日曆，未開始）；本項是其中很小的一步，不等於 P4。

---

## 其他觀察（未列入前三，供參考）
- 新建 NOI 預設選第一個廠商並帶入其聯絡資訊（實測為示範廠商「廠商A」）：已知現有行為（`ITP-AUTOFILL-INVENTORY-2026-002` 記為無業務意義），非已確認政策；與發現 1 疊加時更容易選錯。
- NOI Subject 輸入框在三欄中只占 384px，147 字元的主旨需要 934px（實測）；與已 PASS 的 ITP Subject 加寬同類問題。
- 新建 NOI 時「NCR Reference no.」排在 Subject 前且標必填星號，但預設只有 N/A，對第一次建單的人意義不明。
- Save 後彈窗直接關閉，彈窗內看不到剛產生的 NOI 編號，要回列表找（本次量測未擷取到 toast，不等於系統沒有成功提示）。
- NOI 列表的 Subject 欄很窄，長主旨換成 5–6 行（截圖 `01`）。

## 未測
- 手機與 NCR 照片 UX（延期）。
- Q-Workflow 在「一個 NOI 兩筆普通 ITR」時的步驟判斷；NOI 結案在此情況下是否被阻擋。
- 從 ITR 返回 NOI 的路徑（已驗收，未重跑）；權限、聯絡資訊帶入、導航、保存的既有驗收（未重跑）。
- 中文介面；鍵盤操作；正式站。

## 子代理整理的既有紀錄（節錄來源）
`NOI-ITR-NAV-2026-001/002-handoff.md`、`NOI-ITR-UX-2026-002-handoff.md`、`NOI-ITR-LABEL-2026-001-handoff.md`、`NOI-CONTACT-AUTOFILL-2026-002/003-handoff.md`、`ITP-AUTOFILL-INVENTORY-2026-002-handoff.md`、`ITR-INPUT-UX-IMPLEMENT-2026-003/005-handoff.md`、`BACKLOG.md` #32（約 2022 行）、P4（834 行）、DECISIONS.md「尚未決策」。
