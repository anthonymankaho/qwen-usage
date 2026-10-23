# Qwen Usage — Token Plan quota in the VS Code status bar

A tiny, dependency-free VS Code extension that shows your **Qwen Cloud Token Plan** quota in the status bar — the same place the Codex extension shows its usage badge — and refreshes it on a timer, on window focus, and on VS Code start.

繁體中文：一個零依賴的 VS Code 擴充功能，把 Qwen Cloud Token Plan 配額顯示在狀態列，並依定時器／視窗焦點／啟動時自動刷新。操作步驟見 [SETUP_SOP.md](SETUP_SOP.md)。

```
☁ Qwen 75.8% · 19,320 left · resets Nov 14
```

Hover for the full picture (plan tier, remaining %, credits, days left, reset & expiry dates, last update); click to refresh now; the badge turns orange below a configurable low-quota threshold and red when authentication fails.

## Why this design (there is no usage API)

Qwen Cloud publishes **no public usage API**. The console page itself composes the badge from several internal, session-cookie-authenticated endpoints:

| Endpoint | Provides |
| --- | --- |
| `.../tokenplan/personal/api/v2/usage` | `per1MonthPercentage` (used ratio), `per1MonthResetTime` |
| `.../tokenplan/personal/api/v2/subscription` | `specCode`, `remainingDays`, instance `endTime` |
| `.../tokenplan/personal/api/v2/quota-config` | tier catalogue (`essential.monthly` etc. → plan total) |
| `BssOpenApi.QueryAvailableInstances` | instance end time (expiry fallback) |

This extension does what the console does: it **replays captured HTTP requests** (one per line, from a cURL file) and **merges** the parsed responses. The response shapes are undocumented, so `usage-parser.js` classifies leaf keys by name patterns instead of fixed JSON paths — it survives most console renames, and `har-to-curl.js` lets you re-learn the shape from a fresh HAR export in seconds.

The approach follows what the open-source [CodexBar](https://github.com/steipete/CodexBar/blob/main/docs/qwen-cloud.md) does for menu-bar apps, packaged for VS Code.

## Install

1. Copy (or clone) this folder to `%USERPROFILE%\.vscode\extensions\qwen-usage`
2. In VS Code: `Developer: Reload Window`
3. The badge appears as `☁ Qwen —`; click it for setup options.

Full walkthrough with expected outputs: **[SETUP_SOP.md](SETUP_SOP.md)**.

## Quick setup (summary)

1. Open the [Token Plan page](https://home.qwencloud.com/analytics/token-plan/individual?region=ap-southeast-1) logged in → `F12` → **Network** → filter `tokenplan` → click the page's refresh icon.
2. Right-click the request list → **Copy all as cURL (bash)** — these lines carry your session cookie.
3. Save them (one per line) to a **private** file, e.g. `~/.qwen-usage/qwen-curl.txt` — keep it off synced folders (OneDrive/Dropbox/Desktop-with-autosync).
4. Set `qwenUsage.curlFile` to that path (or paste the lines into `qwenUsage.curl`).
5. Done — the badge lights up within a second and refreshes hourly after that.

Alternative for the curious: export a HAR (**Save all as HAR with content**) and run `node har-to-curl.js <file>.har` — it decodes the responses, shows the merged parse, and generates the curl file for you (then add the cookie manually once; HAR exports sanitize cookies out).

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `qwenUsage.curlFile` | `""` | Path to a file whose lines are cURL commands to replay |
| `qwenUsage.curl` | `""` | Inline cURL commands (one per line), merged with the file |
| `qwenUsage.extraHeaders` | `{}` | Headers merged into every request, e.g. `{"cookie": "..."}` |
| `qwenUsage.pollMinutes` | `30` | Background refresh interval |
| `qwenUsage.dashboardUrl` | token-plan page (SG region) | Target of *Open Token Plan Dashboard* |
| `qwenUsage.lowPercentThreshold` | `15` | Warning color below this remaining % |

## Cookie renewal (every few weeks)

Session cookies die; the badge shows red with an explanatory tooltip. Renew: DevTools → copy fresh `tokenplan` cURLs → replace the file → click the badge. Details in [SETUP_SOP.md](SETUP_SOP.md) §5.

## Development

No build step, no dependencies — plain CommonJS.

```
node test.js          # 14 unit tests for the parsers (incl. real captured shapes)
node har-to-curl.js x.har   # inspect a HAR: which entries carry quota, merged parse, curl file output
```

Files: `extension.js` (badge + poll + merge orchestration), `curl-parser.js` (DevTools cURL → request), `usage-parser.js` (shape-agnostic quota extractor + merger), `har-to-curl.js` (offline HAR analyzer).

## Security notes

- The cURL file and `settings.json` contain your **live session credentials**. Never commit them, never paste them into chats/forums, and store the curl file outside any synced folder.
- This tool only *reads* usage endpoints with your own session; it performs no state-changing calls.
- If a credential ever leaks into a log or chat, log out of Qwen Cloud (invalidates the ticket) and renew.

## License

No license file yet — all rights reserved by default. Open an issue if you'd like a specific one.
