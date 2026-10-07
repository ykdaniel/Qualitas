# DECISIONS.md — 不能亂改的技術決策

> 記錄已經拍板、任何 AI 工具都不得未經使用者同意就變更的技術決策。
> 與 `AGENTS.md`（命名/結構等執行層規則）和 `CONSTITUTION.md`（工程思維框架）不同，
> 本文件記錄的是**具體、一次性、已經權衡過的選擇**——理由通常來自業務限制或過去的教訓，
> 不是可以憑「更好的做法」自行推翻的通用規範。
>
> **本文件長期保留，不隨任務覆寫。** 只做新增／修改（維持仍然有效的決策），
> 這點與 `TASK.md`／`STATUS.md`／`REVIEW.md` 每輪整份覆寫不同——那三份只反映最新一輪任務，
> 本文件反映的是目前所有仍然有效的架構/資料庫/認證/錯誤格式/不可變更業務規則等決策。
>
> 新增決策時，附上日期與理由；理由是未來判斷這條決策是否還適用的依據。
> 若某條決策已經過時（例如支撐它的架構已經整個替換），先跟使用者確認再移除，
> 不要自行刪除；確認後標記為「已作廢」並保留日期，不要直接刪掉整條。

---

## 格式

```
### <決策標題>
日期：YYYY-MM-DD
決策：<具體內容>
理由：<為什麼這樣選，通常是業務限制、過去事故、或已權衡過的 trade-off>
影響範圍：<牽涉的模組/檔案>
```

---

## 目前生效的決策

以下由既有會話中已確認的政策補錄；日期為補錄日期，並非臆測的原始裁決日期。未列出的既有使用者指示不因此失效，程式現況也不自動等於業務政策。

### ITP 核准與作廢授權
日期：2026-09-30（補錄）
決策：Approved 與 Approved with comments 同屬核准授權範圍。建立為任一核准狀態、更新進入任一核准狀態（含兩者互換）需 itp:approve:all；建立為 Void 或轉入 Void 需 itp:void:all。同狀態原值重送、離開核准狀態與一般欄位編輯不額外要求 approve；基本 create/update、資料範圍與合法狀態轉換仍須通過。
理由：使用者已確認核准家族及授權邊界，避免一般更新繞過核准權限。
影響範圍：ITP 前後端授權、狀態選單、Publish。此決策不表示兩個核准狀態互換必然是合法轉換，也不定義 Approved with comments 的後續業務門檻。
依據：本會話「政策確認記錄」；實作核對 backend/services/itp_service.py。

### 附件沿用 update 權限（方案 A）
日期：2026-09-30（補錄）
決策：附件上傳維持對應模組 update 權限，不因帳號可 create 或紀錄剛建立就新增例外。ITP create-only 可建立主資料與檢驗計畫；附件交由具備 update 權限者處理，前端事先限制並說明。
理由：已確認維持既有共用授權邊界，不跨模組擴權。
影響範圍：共用附件上傳授權與 ITP 附件入口。
依據：本會話「附件上傳沿用方案 A」確認紀錄；實作核對 backend/routers/file_router.py。

### ITR 複驗不得直接由 Approved／Void 發起
日期：2026-09-30（補錄）
決策：Void 禁止複驗；Approved 必須先走既有 Revoke Approval 回到 In Progress，再依既有複驗條件判斷。前後端均須把關，不新增旁路。
理由：本會話已授權實作，並完成後續雙方驗證，保留核准撤回與作廢的既有邊界。
影響範圍：backend/services/itr_service.py 的 create_reinspection 與 ITR 前端複驗入口。
依據：本會話 ITR 複驗限制完成回報，以及 docs/workflow/itp-checklist-itr-chain-walkthrough-2026-09-29-handoff.md 第十二節。

### ITR 內嵌 Checklist 表格窄螢幕排版：保留橫向捲動，不拆成堆疊/卡片
日期：2026-10-04
決策：ChecklistSnapshotModal.tsx 的 Items 表格（# / Item / Criteria / Situation / Result 五欄）
在窄螢幕（含 375px）維持現有的表格結構與欄位橫向排列，不因應窄螢幕拆成逐欄堆疊、也不做成獨立卡片。
使用者已明確比較過「堆疊卡片」「連續清單」兩種替代方案後拒絕，確認要保留五欄表格的閱讀方式；窄螢幕
下 Situation／Result 需要在表格自己的框內橫向捲動才會出現，這是**確認過的設計**，不是待修正的呈現
缺陷。
理由：使用者判斷堆疊/卡片排版不符合實際使用與閱讀習慣（逐列橫向掃視比對 Item/Criteria/Situation/
Result 的既有操作方式比拆開成縱向區塊更直覺）。
影響範圍：react-app/src/components/ITR/ChecklistSnapshotModal.tsx 的 Items 表格排版；相關驗收改為
用真實互動（捲動進表格、點擊、輸入、存檔）證明該欄位在橫向捲動後確實可操作，而非僅憑
`isVisible()`／整頁 `scrollWidth` 這類不證明實際可用性的斷言。
依據：本次對話使用者看過卡片版與連續清單版兩個視覺方案後明確回覆「不要做成卡片」「保持原本的」，
並在後續問題中選擇「接受表格內橫向捲動（現狀）」。

## 尚未決策（不得當成已核准規則）

- ITR 核准是否須額外檢查 Inspection Result。
- PQP 與 ITP／NOI／ITR 是否新增前置關卡。
- Approved with comments 是否限制後續作業，以及 NOI／Generate Checklist 是否要求 ITP 已核准。

翻譯與 NCR 照片 UX 目前延期屬任務排程，不是永久禁止；後續 TASK 應沿用使用者當時指示。
