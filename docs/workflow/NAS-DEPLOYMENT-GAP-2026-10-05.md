# NAS 部署落差調查（2026-10-05）

目的：記錄這次嘗試部署 ITR/NOI 匯出 Word 功能到 `qualitas.rokusumi.net` 時，發現 NAS 正式環境
跟本機工作目錄之間的落差，供之後排時間正式處理遷移時參考。**本次調查全程只做唯讀查詢
（`diff`/`git log`/`git status`/`ls`），沒有對 NAS 做任何寫入或覆蓋。**

## 背景
使用者要求部署這次新做的 ITR/NOI Word 匯出功能。原計畫是「只複製這個 session 改過的 10 個檔案到
NAS」，但查核後發現這個做法會讓後端直接 import 失敗，因為新程式碼依賴的模組在 NAS 上根本不存在。

## NAS 現況
- 掛載路徑：`/Volumes/docker/Qualitas`（SMB 分享 `docker`，NAS 位址 192.168.15.100）。
- NAS 上也是同一個 git repo（`origin` = `github.com/ykdaniel/Qualitas.git`），但在 `master` 分支
  （本機工作用的是 `ui/sidebar-shell-preview`），最新 commit 是很久以前的
  `526ea29a "chore: snapshot before data entry - full codebase sync"`。
- NAS 工作目錄自己有 1952 個相對於這個舊 commit 的改動——但比對後發現這些**不是 NAS 獨有的改動**，
  而是因為過去部署習慣是「整批同步後沒有重新 commit」，所以 NAS 的實際檔案內容比它自己的 git
  歷史新，但仍然遠遠落後本機工作目錄的最新狀態。

## 關鍵發現：NAS 缺少的核心模組
直接比對 `backend/core/` 目錄（跟 git 歷史無關，純比檔案是否存在/內容是否相同），NAS 上
**完全沒有**以下檔案：
- `core/startup_guard.py`（本機這整個 session 用來防止誤觸使用者/正式資料庫的安全機制）
- `core/uploads.py`（這次 ITR/NOI 匯出 Word 功能直接依賴這個模組讀取上傳檔案路徑）
- `core/strict_dates.py`
- `core/attachment_access.py`
- `core/assignees.py`
- `core/ncr_photo_evidence.py`

`backend/routers/`、`backend/services/`、`backend/repositories/` 底下**每一個檔案**跟本機版本都
不同（不是部分檔案，是全部）。這代表 NAS 跑的是明顯更舊一代的架構，不是落後幾個檔案的程度。

## 已知的安全性相關落差
比對 `backend/routers/itr.py` 時發現，本機已經有、但 NAS 上**沒有**的內容包含：
- `_require_itr_approve_permission()`——核准權限強化（2026-09-19 補上的修正）：防止只有
  `ITR_UPDATE` 權限（沒有 `ITR_APPROVE`）的使用者，透過一般編輯/批次更新路徑直接把 ITR 狀態改成
  Approved，繞過核准權限。
- Approval History／Revoke Approval 整組端點（`GET /{itr_id}/approval-events`、
  `POST /{itr_id}/revoke-approval` 等）。
- 多處 `ScopeForbidden` 例外處理（資料範圍保護）。

**也就是說，正式環境目前可能存在一個已經在本機修好、但還沒上線的權限繞過風險**——持有編輯權限但
沒有核准權限的使用者，理論上可能透過批次更新端點直接把 ITR 核准掉。這點值得優先確認、提高遷移的
急迫性，但不代表今天就該臨時處理（遷移本身需要完整規劃，見下方）。

## 為什麼不能只複製這次改的 10 個檔案
這次新寫的 `backend/services/itr_service.py`／`noi_service.py` 的 `export_docx()` 直接
`from core.uploads import upload_root` ——NAS 上沒有這個模組，複製過去會讓整個後端 import 失敗、
無法啟動。同樣地，`routers/itr.py`／`routers/noi.py` 依賴的其他 service 層函式、`core.scope` 的
`Scope`／`ScopeForbidden`、`core.perms` 的權限常數等，NAS 版本的對應檔案也都是舊版，介面不保證
相容。

## 建議的處理方式（供之後排時間參考，本次未執行）
1. **這是一次完整的版本遷移，不是補幾個檔案**——需要把 `backend/`、`react-app/` 整批同步過去，
   同時完全保留 NAS 上的 `qualitas.db`、`uploads/`、`backups/`、`logs/`（這些是正式資料，不是
   程式碼，絕對不能被覆蓋）。
2. **需要先確認資料庫 migration 是否相容**——`db_migrations.py` 在本機也已經往前推進很多，同步
   程式碼後第一次啟動勢必會觸發遷移，執行前應該先備份 NAS 上現有的 `qualitas.db`。
3. **需要重新核對 `docker-compose.yml`／`nginx.conf`／環境變數**——NAS 上這幾個檔案本身可能有
   NAS 專屬設定（例如 `CLOUDFLARE_TUNNEL_TOKEN`），同步時不能被本機的開發用版本覆蓋掉。
4. **建議抓一個專門的時段執行，不要在臨時對話中順手做**，執行時最好先在隔離環境（這個 session
   整個過程一直在用的 `isolated_stack.py`）驗證遷移後的程式碼能正常跑過一輪關鍵流程，再動 NAS。

## 本次實際做的事
- 確認了落差存在，並記錄下來（本文件）。
- 已將 SMB 分享卸載（`diskutil unmount /Volumes/docker`），NAS 現況未受任何影響。
- ITR/NOI 匯出 Word 功能本身已經在本機 commit（`ui/sidebar-shell-preview` 分支，commit
  `6fff14f8`），等之後完整遷移時會一併上線。
