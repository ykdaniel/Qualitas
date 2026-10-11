# MEETING-FIX-2026-001 — REVIEW

審查者：獨立 Claude 審查代理（GPT 審查暫停，依協調看板規則 6）。只讀審查，未改檔。

## R1：REVISE
1. 【必改】只有建立權限的帳號（無 `meeting:update:all`）新建 Published／Void＋行動項目：新流程先存 Draft、最後 `PUT {status}` 會 403，會議永遠卡在 Draft，提示卻說按儲存可完成（HEAD 此情境成功）。
2. 【建議】retry 時會議編號由 store 反查，清單被換掉時可能為空，會建出 `sourceReferenceNo: ''` 的孤兒 Follow Up。
3. 【建議】前端每次都送 rev，後端 `'rev' in d` 幾乎恆真，其他 IntegrityError（外鍵等）會被誤報為 rev 重複。
4. 【建議】`handleSave` 未清除舊的未完成提示，失敗時與錯誤 toast 並存。
5. 【建議】英文介面用全形分號；狀態名稱未翻譯。
6–9 資訊：eslint `set-state-in-effect` 在 MeetingMinutes.tsx 深連結 effect 新浮現（該 effect 未改，OBS 同寫法同錯，行為無退步）；未完成存檔後關閉會出現未存提示（合理）；深連結開啟後作廢不回上一頁（既有）；測試隔離正確。

## R2：PASS
1–5 均已修正並核對（只有建立權限＋只帶行動項目時恢復 HEAD 一步建立；編號補取、取不到不建；後端只在 rev 變更時轉 400；先清提示；分隔符與狀態依語系）。tsc 乾淨。
不擋 PASS 的提醒：只有建立權限的帳號在 Published 建立後若某行動項目失敗，表單唯讀、無法按儲存，提示文字會誤導；已記入 STATUS「已知限制」。
