# OPTIMISTIC-LOCK-2026-001 — 全模組樂觀鎖：B1（後端＋store）

- **TASK_ID**：OPTIMISTIC-LOCK-2026-001（本輪＝B1）
- **來源**：BACKLOG #3。使用者 2026-10-18 同意「依建議的改」，經協調中心「主要調度」派工；五項決定同日經協調中心轉達（DESIGN 第 8 節、DECISIONS「存檔的樂觀鎖：row_version」）。
- **基準**：6f68c768。工作樹 scratchpad/ol-b1（detached）。
- **檔案清單**：協調中心 2026-10-18 照准，可以開工。
  - itrStore.ts 由本工作階段獨佔，CRLF 用二進位方式保留。
  - models.py、db_migrations.py、schemas.py、core/、services/ 與所有 store，到提交前都歸本工作階段。
  - ITR 工作階段（ATTACH-SECTION-UX）改 CollapsibleSection、新的 CSS module、ITRModals.tsx、LanguageContext，與本批沒有重疊。

## 範圍（B1）
1. **後端核心** `core/concurrency.py`：
   - `claim_row_version`：一句條件式 UPDATE，同時比對版本並加 1；比對失敗時回 Refusal VERSION_CONFLICT {docType, number}。
   - `bump_row_version`：只加 1，不比對、不記 log。
2. **409**：`core/refusals.refusal_http` 遇到 VERSION_CONFLICT 一律回 409。
3. **欄位**：19 張表加 `row_version INTEGER NOT NULL DEFAULT 0`，含 models、遷移、讀取 schema 與更新 schema。KM 沿用 `version_no`。
4. **遷移**：
   - 第 31 步接在第 30 步之後、在檔尾註冊：ITR 的 `detail_data._version` 只帶入一次；值不是非負整數就當 0。
   - 加欄位的動作提前到第 3 步之後執行（31a），因為之後的步驟會用 ORM 讀這些表。
5. **各模組存檔改用 claim**，第 1.4 節列出的次要寫入也一併處理。
6. **缺版本**：放行、照樣加 1，並記一筆固定前綴的 warning：`row_version missing: <table> <id>`（協調中心要求 2，用來在 B5 前統計）。
7. **前端（只動 store 和 api，不動視窗）**：
   - normalize 保留 row_version，存檔後回寫。
   - **只有呼叫端明確傳入時才送版本**；payload 裡夾帶的 row_version 一律丟掉。
8. **測試**：
   - HTTP 併發、兩個 session 的原子性、缺版本放行、次要寫入、遷移。
   - 前端單元測試。
9. **預覽**：協調中心要求 3：B1 沒有任何畫面改變，改為在隔離環境跑一次 HTTP 併發示範，紀錄附在 STATUS，不必請使用者看畫面。

## 不在本批
- 各模組視窗送出版本、409 後的「重新載入這筆」按鈕（B2／B3；ITR 視窗在 B4）。
- 把版本改為必填（B5）。
- 命名規則、KPI 權重（使用者決定不做）。

## 完成條件
1. HTTP 併發測試、兩個 session 的原子性測試。
2. 獨立審查 R1。
3. 3.11 全套測試。
4. 用臨時 GIT_INDEX_FILE 在本地提交，把 hash 和指紋交給協調中心；不推送、不動 ref。
