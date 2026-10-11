# CONTRACTOR-PERSONNEL-2026-001 — STATUS（獨立審查 REVISE → 修正後覆審 PASS）

TASK_ID: CONTRACTOR-PERSONNEL-2026-001 · 基準：d78e9023（MEETING-TABS R16 之後）· 程式 444c94e1；表格篩選修正與文件接其後本地提交；未推送、未部署。

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/models.py` | 新 class `ContractorPersonnel`（表 `contractor_personnel`：id、contractor_id FK→contractors.id ondelete RESTRICT、name、position、email、phone、is_active、created_at、updated_at）；索引 (contractor_id, is_active)、唯一索引 (contractor_id, lower(name))。啟動時 create_all 建立（同 AuditTemplate），既有表不變。 |
| `backend/schemas.py` | ContractorPersonnelCreate／Update（name 必填去空白、長度上限 name/position 120、email 200、phone 60）、ContractorPersonnel、ContractorPersonnelOption（只有 id／contractor_id／name／position）。 |
| `backend/services/contractor_service.py`（CRLF 保留） | list／options／create／update personnel，全部經 `_company_in_scope`（廠商範圍帳號只限自己公司，其餘視為不存在）；同公司名稱不分大小寫唯一（服務先檢查，資料庫唯一索引擋同時送出，皆回 400）；create／update 寫 audit log；`delete_contractor` 在既有引用檢查後，若公司有人員（含已停用）→ ValueError → 400「請改為停用」。 |
| `backend/routers/contractors.py`（CRLF 保留） | `GET /contractors/personnel/options`（任何登入者）、`PUT /contractors/personnel/{id}`（manage）、`GET /contractors/{id}/personnel?include_inactive=`（view）、`POST /contractors/{id}/personnel`（manage）。宣告在 `/{contractor_id}` 之前。沒有刪除端點。 |
| `react-app/src/services/api.ts` | 4 個人員 API 函式與型別。 |
| `react-app/src/components/Contractors/ContractorPersonnel.tsx`（新） | 公司表單內「人員」區塊：姓名／職稱／Email／電話／在職；新增、✏️ 修改（✓／✕／Esc）、停用／重新啟用；預設隱藏已停用（「顯示已停用 (n)」）；只有 manage 權限可編輯；變更立即儲存；欄位在 contractor 表單內，Enter 不會送出表單。 |
| `ContractorModal.tsx` | 已存檔的公司才顯示人員區塊。 |
| `Contractors.tsx` | 刪除被拒原本完全沒提示 → 顯示原因（有人員時用中英文訊息）；`handleEdit` 空值轉成 ''（修正 React 非受控輸入警告；資訊：編輯後存回時原本的 null 會變 ''）。 |
| `react-app/src/components/MeetingMinutes/AttendeePicker.tsx`（新） | 出席人員新增列：公司（啟用中的公司，以縮寫顯示，打全名也可）→ 姓名（該公司在職人員下拉，也可打字）→ 職稱（選到名單上的人時帶入，可改）→ ＋。名單外的人：有 contractors:manage 且公司在清單上時，顯示「加入 {公司} 人員名單」；加入失敗仍以文字加入並提示。新增進行中停用輸入。存 { company（縮寫）, name, role, contractorId?, personnelId? }。 |
| `MeetingMinutesModals.tsx` | 改用 AttendeePicker；其餘不變。 |
| `react-app/src/store/meetingMinutesStore.ts` | Attendee 型別加 contractorId／personnelId（可選）。 |
| `LanguageContext.tsx`（CRLF） | contractors.personnel.*（21 鍵）與 meetingMinutes 出席人員 5 鍵，中英。 |
| `DECISIONS.md` | 新條目「公司人員名單與會議出席人員」。 |
| 測試 | `backend/tests/test_contractor_personnel_http.py`（新）、`react-app/tests-browser/contractor-personnel-review.mjs`（新）、`backend/scripts/verification/seed_contractor_personnel_review.py`（新，隔離環境用）。 |

## 附帶修正：列表篩選完全比對（協調中心轉「列印和 Word」工作階段的發現）
- `MeetingMinutes/columns.tsx`（狀態、廠商兩欄）與 `Contractors/columns.tsx`（狀態欄）的 filterFn 由 `value.includes(row.getValue(id))` 改為 `!value || row.getValue(id) === value`。已確認三者都是 DataTableColumnHeader 的單選 Select（篩選值是字串，選「全部」時為 ''）：舊寫法把字串當成子字串比對，空值列（`'x'.includes('')`）會被篩進來，部分名稱也會被當成符合。
- 驗證：tsc 乾淨、ESLint 乾淨；**讀碼，未另寫瀏覽器測試**（篩選 UI 為 Radix Select，既有測試未涵蓋）。

列印與 Word：未改（出席人員本來就只用 company／name／role 文字）。meeting 表未改（attendees 為 JSON）。

## 驗證（實測）
- 獨立審查：第 1 次 REVISE（必改：contractors.py／contractor_service.py 被整份改成 LF → 已以二進位還原 CRLF，diff 只剩新增行）；建議 2–5 已處理（資料庫唯一索引、欄位長度上限、只比對啟用公司、新增中停用輸入）；覆審 PASS。
- 提交前把暫存內容（index）匯出到暫存目錄單獨測試：人員／廠商選項／會議記錄後端 **36 passed**、tsc 乾淨——確認不依賴其他工作階段未提交的修改。
- 後端（本機 3.14，臨時資料庫）：新測試 **9 passed**（管理與停用、名稱必填／唯一／長度、權限 403、選項只回在職且無聯絡資料、廠商範圍、刪除有人員的公司 400、資料庫唯一索引、啟動在舊資料庫補建表與索引）；既有廠商相關 **70 passed**、列資料表的測試 **75 passed**；後端全套：見下。
- 前端：tsc 乾淨；ESLint（修改的檔案）乾淨；`npm test` 164／0。
- 隔離環境瀏覽器（8344／3344）：`contractor-personnel-review.mjs` **34/34**（廠商頁新增／重名被拒／✏️／Esc／Enter 不送出表單／停用／沒有刪除／有人員的公司刪除被拒並提示；會議選公司→選人→職稱帶入、全名可用、勾「加入名單」後名單出現、空名單公司提示、清單外公司無勾選、存檔內容＝快照＋id、事後改名不影響會議、舊會議文字出席人員照常；只有會議權限者無勾選且看不到完整名單；TECO 範圍帳號只見 TECO）；會議回歸：分頁 **201/201**、列印 **8/8**、MEETING-FIX **28/28**。
- 後端全套（本機 3.14，臨時資料庫）：**2537 passed、3 skipped**（49 分 30 秒）。於 MEETING-TABS R17（1d0457d1／f3184711）提交後執行，工作區當時另含 audit 工作階段未提交的修改。第一次執行未卡住、只是耗時長，當時以為停住而中止，第二次完整跑完。
- **未做**：Python 3.11 全套（協調中心排程）；使用者預覽。
- 審查資訊（未處理）：換公司後同名的人不會自動對上（需重打名字）；已建過此表的舊預覽資料庫不會補建唯一索引——預覽請用新的隔離環境。

## 上線注意
- 新表由啟動 create_all 建立，**後端需重建**；不改既有表。
- 正式站 contractors 只有 Hailong（HL）、TBC、廠商B、廠商C，**沒有 TECO**：業主／本公司需由使用者上線後在廠商管理新增，再填人員名單。舊會議的出席人員仍是文字，不會自動對應。
- 部署批次：在 MEETING-FIX＋MEETING-TABS 之後另一批。
