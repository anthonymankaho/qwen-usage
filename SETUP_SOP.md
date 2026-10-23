# Qwen Usage — Setup & Operation SOP（設定與維運標準作業程序）

Audience: the person installing/maintaining the badge on their own Windows + VS Code + Edge/Chrome setup.
適用對象：在自己的 Windows＋VS Code＋Edge/Chrome 環境安裝與維護徽章的人。

Conventions / 慣例:
- `~` = your Windows user profile (`C:\Users\<you>`)
- Expected outputs are quoted; if yours differs, see §6 Troubleshooting / 預期輸出有引號；不符請看 §6 疑難排解

---

## 1. Install the extension / 安裝擴充功能

1.1 Get the code / 取得程式碼:
- From this repo: `git clone <repo-url> "%USERPROFILE%\.vscode\extensions\qwen-usage"`
- 或從 repo 頁面 Code → Download ZIP，解壓到 `%USERPROFILE%\.vscode\extensions\qwen-usage`

1.2 Verify the folder contains / 確認資料夾包含: `package.json`, `extension.js`, `curl-parser.js`, `usage-parser.js`, `har-to-curl.js`, `test.js`, `README.md`, `SETUP_SOP.md`

1.3 In VS Code: `Ctrl+Shift+P` → **Developer: Reload Window**

1.4 Expected: right side of the status bar shows `☁ Qwen —`. Clicking it offers setup options.
預期：狀態列右側出現 `☁ Qwen —`；點它會提供設定選項。

## 2. Capture your replay commands / 擷取重放命令

2.1 Open https://home.qwencloud.com/analytics/token-plan/individual?region=ap-southeast-1 and log in.
開啟上述網址並登入。

2.2 Press `F12` → **Network（網路）** tab → in the filter box type `tokenplan`.
按 `F12` → **Network（網路）** 分頁 → 篩選框輸入 `tokenplan`。

2.3 Click the page's ⟳ refresh icon next to "Last updated" — about 4 rows appear (`...v2/subscription`, `...v2/usage`, `...v2/quota-config`, `...v2/addon/list`).
點頁面 "Last updated" 旁的 ⟳——出現約 4 列。

2.4 Right-click the request list → **Copy（複製）→ Copy all as cURL (bash)（全部複製為 cURL (bash)）**.
右鍵請求清單 → **Copy → Copy all as cURL (bash)**。

2.5 Self-check / 自查: paste into a text editor — each line must start with `curl 'https://` and contain `-H 'cookie:`. If no `cookie:` appears, you copied URLs only; repeat 2.4.
貼到文字編輯器自查：每行應以 `curl 'https://` 開頭且含 `-H 'cookie:`。沒有 `cookie:` 就是只複製到 URL，重做 2.4。

## 3. Place the credential file (private!) / 放置憑證檔（必須私有！）

3.1 Create `~\.qwen-usage\` and save the lines there as `qwen-curl.txt`, one per line.
建立 `~\.qwen-usage\`，把各行以每行一條存成 `qwen-curl.txt`。

3.2 Why there / 為什麼放這: `~\.qwen-usage` is outside OneDrive/Dropbox-synced folders. **Never** store this file on an auto-synced Desktop or in any repo.
`~\.qwen-usage` 不在 OneDrive/Dropbox 同步範圍。**絕不可**把此檔放在自動同步的桌面或任何 repo。

## 4. Point VS Code at it / 設定 VS Code 指向

4.1 `Ctrl+,` → search `qwenUsage` → **Curl File** → enter `C:\Users\<you>\.qwen-usage\qwen-curl.txt`
（或直接編輯 settings.json：`"qwenUsage.curlFile": "C:\\Users\\<you>\\.qwen-usage\\qwen-curl.txt"`）

4.2 Optional / 可選: `"qwenUsage.pollMinutes": 60`.

4.3 Expected within ~1 second / 預期一秒内: badge changes to e.g.
`☁ Qwen 75.8% · 19,320 left · resets Nov 14`
Hover shows plan tier, remaining %, credits, days left, reset/expiry, and `Updated: … (curl replay ×3)` — ×3 is normal (the addon line adds no fields / 屬正常，addon 行對合併無貢獻).

## 5. Cookie renewal（每次徽章變紅時執行）

Session cookies expire after days-to-weeks（session cookie 數天至數週後失效）. The badge turns red; tooltip says `HTTP 401 … re-copy`.

5.1 Log in to the console again（重新登入主控台）.
5.2 Repeat §2 → §3 (overwrite `qwen-curl.txt`)（重複 §2 → §3，覆蓋 `qwen-curl.txt`）.
5.3 Click the badge（點徽章刷新）. Expected: numbers return（數字恢復）.

Security note / 安全提醒: if a cookie ever leaked into a chat, log, or screenshot, log out of Qwen Cloud to invalidate it, then renew（若 cookie 曾外洩到對話、記錄或截圖，請登出 Qwen Cloud 使其失效，再重新擷取）.

## 6. Troubleshooting / 疑難排解

| Symptom 症狀 | Check 檢查 | Fix 處置 |
| --- | --- | --- |
| No badge at all 完全沒有徽章 | folder in `~\.vscode\extensions\qwen-usage`? Reload done? | Re-copy folder; `Developer: Reload Window` |
| `☁ Qwen —` forever 永遠顯示 `—` | curlFile path correct? file has `curl ` lines? | Fix path; ensure one command per line |
| Red badge, `HTTP 401/403` | cookie expired or missing | §5 renewal |
| Red badge, `no quota fields` | console changed response shape | Re-export HAR → `node har-to-curl.js x.har` → report/adjust `usage-parser.js` |
| Percent looks wrong 百分比不對 | compare with console page | Remember: `per1MonthPercentage` is the USED ratio; drift between views is real usage |
| Settings UI has no qwenUsage entries | extension not activated | Check `~\.vscode\extensions\qwen-usage\package.json` exists & valid JSON |

Logs / 日誌: `Ctrl+Shift+P` → **Qwen Usage: Show Log** (Output panel) — every response body is logged there; paste it to whoever maintains the parser, minus any cookie lines.

## 7. Verification checklist (first install) / 首次安裝驗證清單

- [ ] `node test.js` prints `all tests passed`（在 repo 資料夾執行）
- [ ] Badge shows `☁ Qwen —` after reload
- [ ] Badge shows live numbers after curlFile is set
- [ ] Tooltip numbers match the console page（提示框數字與主控台頁面一致）
- [ ] Click badge → spinner → updated timestamp（點徽章→轉圈→時間更新）
- [ ] `qwen-curl.txt` lives outside synced folders（不在同步資料夾）
- [ ] No credentials in this repo's git history（`git log -p` 不含 cookie）
