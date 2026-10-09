# ITP-AUTOFILL-INVENTORY-2026-001 — ITP 輸入欄位與基本資料自動帶入盤點（純讀查核）

本批**純讀查核**，未修改任何產品程式碼、未建立任何正式或測試資料。目標：逐欄核對
ITP 基本資料與既有廠商（Contractor）、專案（Project）主檔的實際欄位，找出哪些資料
已有來源卻沒有自動帶入，整理可決策的優先順序建議。

## 一、主檔實際欄位（讀碼確認，不假設）

**Contractor**（`backend/models.py:559-571`）：`id, package, name, abbreviation,
scope, contactPerson, email, phone, address, status`——共 9 個資料欄位，前端
`ContractorModal.tsx` 全部可編輯，沒有欄位被隱藏。**沒有**合約號碼、證照、有效期限
等欄位。

**Project**（`backend/models.py:610-619`）：`id, name, code, description, owner,
created_at`——共 5 個資料欄位。`owner` 是純文字欄位（業主名稱），**不是**關聯到
使用者或聯絡人的外鍵。**沒有**電話、聯絡人、合約等欄位。

**Project 與 Contractor 之間沒有直接關聯表**（讀碼確認 `models.py` 無
`ProjectContractor` 或類似 junction table）——系統目前無法直接查出「這個專案配合
哪些廠商」，只能從既有 ITP／NOI 等紀錄的 `project_id`+`vendor_id` 組合反推。

## 二、ITP 表單逐欄對照表

| 欄位 | 目前輸入方式 | 資料來源 | 現有行為 | 備註／建議方向 |
|---|---|---|---|---|
| Project | 下拉選單（僅新建時出現，`ITPModals.tsx:647-648`） | `GET /projects/` | 選了不影響其他欄位 | ITP 本身沒有可承接 Project 相關資訊的欄位，暫無可帶入空間 |
| Reference No. | 唯讀 | 系統自動產生 | 已自動 | 無需改動 |
| Description | 自由輸入文字（`:663-669`） | 無主檔來源 | 完全手打，常與 Project 名稱語意重疊 | **候選＃3**：可用 Project.name 作非強制初始值 |
| Contractor | 下拉選單（`:672-685`） | `GET /contractors/`，**全部** active 廠商，未依 Project 篩選 | 選了不影響其他欄位（ITP 無聯絡資訊欄位可帶） | **候選＃2**：清單可依本專案既有紀錄優先排序 |
| Submission Date | date input（`:687-700`） | 無主檔來源 | 手動輸入 | 無建議 |
| Due Date | date input（`:701-710`） | 無主檔來源 | 手動輸入 | 無建議 |
| Rev | 下拉選單（寫死 `REV_OPTIONS`，`:133, 711-743`） | 硬編碼清單 | 無主檔概念 | 無建議 |
| Status | 下拉選單（`:778-841`） | 硬編碼狀態機 | 依既有業務規則 | 業務規則，不在本輪範圍 |
| Remark | textarea（`:843-860`） | 無主檔來源 | 手動輸入，已有「+Add Date」小工具 | 無建議 |
| `submit`（DB 欄位） | **前端完全沒有對應輸入元件**（已逐檔搜尋 `ITPModals.tsx`／`ITPDetail.tsx`／`ITPAdvancedEditor.tsx`，無任何引用） | n/a | 看起來是未使用的既有欄位 | 不是「自動帶入」範圍，但建議另外確認是否該補上 UI 或移除，留待使用者決定，本輪不處理 |
| Attachments | 檔案上傳元件 | n/a | 既有附件流程 | 無建議 |
| Inspection Plan（`detail_data.a/b/c`，逐列：activity／standard／criteria／checkTime／method／frequency／vp） | 逐列手動輸入（`InspectionItem`，`react-app/src/types/itp.ts`） | **無主檔來源**——這些是工程規範本身的專業內容，不是重複輸入既有資料 | 完全手動 | 不建議自動帶入；這類內容本來就該由使用者依規範逐案判斷填寫 |

**下游關聯發現**（`react-app/src/components/NOI/modals/NOIDetailModal.tsx:336-337`）：
NOI 表單選擇「ITP No.」（`itpNo`）之後，`onChange` 只呼叫
`handleFieldChange('itpNo', e.target.value)`，**完全不影響** NOI 自己的
Contractor 或 Subject（`package`）欄位——即使那張 ITP 本身已經綁定了特定廠商、也
已經有一段 description。對照同一個檔案裡選 Contractor 時的既有寫法
（`:296-314`，`contacts: prev.contacts || selected?.contactPerson || ''` 這種
「只在欄位目前空白時才帶入」的非破壞性模式），ITP No. 的選擇完全沒有套用同樣的
模式，是這次盤點裡最具體、風險最低、最接近「資料已經存在只是沒接上」的落差。

## 三、最值得優先改善的三項（附具體例子）

所有三項都是「**非強制預設值**，使用者仍可自由修改或清空；只在目標欄位目前為空白
時才帶入，絕不覆蓋已輸入內容；只在使用者當下操作的那一刻讀取主檔當下的值，不會讓
主檔事後更新去改變已經存好的歷史紀錄」——完全比照 NOI 既有的 Contractor 自動帶入
模式，不新增必填規則，不重新設計保存機制。

### ＃1（風險最低、價值最高）：NOI 選定 ITP No. 後，非破壞性帶入 Contractor 與 Subject

**現在**：使用者在 NOI 表單選好「ITP No.」（例如
`QTS-ABC-ITP-000012 — 三樓樑柱鋼筋查驗計畫`），下面還要：(a) 再選一次 Contractor
——即使這張 ITP 本來就只屬於一家廠商；(b) 在 Subject 欄位從零手打一句話，常常跟
剛才選的 ITP 的 description 幾乎同義，例如又打一次「三樓樑柱鋼筋查驗」。

**改善後**：選定 ITP No. 的當下，若 NOI 的 Contractor／Subject 欄位目前是空白，
自動帶入該 ITP 的 `vendor`／`description` 作為預設值；使用者仍可整段刪除重打。
與既有 Contractor→contacts/phone/email 的自動帶入是同一套既有模式，實作風險低。

### ＃2：ITP 的 Contractor 下拉清單依「本專案既有紀錄」優先排序

**現在**：不論選了哪個 Project，Contractor 清單永遠列出系統裡所有啟用中的廠商，
使用者要自己從完整清單裡找到正確的那一家，專案與專案之間沒有任何區隔，容易選到
不相關的廠商。

**改善後**：利用該 Project 底下既有 ITP／NOI 等紀錄的 `vendor_id`，推算出「這個
專案過去真的配合過的廠商」，排在清單最前面（例如加一條分隔線「本專案常用」），
其餘廠商仍完整列在下方，不強制篩選、不新增必填規則。**注意**：目前資料庫沒有
Project↔Contractor 的直接關聯表，這個排序需要從既有紀錄反推，工作量中等，不是
純前端小改——如果要做，建議先確認這個推算邏輯（例如用哪些模組的歷史紀錄、新專案
沒有歷史紀錄時怎麼辦）。

### ＃3：ITP 的 Description 欄位以 Project 名稱作為非強制初始值

**現在**：新建 ITP 時 Description 完全空白，即使已經選好 Project（例如
「捷運三號線 CP03 標」），還是要從零開始打一串說明文字。

**改善後**：選定 Project 後，若 Description 欄位尚未輸入任何文字，自動帶入類似
「捷運三號線 CP03 標 — 」作為起手式，使用者接著打完整句子，或整段刪除重打皆可；
一旦使用者開始輸入，就不再被覆蓋。

## 四、明確排除、本輪未建議的項目

- **Inspection Plan 的逐列內容**（activity/standard/criteria 等）：這些是工程
  規範本身的專業判斷內容，沒有主檔可以對照帶入，不建議自動化。
- **ITP 的 `submit` 欄位**：資料庫有、前端完全未使用，疑似死欄位——不是自動帶入
  問題，是另一個獨立的「要不要補 UI 或移除」的決定，本輪不處理、不建議。
- **Rev／Status**：分別是硬編碼選項與既有狀態機規則，與主檔無關。

## 五、事實 vs 建議的區分

第一、二節（主檔欄位、逐欄對照表）全部是**本輪讀碼確認的事實**，附檔案與行號依據。
第三節的三項優先建議，以及第二節表格裡標註「建議方向」的欄位，是**建議，尚未決策**
——需要使用者確認是否要進入下一批實作、以及要不要調整範圍（例如候選＃2 的「本專案
常用廠商」判斷邏輯細節）。

本輪全程未修改任何產品程式碼、未建立任何正式或測試資料、未新增任何必填規則。
