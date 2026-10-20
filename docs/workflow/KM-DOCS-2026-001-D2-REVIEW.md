# REVIEW.md — 審查結果

TASK_ID: KM-DOCS-2026-001-D2
ROUND: R1 **REVISE** → 修正後 R2 **PASS**（2026-10-20，同一獨立審查代理人，唯讀；worktree km-d2，基準 608c14c4）

## R1 發現與處置
| # | 發現 | 處置 |
|---|---|---|
| P1-1 | 編輯資料（與設為現行）對話框遇 409 時，「重新載入這筆」只重載文件、對話框不關，舊輸入搭配新的 row_version 再送出會直接覆蓋他人修改。 | **已修**：`DocumentDetail.reloadAndReopen` 先關對話框→重載→以新版重開（同 OSD／NOI 的 reloadAndReopen）；兩個對話框另加 `key={doc.row_version}`。**預覽實測**：開對話框輸入→後端另一筆寫入→儲存 409→「重新載入這筆」→確認捨棄→對話框以對方的新值重開。 |
| P2-1 | `fetchOne` 未清掉前一份文件、未丟棄舊回應：載入新文件期間畫面與按鈕仍屬舊文件。 | **已修**：store 以 `currentRequest` 丟棄舊回應並先清掉他文件；詳情頁在 `doc.id !== documentId` 時只顯示載入中。 |
| P2-2 | 下載未 catch，失敗無訊息。 | **已修**：統一經 `download()`／PdfViewer catch → toast「檔案下載失敗」。 |
| P2-3 | 新版次對話框選了合法檔再選不合法檔，input 顯示新檔、state 留舊檔。 | **已修**：不合法時清空 input 並把 state 設 null。 |
| P3-1 | `KM.tsx` 由 CRLF 變 LF。 | **已修**：二進位寫回 CRLF，diff 只剩 +15／−5。 |
| P3-2 | CSS module 的 `.disabled` 被 hash，字面字串不生效。 | **已修**：改用 `styles.disabled`。 |
| P3-3 | 版次列「設為現行」未預選該版次。 | **已修**：`SetCurrentDialog initialVersionId`（只在可選時預選）。 |
| P3-4 | 無輸入的動作多一次「捨棄輸入」確認。 | **已修**：封存／解除封存／設為現行加 `reloadDiscardsInput: false`。 |
| P3-5 | 對話框無 role／aria、關閉鈕 aria-label 未翻譯。 | **已修**：`role="dialog"`、`aria-modal`、`aria-labelledby`，關閉鈕用 `t('common.close')`。 |
| P3-6 | 後端 `delete_document` 未限範本只管理員可刪。 | **不在本批**（後端）；列為後續，見 STATUS。 |

## R2（複核）
七項 P1–P3 逐項確認；無新的阻擋問題。附帶：reloadAndReopen 重開時不重新檢查 editable／locked，若期間被封存，後端以 409 拒絕並顯示拒絕對話框，影響可忽略。單元測試 239 passed、tsc 0。
