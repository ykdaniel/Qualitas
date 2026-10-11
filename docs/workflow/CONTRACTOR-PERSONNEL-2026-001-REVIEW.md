# CONTRACTOR-PERSONNEL-2026-001 — REVIEW

## 第 1 次：REVISE
必改：`backend/routers/contractors.py`（84 行）與 `backend/services/contractor_service.py`（197 行）由 CRLF 被整份改成 LF，diff 灌水（+438／−281，實際 +157）。
確認正確：所有人員操作經 `_company_in_scope`（有範圍的管理者改別家人員 404、options 對別家回空）；options 只回 id／contractor_id／name／position；`/personnel/*` 宣告在 `/{contractor_id}` 之前；create_all 補建表與索引、FK RESTRICT；刪公司先查既有引用再查人員數，皆在寫入前回 400；名稱唯一不分大小寫、含已停用、改名排除自己，空白 422；離開提醒不受新 id 欄位影響；防連點有效、加入名單後快取補上。
建議：2 名稱唯一無資料庫約束；3 欄位無長度上限；4 AttendeePicker 會比對到停用公司；5 新增中輸入框仍可編輯；6 換公司後同名不自動對上。資訊：handleEdit 空值轉 '' 使存回時 null 變 ''。

## 覆審：PASS
CRLF 已恢復（142／142、305／305），diff 只剩 +58／+108；唯一索引 (contractor_id, lower(name)) 正確，flush 的 IntegrityError 轉 400、外層 rollback 正確；長度上限已加；公司比對改用啟用清單、新增中停用輸入。
資訊（未處理，已記 STATUS）：已建過此表的舊預覽資料庫不會補建唯一索引（正式站尚無此表，不受影響）；max_length 比的是去空白前的長度；建議 6 未做。
