# ITP-AUTOFILL-INVENTORY-2026-002 — 填表效率盤點補正（純讀查核）

延續 ITP-AUTOFILL-INVENTORY-2026-001（REVISE，完整原文見
`docs/workflow/ITP-AUTOFILL-INVENTORY-2026-001-archive.md`）。本輪補 R1-R3，**仍是
純讀查核**，未修改任何產品程式碼、未建立任何資料。

## 一、事實：已存在可沿用的既有行為（上一輪漏掉或講錯，本輪更正）

| 行為 | 證據 |
|---|---|
| ITP／NOI 新建記錄都預選「第一個 active 廠商」 | `ITP.tsx:114-117`（`newItpDefaultVendor = getActiveContractors()[0].name`）；`NOIDetailModal.tsx:80-81, 92`（`getInitialData` 同樣取 `activeContractors[0].name`） |
| NOI 的 ITP No. 清單依**已選的** Contractor 篩選，不是反過來 | `NOIDetailModal.tsx:47, 107-110`：`filteredITPList = getITPByVendor(formData.contractor)`；Contractor 空白時 `getITPByVendor('')` 回傳空陣列。方向是「先有廠商才能選 ITP」，上一輪「選 ITP 補廠商」的建議方向與現況相反 |
| ITP 新建時 `submissionDate` 預設今天 | `ITPModals.tsx:185`：`submissionDate: existingItem?.submissionDate \|\| new Date().toISOString().split('T')[0]` |
| Inspection Plan 已有「複製既有項目」輸入輔助 | `ITPAdvancedEditor.tsx:108-117`（`handleCopyClick`）：複製整列內容，重設 `id`／`record`，開啟編輯對話框讓使用者確認後才真正加入，不是靜默複製 |
| `submit` 欄位**有**被讀取與保留，只是沒有可見輸入元件 | `ITPModals.tsx:182`：`submit: existingItem?.submit \|\| ''` 寫入 formData；`itpStore.ts:27, 122` 的型別與列表映射都有這個欄位。**撤回**上一輪「沒有前端引用／疑似死欄位」的說法——正確說法是「保留讀寫，但目前沒有讓使用者在畫面上看到或編輯它的輸入元件」 |

**排序依據**：`getActiveContractors()`（`contractorsStore.ts:124`）只做
`status === 'active'` 過濾，沒有任何排序；後端 `contractors` 的列表端點也沒有
`ORDER BY`（已讀 `backend/routers/contractors.py`／`repositories/
contractor_repository.py` 確認）。所以「第一個」實際上等於「資料庫回傳順序裡
最前面的那家」，不代表任何業務意義（不是常用、不是最近使用、不是與這個專案
相關）。

## 二、撤回的建議（上一輪提出，本輪取消）

- ~~NOI 選定 ITP No. 後補空白廠商與 Subject~~——撤回。實際操作方向是先選廠商才能
  選 ITP（見上表），「選 ITP 反過來補廠商」與現有流程相反，不是「風險最低」的
  改動。
- ~~ITP Description 自動帶入 Project 名稱~~——撤回。Project.name 與 ITP.description
  語意不同（一個是專案全名，一個是這份 ITP 自己的說明），沒有實際使用者樣本
  支持這兩者可以互填。

## 三、R2 指定的兩個查核方向

### 3a. 預選第一家廠商是否容易誤選 → **待實測問題，本輪不下結論**

讀碼只能確認「預選了什麼、依什麼順序」（見上表），**無法**單憑程式碼判斷使用者
在真實畫面上是否容易注意到這是系統預設、而非自己選的——這需要實際打開瀏覽器看
這個下拉選單呈現方式（例如有沒有特別的視覺提示、或看起來就跟使用者自己選的一
模一樣）。列為下一批若要處理需要先做的**瀏覽器驗證項目**，本輪只指出問題存在
的可能性與其資料面根因（無業務排序、純資料庫回傳順序），不建議任何修正方案。

### 3b. 預選廠商與手動選擇廠商時，聯絡資訊初始化是否一致 → **已確認：不一致**

- 預設路徑（`getInitialData`，`NOIDetailModal.tsx:80-102`）：`contractor` 被設為
  預選的廠商名稱，但 `contacts`／`phone`／`email` 三個欄位維持空字串，**不會**
  從這個預選的廠商帶入聯絡資訊。
- 手動選擇路徑（Contractor 下拉選單的 `onChange`，`NOIDetailModal.tsx:300-314`）：
  使用者只要碰一下這個下拉選單（哪怕選的是同一家，只要觸發 `onChange`），就會
  依既有邏輯 `contacts: prev.contacts || selected?.contactPerson || ''` 把聯絡
  資訊帶進來（僅在目前欄位空白時）。
- 本檔案沒有任何 `useEffect`（已確認），所以不存在任何掛載時自動同步聯絡資訊的
  機制——這個落差是真實存在的，不是臆測。

**結果**：如果使用者從頭到尾都沒有去動 Contractor 這個下拉選單（因為它看起來
已經有值了），這筆 NOI 的 `contacts`／`phone`／`email` 會是空的，即使選單裡顯示
的廠商其實已經有完整的聯絡資訊可以帶。

## 四、保留的候選（1 項，不湊數）

### 候選：讓「預選廠商」的初始化路徑套用與「手動選擇」相同的既有非破壞性帶入邏輯

這**不是**新的自動填值邏輯，是讓一段已經存在、已經在用的邏輯（`prev.x ||
selected?.x || ''`，只在欄位空白時才帶入）多套用一個觸發點，讓兩條路徑行為一致。

- **來源欄位**：`Contractor.contactPerson` / `Contractor.phone` /
  `Contractor.email`
- **目標欄位**：`NOI.contacts` / `NOI.phone` / `NOI.email`
- **觸發時機**：僅限**新建**（非編輯既有紀錄）NOI 表單初始化、且預選了某個預設
  廠商的當下——不是每次開啟表單都重算，只在這個「預選廠商已經確定、但聯絡資訊
  三個欄位仍是初始空字串」的單一時間點套用一次。
- **使用者可見提示**：本輪未設計任何新的畫面提示；若要做，建議至少讓使用者能
  一眼看出這三個欄位是系統帶入而非自己打的（例如沿用其他模組既有的「系統預設」
  視覺樣式，若有的話），這部分需要前端設計確認，不在本輪讀碼範圍內下結論。
- **換選資料或使用者已輸入時如何避免覆蓋**：直接沿用現有 `onChange` 用的同一個
  guard（`prev.contacts || ...`），只要使用者在這三個欄位打過任何內容（即使只是
  打完又刪到只剩空字串，此時 `prev.contacts` 仍是 `''`，會被視為「可以帶入」—
  這跟現有 `onChange` 邏輯的既有限制完全相同，不是本輪新引入的風險）；使用者
  之後若手動換選別家廠商，既有 `onChange` 的同一套 guard 自然接手，不需要額外
  處理。

## 五、需要使用者確認的業務語意（不是純技術問題，本輪不代為決定）

- **「新建記錄要不要預選第一家廠商」這個既有行為本身是否恰當**：目前完全沒有
  業務邏輯支撐「第一家」的意義（見上方排序依據說明）。是否該改成預設留空、或
  改成依某種業務規則排序，是產品設計決策，本輪只指出現況與其根因，不建議具體
  改法，留待使用者決定方向後再評估做法。
- **候選項目需不需要畫面提示「這是系統帶入」**：涉及前端視覺設計慣例，本輪未
  讀到任何既有的「系統預設值」樣式可以直接沿用，需要先確認專案裡有沒有這類
  既有模式。

## 六、本輪範圍確認

全程未修改任何產品程式碼、未建立任何正式或測試資料、未新增任何必填規則、未覆蓋
任何使用者輸入、未改變歷史 ITP／NOI 的顯示內容。本批不重跑瀏覽器、不建資料，只
讀碼。

---

## 更正（獨立審查 PASS 後補註，2026-10-04）

獨立審查指出第四節候選段落最後一句「使用者之後若手動換選別家廠商，既有
`onChange` 的同一套 guard 自然接手，不需要額外處理」**不成立，予以撤回**。原文
保留未刪除，更正如下：

`prev.contacts || selected?.contactPerson || ''` 這個 guard 判斷的是「NOI 自己
的 `contacts` 欄位**現在**是不是空字串」，不是「這個值是系統帶的還是廠商 A 的還
是廠商 B 的」。實際情境：使用者選了廠商 A → `contacts`／`phone`／`email` 依既有
邏輯從 A 帶入（因為當時是空的）→ 使用者**改選**廠商 B，但沒有手動去清空這三個
欄位 → 此時 `prev.contacts` 等既有值已經**不是空字串**（是 A 的聯絡人），guard
判斷為「已有值，不覆蓋」，於是這三個欄位**繼續顯示 A 的聯絡資訊**，即使畫面上的
Contractor 下拉選單已經確實換成了 B。這是一個真實存在的廠商／聯絡人錯配風險，
不是臆測；「只填空欄」原本是為了保護使用者自己打的字不被蓋掉，但同一個 guard
套用在「使用者還沒打過字、只是系統自動帶過另一家廠商的資訊」這種情況時，反而會
讓錯的資訊被保留下來。這個風險在下一批
（`docs/workflow/ITP-AUTOFILL-INTERACTION-2026-001-handoff.md`）的互動方案裡
正面處理。
