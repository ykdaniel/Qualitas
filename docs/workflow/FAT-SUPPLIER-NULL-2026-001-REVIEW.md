# FAT-SUPPLIER-NULL-2026-001 REVIEW

TASK_ID: FAT-SUPPLIER-NULL-2026-001
審查者：獨立 Claude 審查代理（本工作階段開出，唯讀，只看 `git diff 26e454d9`、新檔與 evidence）。

## R1 結論：PASS with notes

| # | 等級 | 項目 | 處理 |
|---|---|---|---|
| 1 | Low（範圍外，屬 B2） | `FAT.tsx` 新建時 `supplier: updates.supplier \|\| defaultSupplier`：沒選供應商會自動填第一個 active 承包商，所以 UI 新建幾乎不會看到 `FAT_SUPPLIER_REQUIRED`（只有承包商清單為空時）；「沒選卻被存成某個承包商」仍可能發生 | 已通報協調中心，交 NOI B2 決定（create 路徑屬 B2） |
| 2 | Low | 新建時供應商檢查在 `enforce_create_scope` 之前：沒有專案的非承包商帳號，供應商無效回 400、有效才回 403，可試探承包商名稱是否存在 | 記錄。承包商名稱本來就能從承包商清單取得 |
| 3 | Low（行為變更） | 承包商已被刪除的 FAT 在 UI 編輯時，表單送 `supplier: ''`，回 400「請選擇供應商」，一定要重選才能存 | 刻意設計（測試已寫明），預覽時請使用者確認 |
| 4 | Low（證據） | 後端全套證據檔當時是空的 | 全套跑完後補進 STATUS |
| 5 | Low（證據） | build 證據沒有 bundle grep 輸出 | **已補**：`frontend-vite-build.txt` 末尾，兩個 code 都在 `index-BxFAWY8-.js` |
| 6 | Low（證據） | `repro.sh` 沒有 after-fix 的 legacy 段落 | **已補**：`repro.sh` 加上 `seed legacy`＋list／search |
| 7 | Low（既有） | `FAT` 回應 docstring「every stored row must be listable」說過頭：格式錯的 `detail_data`／`attachments`（API 外寫入）仍會 500 | **已改** docstring 措辭；行為不變 |
| 8 | Low（既有） | `sanitize_search_term` 跳脫 `%`／`_` 但 `ilike` 沒有 `escape=`，SQLite 搜 `100%` 找不到字面值；新的供應商搜尋同樣如此 | 既有問題，不在本批；無 SQL injection（參數化） |

審查者已驗證（摘要）：pydantic 2.12.5 的同名 validator 確實取代父類別（不是兩個都跑）、`FATCreate` 仍擋格式／順序／缺欄位；`FATUpdate.reject_null` 只對明確 null 觸發；只有承包商帳號跳過供應商檢查，且一定被 `enforce_create_scope` 改成自己的承包商；沒有其他會把 vendor_id 寫成 NULL 的路徑；Refusal → 400、ScopeForbidden 仍 403；CRLF 全數保留（`--ignore-cr-at-eol` stat 相同）；`fatStore.ts` 未動；LanguageContext 只加 2 鍵×中英；前端其他讀 `fatList` 的地方遇到 null 都安全；實跑 208 passed、tsc 0、npm test 198/198；evidence 與 STATUS 一致。

審查者未驗證：後端全套與 Python 3.11、瀏覽器實測、隔離環境 API 重跑（依規定不啟動 server）、其他模組。

## R2（delta）結論：PASS with notes

範圍：R1 之後的變更——審查 #1 依使用者決定「拿掉預設，必填」（`FAT.tsx` 新建分支）、#5／#6／#7 的證據與 docstring 修正、STATUS R2 段。

| # | 等級 | 項目 | 處理 |
|---|---|---|---|
| 1 | Low（文件） | 預覽用 `react-app/tests-browser/fat-supplier-null-vite-launcher.mjs`（3263 → 8263，獨立 cacheDir）未列在 STATUS | **已補**：STATUS 列出，照慣例一起提交 |
| 2 | Low（清理） | evidence 底下工具留下的空目錄 `.claude/.cc-writes/` | **已刪**（確認裡面沒有檔案） |

審查者已驗證：`getActiveContractors` 仍被使用（第 268、578、659 行），eslint／tsc 0；不會彈兩次窗（`handleSaveFATDetails` 無 catch、`fatStore` 只 set error 再拋、`api.ts` interceptor 只處理 401，只剩 `FATEditModal.handleSave` 的 `showRefusal`）；新建時 supplier 沒有其他自動填值路徑（formData 初值 `''`、select 第一項 `value=""`）；R2 只動了新建分支的 supplier 幾行，`newItem` 其他欄位與 `fatStore.ts` 未動；`schemas.py` 只改 docstring；CRLF 仍全數保留（stat 與 `--ignore-cr-at-eol` 相同，99+／18-）；證據與 STATUS 一致；實跑 tsc 0、eslint 0、npm test 198/198。

審查者未驗證：瀏覽器實測（依 STATUS 紀錄）、vite build 重跑、後端全套與 Python 3.11（R2 未改後端邏輯，R1 的 208 passed 仍適用）。
