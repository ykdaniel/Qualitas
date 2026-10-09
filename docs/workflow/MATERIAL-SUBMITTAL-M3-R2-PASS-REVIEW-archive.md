# MATERIAL-SUBMITTAL-M3 — REVIEW

TASK_ID: MATERIAL-SUBMITTAL-M3-2026-001
ROUND: R2
REVIEW_DATE: 2026-10-08

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

本次獨立審查未發現阻擋 R1–R3 補正驗收的問題。PASS 限於 M3 前端補正範圍，不是後端、手機或部署驗收，也未執行 M4。

## 審查範圍
依本次使用者轉交的 R2 審查要求，核對 M3 TASK、DECISIONS、R1 REVISE 與 R2 STATUS／handoff、元件及實際服務呼叫。根目錄仍屬 DEPLOY-EXEC，未覆寫。R1-REVISE 四份封存存在；TASK 與 R1 TASK 封存逐字相同。未取得上一輪其他文件封存前的獨立副本，因此不另聲稱已獨立證明其逐字封存。

## REQUIRED_FIXES 核銷
- **R1 已解決**：父元件使用 `key={rev.id}` 隔離版次 state；新實例初始清單為 null、隱藏上傳操作；effect 與寫入後 load 都以同一 gate 排除較舊 GET。版次內 reloadToken 變更不再無必要地清空清單。
- **R2 已解決**：讀取錯誤與 writeNotice 分離，loaded 不清除寫入提示。上傳／刪除拒絕與結果未知有不同訊息，dismissNotice 或新寫入才清提示。
- **R3 已解決**：save 與 retry-result 都呼叫 save；pending 新文件先上傳，成功後清 pending 與檔案欄位，再送結果。未知結果禁止選檔與重送，確認已保存後移除選檔入口。

## 獨立執行證據
`MATERIAL-SUBMITTAL-M3-evidence/reviewer-r2-checks.txt`：
- npm test：156 pass、0 fail，EXIT 0。
- TypeScript noEmit：EXIT 0。
- ESLint（MaterialSubmittal 元件、附件純函式與其測試）：EXIT 0。
- Vite build（獨立暫存輸出）：EXIT 0。
- r2-file-hashes.txt 所列 19 個檔案均 MATCH，含 LanguageContext.tsx。雜湊一致表示來源符合交接，並非額外的功能驗收。

`reviewer-r2-components.cjs`／`reviewer-r2-components.txt`：EXIT 0。
- 執行實際 TSX 轉譯後的元件 callback，使用模擬 hooks／API；不是瀏覽器測試，不驗證 React DOM 排程、視覺或後端。
- R1：分開掛載 A／B，B 回應後才放行 A；B 仍顯示 B 附件。B 載入時沒有附件上傳入口；同版次兩次 reload 逆序完成仍保留新回應。
- R2：實際上傳 callback 遭拒／結果未知、刪除 callback 遭拒，GET 成功後提示仍在；按知道了才清除。
- R3：實際流程依序 upload(A) → result rejected → 選 B → retry → upload(B) → result，A 不重送、成功回呼只一次。
- 結果及重讀均失敗時，選檔和儲存停用、保留重新確認入口。
- probe 初次執行曾因測試替身漏提供檔案 URL helper、未識別 Notice 的 testId 而失敗；補齊測試替身後通過，未修改產品程式。

## 交接證據與限制
已閱讀實作者 `r2-browser-acceptance.txt` 的延遲回應、載入、寫入提示、新文件重試及四種保存情境紀錄。此次未重啟隔離服務或親自重跑瀏覽器；該紀錄是實作者的瀏覽器證據，不冒充本次獨立瀏覽器實測。純函式單元測試不足以單獨證明 callback 串接，因此另以實際元件 probe 補驗。

手機延期、文件編號設定分頁另案、Python 3.11 部署前驗證、最新後端全套未重跑等限制維持。未接觸開發資料庫及 8240／3240、8198／3198，未提交／推送／部署。

## NEXT_STEP
M3 R2 可結案；後續 M4 需另立 TASK／STATUS／REVIEW，保留本輪紀錄。本審查不啟動 M4 或部署。
