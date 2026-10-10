# CONTRACTOR-OPTIONS-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: CONTRACTOR-OPTIONS-2026-001
ROUND: R1
審查日期：2026-10-10。依據：`evidence/F.patch`（SHA-256 `512045c3…caa2`，已核對一致）、基準 HEAD `c8bba156`、部署候選 `Qualitas-deploy-artifacts/CONTRACTOR-OPTIONS-2026-001/cand`（唯讀）。工作樹中另一工作階段的材料模組改動不在本輪範圍，未審查、未觸碰。

## EVIDENCE_CHECK
- **候選 = HEAD + F.patch**：審查者以 `git archive HEAD` 匯出到 `$TMPDIR`，`git apply F.patch` 後與候選 `backend/`、`react-app/` 做 `diff -rq`，無差異（`schemas.py` 的兩個新 schema 在 F.patch 內，只是該段缺 `diff --git` 標頭，不影響套用）。工作樹 `react-app/src` 與候選一致（只差 `.claude` 目錄）。
- **後端測試（審查者實跑）**：候選樹 `tests/test_contractor_options_http.py` 8 passed（`DATABASE_URL` 指向 `$TMPDIR`，`PYTHONDONTWRITEBYTECODE=1`、`-p no:cacheprovider`，未在候選留下快取）。另在 scratchpad 寫了臨時探測測試（沿用同一 fixture）：停用帳號在 `/contractors/options` 和 `/noi/contractor-contact/alpha` 都是 401；沒有角色的帳號在 options 是 200、在聯絡端點是 403；`/noi/` 列表不受新路由影響。3 個都通過。
- **前端（審查者實跑）**：`tsc --noEmit` exit 0、`npm test` 144／144。
- **STATUS 宣稱的「相關測試檔 124 passed」**：evidence 目錄裡沒有對應的輸出檔，無法核對。`py311-full-suite.txt` 也還不在 evidence 中（STATUS 有寫明還在執行，屬誠實揭露）。
- **瀏覽器證據**（`browser-contractor-options.txt` 10／10、截圖 5 張）：涵蓋只有模組權限的帳號、NOI 自動帶入的三種情境、承包商管理頁。**沒有涵蓋「開新 NOI 後直接取消」**，而下面的阻擋問題正好發生在這裡。
- **CRLF**：STATUS 列的 9 個 CRLF 檔在候選中逐行都是 CRLF；LF 檔（schemas.py、api.ts、Audit.tsx、AppProviders.tsx、Contractors.tsx）維持 LF。

## SCOPE_CHECK
**後端（通過）**
- `GET /contractors/options` 宣告在 `/{contractor_id}` 之前（第 26 行，`/{contractor_id}` 在第 35 行）。`/contractors/`、`/contractors/{id}` 仍是 `RoleChecker(CONTRACTOR_VIEW)`，未改。
- `get_current_user` → `authenticate_access_token` 會拒絕停用帳號（`core/security.py` 第 167 行 `if not user.is_active`），已實測 401。
- 範圍：綁定承包商（`vendor_id`）的帳號只回傳自己。承包商資料表沒有 project 欄位，所以綁定專案的帳號看得到全部承包商名稱，和既有的 `/audit/contractors` 一致，也符合使用者選的「登入即可讀」。
- `response_model=list[schemas.ContractorOption]` 只有 id、name、abbreviation、scope、status 五個欄位，測試也斷言了欄位集合（contactPerson、email、phone、address、package 都被去掉）。
- `AnyPermissionChecker`：檢查啟用、檢查有角色、權限交集，和 `RoleChecker` 的語意一致（兩者都沒有 admin 例外，前端 `hasPermission` 也沒有，三方一致）。
- `/noi/contractor-contact/{contractor_id}` 宣告在所有 `/{noi_id}/...` 之前。路徑有兩段，不會和 `/{noi_id}/` 撞；`contractor-contact/related` 這類路徑也會先被新路由吃掉，不會跑到 `/{noi_id}/related`。不存在或在綁定範圍外都回 404，已有測試。
- 前端型別（`ContractorOptionApi`、`ContractorContactApi`）的欄位名稱和 schema 一致（`contactPerson` 是 camelCase，和 model 欄位相同）。

**前端 store 與各模組（通過）**
- 逐一 grep 了 `useContractorsStore`／`getActiveContractors`／`fetchContractors`／`fetchOptions` 的使用處：OSD、ITP、ITR、FAT、Checklist、會議紀錄、Follow Up、儀表板、KPI（用 `scope`，選項有提供）、IAM UserModal（只用名稱）、材料頁、NCR、OBS、PQP、NOI 批次新增，都只用 id、name、scope。`MaterialStatsTile` 用 id 和名稱對應。`numberGenerator.ts`（用 abbreviation）和 `ContractorsContext.tsx` 在整個 src 中沒有任何地方 import，是既有的死碼，不受影響。各模組沒有以 `any` 讀 `contactPerson`、`address`、`package` 這些承包商欄位（grep 到的 `package` 都是 NOI 自己的欄位）。
- 狀態判斷：選項和完整清單都改用 `isActiveStatus`（不分大小寫、會去空白）。後端沒有任何地方用狀態篩承包商。前端所有 `status === 'active'` 判斷，比的都是已經標準化過的值（Audit.tsx、AuditWizard.tsx、getActiveContractors）。正式站 `Active`／`active` 的問題，這輪修得完整。
- 承包商管理頁新增、修改、刪除後會重新抓選項；進入頁面時自己載入完整清單；AppProviders 改成預先載入選項。AppProviders 在 PrivateRoute 裡面，重新登入時會重新掛載、重新抓，不會沿用上一個帳號的清單。
- Audit：auditStore 的 `contractorOptions`、`fetchContractorOptions`、`AuditContractorOption` 都已清乾淨（grep 無殘留，`api` import 仍有其他地方用到）。後端保留 `/audit/contractors`，理由是部署空窗期舊前端還能用；這個端點需要 `audit:view`、只回名稱，留著沒有風險，理由可以接受，之後再移除即可。

**NOI 自動帶入（有一個阻擋問題）**
- 和 HEAD 一致的部分：既有紀錄的聯絡欄位一律視為使用者來源、永不覆蓋，也不會發請求（fields 是空的就直接 return）；切換承包商時保留欄位的提示照舊；清空承包商不動聯絡欄位（另外讓進行中的請求失效）；預設承包商仍是選項中第一家啟用的；選項還沒載入時預設承包商是空的，和 HEAD 在清單未載入時的行為相同。
- 競態處理正確：只採用最後一次請求（序號），承包商仍是選定的那家才寫入，而且只寫當下仍是系統來源的欄位（透過 `contactSourceRef`）。StrictMode 重複執行 effect 時，前一次的結果會因序號不符被丟掉。
- **阻擋問題（行為退化）**：`useDraftGuard({ formData, ... })` 的基準值，是第一次 render 時的 `JSON.stringify` 結果（`LeaveGuard.tsx` 第 97–101 行；第 96 行的註解也寫明「只適用同步初始化的表單，非同步表單要自己提供 dirty 狀態」）。HEAD 是在初始 state 就帶入聯絡資料，所以基準值本來就包含聯絡資料。本輪改成初始化時三個欄位是空的，開啟後才非同步填入，填入之後 `formData` 就和基準值不同，`dirty=true`。結果是：使用者開新 NOI、什麼都沒改就按取消，會跳出「未儲存的變更」確認；從選單換頁會被 `useBlocker` 擋下；重新整理會觸發 `beforeunload`。只要預設承包商有任一筆聯絡資料就會發生，正式站這是常態。既有的 `tests-browser/forms-consistency-review.mjs` Part A2 第 172–173 行，正好斷言 NOI「完全空白的新紀錄按取消不會誤跳未儲存提示」，本輪的改動會讓這項既有驗收不再成立。本輪的瀏覽器檢查沒有測到這一步。

## DECISIONS_CHECK
- 使用者兩項決定都有正確落實：共用精簡端點（登入即可讀、只有挑選需要的欄位、綁定承包商的帳號只看得到自己）；NOI 聯絡資料另走端點，只給有 NOI 新增或更新權限的人，一次只讀一家。
- `/contractors/` 的權限沒有放寬；聯絡資料沒有出現在共用端點。
- 和 DECISIONS.md（HEAD 版）沒有衝突，也沒有把未確認的業務規則升格成政策。
- 非阻擋觀察：
  - 兩個 service 方法直接用 `self.repo.db.query`，沒有經過 repository，和 audit_service 既有寫法一樣，屬風格問題。
  - `console.error` 和 AGENTS 的 logger 規範不完全相符，但 repo 裡沒有 logger 工具，全專案都用 `console.error`，維持一致即可。
  - 切換承包商後到回應抵達前，聯絡欄位會短暫是空的。如果使用者在這段時間內就儲存，欄位會是空白，可以接受。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
1. **NOI 新紀錄被非同步帶入後誤判為有未儲存變更**（`react-app/src/components/NOI/modals/NOIDetailModal.tsx`）：系統自動帶入的聯絡資料不能讓 leave guard 變成 dirty，要回到 HEAD 的行為：開新 NOI、不改任何東西就按取消，不跳提示，也不擋換頁。建議做法（擇一，以最小改動為準）：
   - 交給 `useDraftGuard` 的值裡，來源仍是 `system` 的聯絡欄位用固定佔位值取代（使用者改過的欄位照常比對；切換承包商本身就會讓 `contractor` 欄位變 dirty，不受影響）；或
   - 初次帶入完成時，如果使用者還沒有其他改動，就把基準值更新成帶入後的值。

   不得改動 `LeaveGuard.tsx` 的共用語意。
2. **補瀏覽器驗證**：在 `contractor-options-check.mjs` 加一項「只能新增 NOI 的帳號開新 NOI，等聯絡資料帶入後按取消，不出現 Unsaved Changes 且視窗關閉」。另外要有一項「自己改過一欄再取消，仍會跳提示」，證明 guard 沒有被整個關掉。並在候選樹上重跑 `forms-consistency-review.mjs` 的 NOI 新紀錄取消段落（或同等檢查），結果放進 evidence。
3. **補後端測試輸出**：把 STATUS 所稱「相關測試檔 124 passed」的實際輸出存進 evidence（現在只有文字宣稱）。建議順手把停用帳號（options 和聯絡端點都 401）、沒有角色（聯絡端點 403）納入 `test_contractor_options_http.py`。審查者的臨時探測已確認行為正確，所以這是補證據，不是修 bug。

## NEXT_STEP
- 依 REQUIRED_FIXES 修正後重新產生 F.patch 與候選樹，STATUS 更新為 R2（列出實際修改和執行證據），再送獨立審查 R2。後端與 NOI 以外的前端部分，本輪審查沒有發現問題，R2 可以只聚焦在 NOI 的 guard 修正和新增的證據。
- Python 3.11 完整測試通過仍是部署前提，請把結果放進 evidence。
- 未提交、推送或部署；本輪不得依 PASS 常設授權部署。
