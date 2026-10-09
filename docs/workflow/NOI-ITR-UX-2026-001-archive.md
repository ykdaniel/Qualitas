# NOI-ITR-UX-2026-001 — 封存（原文保留，無密碼內容需遮蔽）

本檔封存 NOI-ITR-UX-2026-001 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。依 AGENTS.md
規則，原文保留，不因後續審查結果修改內容。REVIEW.md 判定為 REVISE，R1/R2 列於下方，將由
NOI-ITR-UX-2026-002 處理。問題 1（導航缺陷）已被審查接受為已重現缺陷，不重開；問題 2 的
分類需更正為「已觀察到的 UX 辨識改善」，不是資料錯誤。

---

## TASK.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# TASK.md — NOI↔ITR 關聯辨識與返回流程審閱

TASK_ID: NOI-ITR-UX-2026-001
狀態：已交辦，待 Claude 執行。本批為純審閱，不修改產品程式碼。

## GOAL
在自建隔離環境裡，實際操作 NOI 列表／詳情，確認使用者能否：(a) 辨識一筆 NOI 關聯了哪些
ITR（尤其複驗 ITR）；(b) 從 NOI 找到正確的那筆 ITR 紀錄；(c) 看完 ITR 後能順利返回原本的
NOI 操作流程。另外核對「載入中」「無關聯資料」「載入失敗」三種狀態畫面上是否容易區分。

## SCOPE
1. 先讀 BACKLOG 與既有交接文件，避免重做。
2. 建立三種 NOI 情境（無 ITR／一筆正常 ITR／複驗 ITR）。
3. 實際操作審閱（不是純讀碼）：辨識關聯 ITR、找到正確紀錄、返回原流程、三種載入狀態區分。
4. 最多提出兩項最影響操作的問題，分類為已重現缺陷/純UX建議/待確認業務規則。
5. 不修改產品。

（完整 ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/CLAUDE_PRECHECK 逐字原文見本次
對話記錄，要點已於上方摘要中保留。）
```

## STATUS.md（原文，節錄關鍵段落；完整原文已在本次對話中逐字記錄）

```markdown
# STATUS.md — Claude 執行結果

TASK_ID: NOI-ITR-UX-2026-001

## RESULT
- [x] DONE

純審閱完成。本批未修改任何產品程式碼，發現的兩項缺陷皆只回報、未動手修。

發現兩項已重現的缺陷：
1. 點擊 Related Documents 裡的 ITR，不開啟該筆紀錄，而是跳到未篩選的 ITR 總清單——根因：
   RelatedDocuments.tsx 的 handleOpen 預設分支只做 navigate('/itr')，不帶 id；
   NOIDetailModal.tsx 呼叫時未傳入 onOpen 覆寫這個預設行為。
2. 複驗 ITR 與原始 ITR 在清單裡標題完全相同，無從一眼分辨——根因：create_reinspection()
   逐字複製 subject/description；related_service.py 顯示 ITR 時沒有把既有的
   isReInspection 欄位納入 title 或回傳資料。

已確認不重複：BACKLOG #32 已記錄 ITR/NCR 自己的關聯面板缺邊，本輪未重複回報。

未完成的觀察項（誠實記錄）：三種載入狀態的視覺區分僅讀碼確認，未透過實際延遲網路請求的方式
在畫面上重現並截圖；返回流程只說明點擊後跳到 /itr 清單、沒有返回連結，未實際操作瀏覽器
返回按鈕驗證。

（完整 CLAUDE_PRECHECK/審閱結果/FILES_CHANGED/FILES_ADDED/RISKS/SAFETY_CHECK 段落逐字
原文已在本次對話中完整記錄，未刪減、未修改，僅因封存檔篇幅在此節錄關鍵結論。）
```

---

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查

TASK_ID: NOI-ITR-UX-2026-001
審查日期：2026-10-03

## EVIDENCE_CHECK
已讀 TASK、STATUS、handoff，核對 RelatedDocuments.handleOpen、NOIDetailModal 的呼叫位置與種子關聯欄位，查看複驗關聯面板截圖。本審查未重跑隔離環境或瀏覽器；手動操作與拆除結果引用執行者紀錄。

1. 導航發現成立：呼叫端沒有 onOpen，預設 navigate 只傳模組路徑，不傳紀錄 id，與回報吻合。保留為已重現導航缺陷，後續修正仍須驗證實際 deep-link 及返回行為。
2. 畫面確實顯示兩筆同名 ITR，文件編號／狀態／日期仍可區分，缺少明確複驗標示。這支持「已觀察到的 UX 辨識改善」，不足以把複製標題本身稱作功能錯誤。不得從同名或編號大小推定原始／複驗關係，後續標示須用既有關聯欄位。
3. STATUS 明確承認 loading/error 僅讀碼，沒有實機截圖，未滿足 ACCEPTANCE_CRITERIA 3。誠實揭露限制值得保留，但不等於該要求已完成。
4. 返回流程只有「沒有返回連結，所以得重搜」的推論，未提供瀏覽器返回後的 URL、來源 NOI 視窗狀態與操作證據。沒有應用內返回按鈕不能排除瀏覽器歷史可以返回。

## SCOPE_CHECK
本批為純審閱，沒有要求實作產品修正。允許新增種子腳本不等於修改產品邏輯。本審查只修改 REVIEW.md，未操作服務、資料庫或使用者環境。

## DECISIONS_CHECK
未核准新業務政策。兩項建議的實作方案尚未驗證，不能把加 openId 當成返回流程已解決。保留既有授權、資料範圍、未保存變更保護；本輪不改產品。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED
兩項觀察有價值，但本批原定的載入狀態與返回流程驗收尚未完成，DONE 不成立。

## REQUIRED_FIXES
### R1 — 補載入狀態的實際操作
在自建隔離環境針對 Related Documents 請求，分別以延遲與模擬失敗驗證 loading/error 畫面，與既有 empty 情境比較，截圖記錄文字及是否誤顯示空資料。明確標示模擬條件，不冒稱真實後端拒絕。解除攔截後用現有方式重新載入確認恢復即可；不要求新增重試功能。無需重跑整條業務鏈。

### R2 — 補返回操作並校正分類
沿用已重現的 NOI→ITR 清單導航，實際操作瀏覽器返回，記錄 URL、能否回到原 NOI／是否重新開啟同筆視窗、還需哪些操作；如需手動從 ITR 清單開啟目標再關閉，也明確記錄。若導航缺陷使預期的自動開啟／關閉鏈无法執行，標示被該缺陷阻斷，不推測結果。
將第二項分類為 UX 辨識改善（已觀察），保留第一項導航缺陷；不得把同名標題本身當資料錯誤。修正「只能重搜」等未驗證敘述。

## NEXT_STEP
封存本輪文件，建立 NOI-ITR-UX-2026-002，只補 R1/R2 的操作證據與文件。不要再找第三項、不要重做已完成情境或改產品。完成後交回審查，不 commit/push/部署，不操作使用者環境。
```
